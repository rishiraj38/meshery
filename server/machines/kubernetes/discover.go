package kubernetes

import (
	"context"
	"errors"
	"fmt"

	"github.com/gofrs/uuid"
	"github.com/meshery/meshery/server/machines"
	"github.com/meshery/meshery/server/models"
	"github.com/meshery/meshery/server/models/connections"
	"github.com/meshery/meshkit/models/events"
	"github.com/meshery/schemas/models/core"
)

type DiscoverAction struct{}

// Execute On Entry and Exit should not return next eventtype i suppose, look again.
func (da *DiscoverAction) ExecuteOnEntry(ctx context.Context, machineCtx interface{}, data interface{}) (machines.EventType, *events.Event, error) {
	return machines.NoOp, nil, nil
}

func (da *DiscoverAction) Execute(ctx context.Context, machineCtx interface{}, data interface{}) (machines.EventType, *events.Event, error) {
	user, _ := ctx.Value(models.UserCtxKey).(*models.User)
	sysID, _ := ctx.Value(models.SystemIDKey).(*core.Uuid)
	userUUID := user.ID
	provider, _ := ctx.Value(models.ProviderCtxKey).(models.Provider)

	eventBuilder := events.NewEvent().ActedUpon(userUUID).WithCategory("connection").WithAction("update").FromSystem(*sysID).FromOwner(userUUID).WithDescription("Failed to interact with the connection.").WithSeverity(events.Error)

	machinectx, err := GetMachineCtx(machineCtx, eventBuilder)
	if err != nil {
		eventBuilder.WithMetadata(map[string]interface{}{"error": err})
		return machines.NoOp, eventBuilder.Build(), err
	}

	k8sContext := machinectx.K8sContext
	handler := machinectx.clientset

	err = k8sContext.AssignServerID(handler)
	if err != nil {
		return machines.NotFound, eventBuilder.WithDescription(fmt.Sprintf("Could not assign server id, skipping context %s", k8sContext.Name)).WithMetadata(map[string]interface{}{
			"error": err,
		}).Build(), err
	}

	err = k8sContext.AssignVersion(handler)
	if err != nil {
		machinectx.log.Info("unable to set kubernes server version, continuing without assigning version")
	}
	token, _ := ctx.Value(models.TokenCtxKey).(string)

	// Persist the freshly-resolved context (k8sContext, which now carries the
	// server ID and version assigned above) rather than the machine's original
	// copy, so a brand-new connection is created with its server ID already set.
	_, err = provider.SaveK8sContext(token, k8sContext, nil)
	if errors.Is(err, models.ErrContextAlreadyPersisted) {
		machinectx.log.Info(fmt.Sprintf("context already persisted (\"%s\" at %s)", k8sContext.Name, k8sContext.Server))
		// The connection already exists, but its persisted kubernetesServerId can
		// be empty or stale: a connection first registered while its cluster's API
		// server was unreachable (or one migrated from an older Meshery that never
		// stored the server ID) is saved with no server ID, and neither
		// SaveK8sContext (it early-returns above) nor the FSM status update (it
		// rewrites the existing metadata verbatim) ever corrects it. Back-fill it
		// now from the server ID just resolved from the reachable cluster so the
		// dashboard's cluster_id filter matches the MeshSync data this cluster
		// streams under its real ID; without this the connection ingests data yet
		// the dashboard shows none.
		if rerr := reconcilePersistedServerID(provider, token, k8sContext); rerr != nil {
			machinectx.log.Warn(rerr)
		}
	} else if err != nil {
		return machines.NoOp, eventBuilder.WithDescription(fmt.Sprintf("Unable to establish connection with context \"%s\" at %s", k8sContext.Name, k8sContext.Server)).WithMetadata(map[string]interface{}{"error": err}).Build(), err
	}

	// machinectx.log.Debug("exiting execute func from discovered state", connection)

	return machines.Register, nil, nil
}

// reconcilePersistedServerID keeps an already-persisted kubernetes connection's
// metadata.kubernetesServerId in step with the server ID freshly resolved from
// the reachable cluster (its kube-system namespace UID). It self-heals a
// connection whose persisted server ID is empty or stale - one registered while
// its cluster was unreachable, or migrated from a Meshery build that predated
// storing it - which matters because the dashboard filters MeshSync resources by
// that persisted ID against each row's cluster_id. A mismatch there leaves a live
// stream invisible.
//
// It is a no-op when the persisted value already matches, so the FSM re-running
// discovery on every request corrects a broken connection exactly once and adds
// no write on the steady state.
func reconcilePersistedServerID(provider models.Provider, token string, k8sContext models.K8sContext) error {
	if k8sContext.KubernetesServerID == nil || *k8sContext.KubernetesServerID == uuid.Nil {
		return nil
	}
	serverID := k8sContext.KubernetesServerID.String()

	connectionID := uuid.FromStringOrNil(k8sContext.ConnectionID)
	if connectionID == uuid.Nil {
		return nil
	}

	connection, _, err := provider.GetConnectionByID(token, connectionID)
	if err != nil {
		return ErrReconcileServerID(err)
	}
	if connection == nil {
		return nil
	}

	metadata := connection.Metadata
	if metadata == nil {
		metadata = map[string]interface{}{}
	}
	if persisted, _ := metadata["kubernetesServerId"].(string); persisted == serverID {
		// Already correct - nothing to write.
		return nil
	}
	metadata["kubernetesServerId"] = serverID

	payload := &connections.ConnectionPayload{
		ID:       connectionID,
		Kind:     connection.Kind,
		MetaData: metadata,
		Status:   connection.Status,
	}
	if _, err := provider.UpdateConnectionById(token, payload, connectionID.String()); err != nil {
		return ErrReconcileServerID(err)
	}
	return nil
}

func (da *DiscoverAction) ExecuteOnExit(ctx context.Context, machineCtx interface{}, data interface{}) (machines.EventType, *events.Event, error) {
	return machines.NoOp, nil, nil
}
