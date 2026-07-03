package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/gofrs/uuid"
	"github.com/gorilla/mux"
	"github.com/meshery/meshery/server/machines/kubernetes"
	"github.com/meshery/meshery/server/models"
	"github.com/meshery/meshery/server/models/connections"
	"github.com/meshery/meshkit/models/events"
	"github.com/meshery/schemas/models/core"
	schemasConnection "github.com/meshery/schemas/models/v1beta3/connection"
)

// PerformConnectionAction handles POST /api/integrations/connections/{connectionId}/actions.
//
// It performs a side-effecting operation on a connection, selected by the
// `action` discriminator in the body, with the server owning any metadata merge
// and cluster-side effects. This is deliberately separate from PUT /{connectionId}
// (which updates resource fields): the old flow overloaded PUT by sniffing
// meshsync_deployment_mode out of the client's metadata, which — combined with a
// body that dropped the connection id — persisted onto a nil-id row (INSERT),
// creating a duplicate connection and never updating the real one. Here the
// client sends only the intent and the server reads the connection by its URL
// id, so persistence always targets the correct row.
func (h *Handler) PerformConnectionAction(w http.ResponseWriter, req *http.Request, _ *models.Preference, user *models.User, provider models.Provider) {
	connectionID := uuid.FromStringOrNil(mux.Vars(req)["connectionId"])
	if connectionID == uuid.Nil {
		writeJSONError(w, "invalid or missing connection id", http.StatusBadRequest)
		return
	}

	defer func() { _ = req.Body.Close() }()
	body, err := io.ReadAll(req.Body)
	if err != nil {
		h.log.Error(ErrRequestBody(err))
		writeMeshkitError(w, ErrRequestBody(err), http.StatusBadRequest)
		return
	}

	var actionReq schemasConnection.ConnectionActionRequest
	if err := json.Unmarshal(body, &actionReq); err != nil {
		h.log.Error(models.ErrUnmarshal(err, "connection action"))
		writeMeshkitError(w, models.ErrUnmarshal(err, "connection action"), http.StatusBadRequest)
		return
	}

	switch actionReq.Action {
	case schemasConnection.SetMeshsyncMode:
		h.setMeshsyncDeploymentModeAction(w, req, connectionID, actionReq, user, provider)
	default:
		writeJSONError(w, fmt.Sprintf("unsupported connection action %q", actionReq.Action), http.StatusBadRequest)
	}
}

// setMeshsyncDeploymentModeAction switches the MeshSync deployment mode
// (operator ↔ embedded) for a kubernetes connection. It merges the mode into the
// existing (server-side) metadata, persists it to the correct connection, then
// redeploys MeshSync asynchronously — controller status streams the progress.
func (h *Handler) setMeshsyncDeploymentModeAction(
	w http.ResponseWriter,
	req *http.Request,
	connectionID core.Uuid,
	actionReq schemasConnection.ConnectionActionRequest,
	user *models.User,
	provider models.Provider,
) {
	userID := user.ID
	token, _ := req.Context().Value(models.TokenCtxKey).(string)
	eventBuilder := events.NewEvent().ActedUpon(connectionID).FromOwner(userID).FromSystem(*h.SystemID).WithCategory("connection").WithAction("update")

	if actionReq.Mode == nil {
		writeJSONError(w, "mode is required for the setMeshsyncMode action", http.StatusBadRequest)
		return
	}
	newMode := connections.MeshsyncDeploymentModeFromString(string(*actionReq.Mode))
	if newMode == connections.MeshsyncDeploymentModeUndefined {
		writeJSONError(w, fmt.Sprintf("invalid meshsync deployment mode %q", *actionReq.Mode), http.StatusBadRequest)
		return
	}

	// Existing connection is the source of truth for identity + metadata.
	existing, statusCode, err := provider.GetConnectionByID(token, connectionID)
	if err != nil || existing == nil {
		_err := ErrFailToSave(err, "connection")
		h.log.Error(_err)
		writeMeshkitError(w, _err, statusCode)
		return
	}
	if existing.Kind != "kubernetes" {
		writeJSONError(w, "meshsync deployment mode is only applicable to kubernetes connections", http.StatusBadRequest)
		return
	}

	oldMode := connections.MeshsyncDeploymentModeFromMetadata(existing.Metadata)
	if oldMode == connections.MeshsyncDeploymentModeUndefined {
		oldMode = h.MeshsyncDefaultDeploymentMode
		if oldMode == connections.MeshsyncDeploymentModeUndefined {
			oldMode = connections.MeshsyncDeploymentModeDefault
		}
	}

	// Idempotent: mode already at target — return current connection unchanged.
	if oldMode == newMode {
		writeJSONMessage(w, existing, http.StatusOK)
		return
	}

	// Server owns the merge: preserve all existing metadata, set only the mode.
	metadata := existing.Metadata
	if metadata == nil {
		metadata = core.Map{}
	}
	connections.SetMeshsyncDeploymentModeToMetadata(metadata, newMode)

	// Persist to the connection identified by the URL id (never a nil id).
	payload := &connections.ConnectionPayload{
		ID:           connectionID,
		Name:         existing.Name,
		Kind:         existing.Kind,
		Type:         existing.ConnectionType,
		SubType:      existing.SubType,
		Status:       existing.Status,
		MetaData:     metadata,
		CredentialID: existing.CredentialID,
	}
	updated, err := provider.UpdateConnectionById(token, payload, connectionID.String())
	if err != nil {
		_err := ErrFailToSave(err, "connection")
		event := eventBuilder.WithSeverity(events.Error).WithDescription("Failed to persist MeshSync deployment mode").WithMetadata(map[string]any{"error": _err}).Build()
		_ = provider.PersistEvent(*event, token)
		go h.config.EventBroadcaster.Publish(userID, event)
		h.log.Error(_err)
		writeMeshkitError(w, _err, http.StatusInternalServerError)
		return
	}

	// Redeploy MeshSync for the new mode without blocking the response; the
	// controller-status SSE stream reflects the deploy/undeploy progress.
	// Detach from the request lifecycle but keep context values (token, etc.).
	detachedCtx := context.WithoutCancel(req.Context())
	go func() {
		if rerr := h.reconcileMeshsyncDeploymentMode(detachedCtx, connectionID, newMode, userID, provider); rerr != nil {
			h.log.Error(rerr)
			event := eventBuilder.WithSeverity(events.Error).
				WithDescription(fmt.Sprintf("MeshSync mode saved as '%s' but redeploy failed for connection %s", newMode, updated.Name)).
				WithMetadata(map[string]any{"error": rerr, "connectionId": connectionID}).Build()
			_ = provider.PersistEvent(*event, token)
			h.config.EventBroadcaster.Publish(userID, event)
		}
	}()

	description := fmt.Sprintf("MeshSync deployment mode changed from '%s' to '%s' for connection %s", oldMode, newMode, updated.Name)
	event := eventBuilder.WithSeverity(events.Informational).WithDescription(description).WithMetadata(map[string]any{
		"meshsyncDeploymentModeOld": oldMode,
		"meshsyncDeploymentModeNew": newMode,
		"connectionId":              connectionID,
	}).Build()
	_ = provider.PersistEvent(*event, token)
	go h.config.EventBroadcaster.Publish(userID, event)
	h.log.Info(description)

	writeJSONMessage(w, updated, http.StatusOK)
}

// reconcileMeshsyncDeploymentMode drives the FSM's controller helper to undeploy
// the previous MeshSync setup and (re)deploy it for newMode. It reads the live
// machine context, so it must run after the connection's FSM exists (i.e. the
// connection is connected). Safe to run in a detached goroutine.
func (h *Handler) reconcileMeshsyncDeploymentMode(ctx context.Context, connectionID core.Uuid, newMode connections.MeshsyncDeploymentMode, userID core.Uuid, provider models.Provider) error {
	if h.SystemID == nil {
		return ErrMeshsyncReconcile("system id is not configured")
	}
	mesheryInstanceID := *h.SystemID

	tracker := h.ConnectionToStateMachineInstanceTracker
	if tracker == nil {
		return ErrMeshsyncReconcile("state machine instance tracker is nil")
	}
	machine, ok := tracker.Get(connectionID)
	if !ok || machine == nil {
		return ErrMeshsyncReconcile(fmt.Sprintf("no state machine for connection %s", connectionID))
	}
	machineCtx, err := kubernetes.GetMachineCtx(machine.Context, nil)
	if err != nil {
		return ErrMeshsyncReconcile(err.Error())
	}
	if machineCtx == nil || machineCtx.MesheryCtrlsHelper == nil {
		return ErrMeshsyncReconcile(fmt.Sprintf("machine context or controllers helper is nil for connection %s", connectionID))
	}

	ctrlHelper := machineCtx.MesheryCtrlsHelper
	contextID := machineCtx.K8sContext.ID

	// Undeploy the previous MeshSync setup for this context.
	ctrlHelper.
		UpdateOperatorsStatusMap(machineCtx.OperatorTracker).
		UndeployDeployedOperators(machineCtx.OperatorTracker).
		RemoveCtxControllerHandler(ctx, contextID)
	ctrlHelper.RemoveMeshSyncDataHandler(ctx, contextID)

	// Deploy MeshSync for the new mode.
	ctrlHelper.
		AddCtxControllerHandlers(machineCtx.K8sContext).
		SetMeshsyncDeploymentMode(newMode).
		UpdateOperatorsStatusMap(machineCtx.OperatorTracker).
		DeployUndeployedOperators(machineCtx.OperatorTracker).
		AddMeshsynDataHandlers(ctx, machineCtx.K8sContext, userID, mesheryInstanceID, provider)

	return nil
}
