package kubernetes

import (
	"github.com/meshery/meshkit/errors"
)

var (
	ErrResyncK8SResourcesCode = "meshery-server-1372"
	ErrConnectActionCode      = "meshery-server-1373"
	ErrReconcileServerIDCode  = "meshery-server-1445"
)

func ErrResyncK8SResources(err error) error {
	return errors.New(ErrResyncK8SResourcesCode, errors.Critical, []string{"Error resync resources"}, []string{err.Error()}, []string{"Fail to resync resources for the kubernetes machine"}, []string{"Check if machine context is assign to machine", "Check if machine context contains a reference to MesheryControllersHelper"})
}

func ErrConnectAction(err error) error {
	return errors.New(ErrConnectActionCode, errors.Critical, []string{"Error connect action"}, []string{err.Error()}, []string{"Fail to perform connect action for the kubernetes machine"}, []string{"Check if token is passed machine from golang context correctly", "Check if there is connection data stored in database for this kubernetes machine"})
}

// ErrReconcileServerID wraps a failure to back-fill an already-persisted
// kubernetes connection's kubernetesServerId with the server ID freshly resolved
// from the reachable cluster. It is best-effort and non-fatal: the reconcile
// retries on the next discovery cycle, so it is surfaced at None severity.
func ErrReconcileServerID(err error) error {
	return errors.New(ErrReconcileServerIDCode, errors.None, []string{"Failed to reconcile the persisted Kubernetes server ID for the connection"}, []string{err.Error()}, []string{"The connection's persisted kubernetesServerId could not be read from or written to the connection store while syncing it with the live cluster's server ID."}, []string{"Verify the connection still exists and Meshery can reach the provider's connection store. The reconcile is retried automatically on the next discovery cycle."})
}
