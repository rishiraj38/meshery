package models

import (
	"context"
	"encoding/json"
	goerrors "errors"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/meshery/meshkit/logger"
	mesherykube "github.com/meshery/meshkit/utils/kubernetes"
	controllersconfig "github.com/meshery/schemas/models/v1alpha1/controllers_config"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
)

const (
	// controllersNamespace is where the Meshery Operator deploys the MeshSync
	// and Broker workloads and their custom resources.
	controllersNamespace = "meshery"
	// meshSyncCRName is the MeshSync custom resource the operator chart
	// installs and the MeshSync agent reads its watch-list from.
	meshSyncCRName = "meshery-meshsync"
	// brokerCRName is the Broker custom resource the operator chart installs.
	brokerCRName = "meshery-broker"
	// meshSyncDeploymentName is the Deployment the operator reconciles for
	// the MeshSync CR (same name as the CR).
	meshSyncDeploymentName = "meshery-meshsync"
	// meshSyncContainerName is the MeshSync container within that Deployment.
	meshSyncContainerName = "meshsync"
	// controllersConfigFieldManager is the server-side-apply field manager
	// Meshery Server uses for its Deployment overlay. The operator applies
	// the Deployment under its own field manager and never sets these env
	// names, args, or the restart annotation, so ownership stays disjoint.
	controllersConfigFieldManager = "meshery-server"
	// meshSyncRestartAnnotation triggers a rolling restart of MeshSync pods
	// when its value changes (same mechanism as kubectl rollout restart).
	meshSyncRestartAnnotation = "meshery.io/restarted-at"

	envRedactSecrets      = "MESHSYNC_REDACT_SECRETS"
	envBrokerContentDedup = "MESHSYNC_BROKER_CONTENT_DEDUP"
	envDebug              = "DEBUG"
)

var (
	meshSyncGVR = schema.GroupVersionResource{Group: "meshery.io", Version: "v1alpha1", Resource: "meshsyncs"}
	brokerGVR   = schema.GroupVersionResource{Group: "meshery.io", Version: "v1alpha1", Resource: "brokers"}
)

// ControllersConfigApplyResult reports which propagation targets a
// configuration apply reached on a cluster.
type ControllersConfigApplyResult struct {
	MeshSyncCRPatched        bool     `json:"meshSyncCRPatched"`
	BrokerCRPatched          bool     `json:"brokerCRPatched"`
	DeploymentOverlayApplied bool     `json:"deploymentOverlayApplied"`
	MeshSyncRestarted        bool     `json:"meshSyncRestarted"`
	Skipped                  []string `json:"skipped,omitempty"`
}

// ApplyControllersConfigToCluster propagates the merged (explicitly-set)
// controllers configuration to a cluster running in operator deployment
// mode:
//
//   - MeshSync CR: spec.version, spec.size, spec.watch-list
//   - Broker CR: spec.version, spec.size, spec.service
//   - MeshSync Deployment: env (MESHSYNC_REDACT_SECRETS,
//     MESHSYNC_BROKER_CONTENT_DEDUP, DEBUG) and args (--outputNamespaces,
//     --outputResources) via server-side apply under the meshery-server
//     field manager, so entries withdraw cleanly when unset and the
//     operator's own apply never fights them.
//
// MeshSync reads its watch-list at startup only, so a watch-list change also
// triggers a rolling restart of the MeshSync Deployment. Absent CRs or
// Deployment (operator not deployed yet, or embedded-mode cluster) are
// skipped and reported, not treated as errors: configuration re-applies when
// the connection reconnects.
func ApplyControllersConfigToCluster(
	ctx context.Context,
	log logger.Handler,
	kubeClient *mesherykube.Client,
	merged *controllersconfig.MesheryControllersConfig,
) (*ControllersConfigApplyResult, error) {
	result := &ControllersConfigApplyResult{}
	if kubeClient == nil {
		return result, ErrApplyControllersConfig(k8serrors.NewBadRequest("no kubernetes client available for the connection"))
	}
	if merged == nil {
		return result, nil
	}

	var applyErrs []error

	watchListChanged, err := applyMeshSyncCR(ctx, kubeClient, merged.Meshsync, result)
	if err != nil {
		applyErrs = append(applyErrs, err)
	}

	if err := applyBrokerCR(ctx, kubeClient, merged.Broker, result); err != nil {
		applyErrs = append(applyErrs, err)
	}

	if err := applyMeshSyncDeploymentOverlay(ctx, kubeClient, merged.Meshsync, watchListChanged, result); err != nil {
		applyErrs = append(applyErrs, err)
	}

	if len(applyErrs) > 0 {
		return result, ErrApplyControllersConfig(goerrors.Join(applyErrs...))
	}
	if log != nil {
		log.Debugf("controllers config applied: %+v", result)
	}
	return result, nil
}

// applyMeshSyncCR merge-patches the MeshSync custom resource with the
// explicitly-set fields. It returns whether the watch-list changed as a
// result (which requires a MeshSync restart to take effect).
func applyMeshSyncCR(
	ctx context.Context,
	kubeClient *mesherykube.Client,
	cfg *controllersconfig.MeshSyncConfig,
	result *ControllersConfigApplyResult,
) (bool, error) {
	if cfg == nil || (cfg.Version == nil && cfg.Replicas == nil && cfg.WatchList == nil) {
		return false, nil
	}

	current, err := kubeClient.DynamicKubeClient.Resource(meshSyncGVR).Namespace(controllersNamespace).Get(ctx, meshSyncCRName, metav1.GetOptions{})
	if err != nil {
		if k8serrors.IsNotFound(err) || isNoKindMatch(err) {
			result.Skipped = append(result.Skipped, "MeshSync custom resource not present; watch-list, version, and replica settings apply when the Meshery Operator is deployed")
			return false, nil
		}
		return false, err
	}

	spec := map[string]interface{}{}
	if cfg.Version != nil {
		spec["version"] = *cfg.Version
	}
	if cfg.Replicas != nil {
		spec["size"] = *cfg.Replicas
	}

	watchListChanged := false
	if cfg.WatchList != nil {
		desiredData := map[string]interface{}{"whitelist": nil, "blacklist": nil}
		if len(cfg.WatchList.Whitelist) > 0 {
			encoded, err := json.Marshal(watchListWhitelistWireEntries(cfg.WatchList.Whitelist))
			if err != nil {
				return false, err
			}
			desiredData["whitelist"] = string(encoded)
		}
		if len(cfg.WatchList.Blacklist) > 0 {
			encoded, err := json.Marshal(cfg.WatchList.Blacklist)
			if err != nil {
				return false, err
			}
			desiredData["blacklist"] = string(encoded)
		}
		spec["watch-list"] = map[string]interface{}{"data": desiredData}
		watchListChanged = !watchListDataEqual(current.Object, desiredData)
	}

	if len(spec) == 0 {
		return false, nil
	}

	patch, err := json.Marshal(map[string]interface{}{"spec": spec})
	if err != nil {
		return false, err
	}
	if _, err := kubeClient.DynamicKubeClient.Resource(meshSyncGVR).Namespace(controllersNamespace).Patch(ctx, meshSyncCRName, types.MergePatchType, patch, metav1.PatchOptions{}); err != nil {
		return false, err
	}
	result.MeshSyncCRPatched = true
	return watchListChanged, nil
}

// watchListWhitelistWireEntries converts schema whitelist entries into the
// wire shape MeshSync's config parser expects: {"Resource": ..., "Events":
// [...]} with Go-style field names (meshsync unmarshals into an untagged
// struct).
func watchListWhitelistWireEntries(entries []controllersconfig.MeshSyncWatchedResource) []map[string]interface{} {
	wire := make([]map[string]interface{}, 0, len(entries))
	for _, entry := range entries {
		events := make([]string, 0, len(entry.Events))
		for _, ev := range entry.Events {
			events = append(events, string(ev))
		}
		wire = append(wire, map[string]interface{}{
			"Resource": entry.Resource,
			"Events":   events,
		})
	}
	return wire
}

// watchListDataEqual compares the current CR's spec.watch-list.data with the
// desired data map (string values; nil means absent).
func watchListDataEqual(currentObj map[string]interface{}, desired map[string]interface{}) bool {
	currentData := map[string]interface{}{}
	if spec, ok := currentObj["spec"].(map[string]interface{}); ok {
		if wl, ok := spec["watch-list"].(map[string]interface{}); ok {
			if data, ok := wl["data"].(map[string]interface{}); ok {
				currentData = data
			}
		}
	}
	for _, key := range []string{"whitelist", "blacklist"} {
		currentValue, hasCurrent := currentData[key]
		desiredValue := desired[key]
		if desiredValue == nil {
			currentString, _ := currentValue.(string)
			if hasCurrent && currentString != "" {
				return false
			}
			continue
		}
		currentString, _ := currentValue.(string)
		if !hasCurrent || !jsonStringsEquivalent(currentString, desiredValue.(string)) {
			return false
		}
	}
	return true
}

// jsonStringsEquivalent reports whether two JSON documents encoded as strings
// carry the same value regardless of formatting.
func jsonStringsEquivalent(a, b string) bool {
	var av, bv interface{}
	if err := json.Unmarshal([]byte(a), &av); err != nil {
		return a == b
	}
	if err := json.Unmarshal([]byte(b), &bv); err != nil {
		return a == b
	}
	return reflect.DeepEqual(av, bv)
}

// applyBrokerCR merge-patches the Broker custom resource with the
// explicitly-set fields. Broker service changes reconcile in place; version
// and size changes roll the NATS statefulset under operator control.
func applyBrokerCR(
	ctx context.Context,
	kubeClient *mesherykube.Client,
	cfg *controllersconfig.MesheryBrokerConfig,
	result *ControllersConfigApplyResult,
) error {
	if cfg == nil || (cfg.Version == nil && cfg.Replicas == nil && cfg.Service == nil) {
		return nil
	}

	if _, err := kubeClient.DynamicKubeClient.Resource(brokerGVR).Namespace(controllersNamespace).Get(ctx, brokerCRName, metav1.GetOptions{}); err != nil {
		if k8serrors.IsNotFound(err) || isNoKindMatch(err) {
			result.Skipped = append(result.Skipped, "Broker custom resource not present; broker settings apply when the Meshery Operator is deployed")
			return nil
		}
		return err
	}

	spec := map[string]interface{}{}
	if cfg.Version != nil {
		spec["version"] = *cfg.Version
	}
	if cfg.Replicas != nil {
		spec["size"] = *cfg.Replicas
	}
	if svc := cfg.Service; svc != nil {
		service := map[string]interface{}{}
		if svc.Type != nil {
			service["type"] = string(*svc.Type)
		}
		if svc.Annotations != nil {
			service["annotations"] = svc.Annotations
		}
		if svc.LoadBalancerClass != nil {
			service["loadBalancerClass"] = *svc.LoadBalancerClass
		}
		if svc.LoadBalancerSourceRanges != nil {
			service["loadBalancerSourceRanges"] = svc.LoadBalancerSourceRanges
		}
		if svc.ExternalEndpointOverride != nil {
			service["externalEndpointOverride"] = *svc.ExternalEndpointOverride
		}
		if len(service) > 0 {
			spec["service"] = service
		}
	}
	if len(spec) == 0 {
		return nil
	}

	patch, err := json.Marshal(map[string]interface{}{"spec": spec})
	if err != nil {
		return err
	}
	if _, err := kubeClient.DynamicKubeClient.Resource(brokerGVR).Namespace(controllersNamespace).Patch(ctx, brokerCRName, types.MergePatchType, patch, metav1.PatchOptions{}); err != nil {
		return err
	}
	result.BrokerCRPatched = true
	return nil
}

// applyMeshSyncDeploymentOverlay server-side-applies Meshery Server's
// env/args overlay onto the MeshSync Deployment. The applied configuration
// always describes the complete set of fields this field manager owns, so
// clearing a knob at every layer withdraws its env entry or argument on the
// next apply. When restartMeshSync is true (watch-list changed), the pod
// template restart annotation is refreshed; otherwise any previously-applied
// annotation value is carried forward unchanged so the apply itself does not
// roll pods.
func applyMeshSyncDeploymentOverlay(
	ctx context.Context,
	kubeClient *mesherykube.Client,
	cfg *controllersconfig.MeshSyncConfig,
	restartMeshSync bool,
	result *ControllersConfigApplyResult,
) error {
	deployment, err := kubeClient.KubeClient.AppsV1().Deployments(controllersNamespace).Get(ctx, meshSyncDeploymentName, metav1.GetOptions{})
	if err != nil {
		if k8serrors.IsNotFound(err) {
			result.Skipped = append(result.Skipped, "MeshSync deployment not present; env and output-filter settings apply when the Meshery Operator has deployed MeshSync")
			return nil
		}
		return err
	}

	env := []map[string]interface{}{}
	args := []string{}
	if cfg != nil {
		if cfg.RedactSecrets != nil {
			env = append(env, map[string]interface{}{"name": envRedactSecrets, "value": strconv.FormatBool(*cfg.RedactSecrets)})
		}
		if cfg.BrokerContentDedup != nil {
			env = append(env, map[string]interface{}{"name": envBrokerContentDedup, "value": strconv.FormatBool(*cfg.BrokerContentDedup)})
		}
		if cfg.DebugLogging != nil {
			env = append(env, map[string]interface{}{"name": envDebug, "value": strconv.FormatBool(*cfg.DebugLogging)})
		}
		if len(cfg.OutputNamespaces) > 0 {
			args = append(args, "--outputNamespaces="+strings.Join(cfg.OutputNamespaces, ","))
		}
		if len(cfg.OutputResources) > 0 {
			args = append(args, "--outputResources="+strings.Join(cfg.OutputResources, ","))
		}
	}

	container := map[string]interface{}{"name": meshSyncContainerName}
	if len(env) > 0 {
		container["env"] = env
	}
	if len(args) > 0 {
		container["args"] = args
	}

	templateMeta := map[string]interface{}{}
	previousRestartValue := deployment.Spec.Template.Annotations[meshSyncRestartAnnotation]
	switch {
	case restartMeshSync:
		templateMeta["annotations"] = map[string]interface{}{meshSyncRestartAnnotation: time.Now().UTC().Format(time.RFC3339)}
		result.MeshSyncRestarted = true
	case previousRestartValue != "":
		// Carry the previously-applied annotation forward: dropping it from
		// this manager's applied set would remove it from the pod template,
		// which itself rolls the pods.
		templateMeta["annotations"] = map[string]interface{}{meshSyncRestartAnnotation: previousRestartValue}
	}

	template := map[string]interface{}{
		"spec": map[string]interface{}{
			"containers": []interface{}{container},
		},
	}
	if len(templateMeta) > 0 {
		template["metadata"] = templateMeta
	}

	applyConfig := map[string]interface{}{
		"apiVersion": "apps/v1",
		"kind":       "Deployment",
		"metadata": map[string]interface{}{
			"name":      meshSyncDeploymentName,
			"namespace": controllersNamespace,
		},
		"spec": map[string]interface{}{
			"template": template,
		},
	}

	payload, err := json.Marshal(applyConfig)
	if err != nil {
		return err
	}
	force := true
	if _, err := kubeClient.KubeClient.AppsV1().Deployments(controllersNamespace).Patch(ctx, meshSyncDeploymentName, types.ApplyPatchType, payload, metav1.PatchOptions{FieldManager: controllersConfigFieldManager, Force: &force}); err != nil {
		return err
	}
	result.DeploymentOverlayApplied = true
	return nil
}

// isNoKindMatch reports whether the error indicates the CRD itself is not
// installed on the cluster (embedded-mode clusters never install the
// meshery.io CRDs).
func isNoKindMatch(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "no matches for kind") ||
		strings.Contains(err.Error(), "could not find the requested resource") ||
		strings.Contains(err.Error(), "the server could not find the requested resource")
}
