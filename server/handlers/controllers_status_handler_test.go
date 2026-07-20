package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofrs/uuid"
	"github.com/meshery/meshery/server/machines"
	"github.com/meshery/meshery/server/machines/kubernetes"
	"github.com/meshery/meshery/server/models"
	"github.com/meshery/schemas/models/core"
)

// trackerWith builds an instance tracker holding a single connection->machine
// mapping, for exercising machineCtxForConnection without standing up real FSMs.
func trackerWith(id core.Uuid, inst *machines.StateMachine) *machines.ConnectionToStateMachineInstanceTracker {
	return &machines.ConnectionToStateMachineInstanceTracker{
		ConnectToInstanceMap: map[core.Uuid]*machines.StateMachine{id: inst},
	}
}

// A tracked machine whose Context is nil - a non-kubernetes connection, or a
// kubernetes one whose cluster was unreachable when the machine was created - is
// an expected "not ready" state. machineCtxForConnection must report it as
// not-ready (nil,false) and, crucially, must NOT type-assert the nil Context,
// which previously logged meshkit-11180 on every controller-status poll.
func TestMachineCtxForConnection_NilContextIsNotReady(t *testing.T) {
	connID := uuid.Must(uuid.NewV4())
	h := &Handler{
		config:                                  &models.HandlerConfig{},
		log:                                     newTestLogger(t),
		ConnectionToStateMachineInstanceTracker: trackerWith(connID, &machines.StateMachine{ID: connID, Context: nil}),
	}

	ctx, ok := h.machineCtxForConnection(connID.String())
	if ok {
		t.Fatalf("expected not-ready (ok=false) for a nil-Context machine, got ok=true")
	}
	if ctx != nil {
		t.Fatalf("expected nil machine context for a nil-Context machine, got %#v", ctx)
	}
}

// A machine with no tracked instance is likewise not-ready.
func TestMachineCtxForConnection_UntrackedIsNotReady(t *testing.T) {
	h := &Handler{
		config:                                  &models.HandlerConfig{},
		log:                                     newTestLogger(t),
		ConnectionToStateMachineInstanceTracker: trackerWith(uuid.Must(uuid.NewV4()), &machines.StateMachine{Context: nil}),
	}

	if ctx, ok := h.machineCtxForConnection(uuid.Must(uuid.NewV4()).String()); ok || ctx != nil {
		t.Fatalf("expected not-ready for an untracked connection, got ok=%v ctx=%#v", ok, ctx)
	}
}

// A fully-initialized kubernetes machine (a *kubernetes.MachineCtx carrying a
// controllers helper) resolves as ready.
func TestMachineCtxForConnection_ReadyWhenContextValid(t *testing.T) {
	connID := uuid.Must(uuid.NewV4())
	mctx := &kubernetes.MachineCtx{MesheryCtrlsHelper: &models.MesheryControllersHelper{}}
	h := &Handler{
		config:                                  &models.HandlerConfig{},
		log:                                     newTestLogger(t),
		ConnectionToStateMachineInstanceTracker: trackerWith(connID, &machines.StateMachine{ID: connID, Context: mctx}),
	}

	ctx, ok := h.machineCtxForConnection(connID.String())
	if !ok || ctx == nil {
		t.Fatalf("expected ready machine context, got ok=%v ctx=%#v", ok, ctx)
	}
	if ctx != mctx {
		t.Fatalf("expected the tracked machine context to be returned")
	}
}

func newControllersStatusTestHandler(t *testing.T) *Handler {
	t.Helper()
	// A nil ConnectionToStateMachineInstanceTracker is fine: unresolved
	// connections degrade to an empty snapshot, which is exactly the path we
	// exercise without standing up real FSM instances and cluster clients.
	return &Handler{
		config: &models.HandlerConfig{},
		log:    newTestLogger(t),
	}
}

func TestSubscribeMesheryControllersStatusHandler_EmitsInitialSnapshot(t *testing.T) {
	h := newControllersStatusTestHandler(t)
	user := &models.User{ID: uuid.Must(uuid.NewV4())}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req := httptest.NewRequest(http.MethodGet,
		"/api/system/controllers/status/subscribe?connectionIds="+uuid.Must(uuid.NewV4()).String(), nil).
		WithContext(ctx)

	writeCh := make(chan struct{}, 8)
	rec := newSSERecorder(writeCh)

	done := make(chan struct{})
	go func() {
		h.SubscribeMesheryControllersStatusHandler(rec, req, nil, user, nil)
		close(done)
	}()

	// The initial snapshot is written synchronously before the poll loop, so it
	// should land promptly. Unknown connections yield an empty array.
	deadline := time.After(testTimeout)
	for !strings.Contains(rec.body.String(), "data: [") {
		select {
		case <-deadline:
			t.Fatalf("timed out waiting for initial snapshot; got: %q", rec.body.String())
		case <-writeCh:
		case <-time.After(20 * time.Millisecond):
		}
	}

	body := rec.body.String()
	if !strings.Contains(body, "data: []") {
		t.Fatalf("expected empty snapshot for unresolved connection, got: %q", body)
	}
	if !strings.Contains(body, "\n\n") {
		t.Fatalf("snapshot not framed as SSE data message: %q", body)
	}
	if got := rec.header.Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("Content-Type = %q, want text/event-stream", got)
	}

	cancel()
	select {
	case <-done:
	case <-time.After(testTimeout):
		t.Fatal("handler did not return after context cancellation")
	}
}

func TestSubscribeMesheryControllersStatusHandler_StopsOnContextCancellation(t *testing.T) {
	h := newControllersStatusTestHandler(t)
	user := &models.User{ID: uuid.Must(uuid.NewV4())}

	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodGet, "/api/system/controllers/status/subscribe", nil).WithContext(ctx)
	rec := newSSERecorder(nil)

	done := make(chan struct{})
	go func() {
		h.SubscribeMesheryControllersStatusHandler(rec, req, nil, user, nil)
		close(done)
	}()

	cancel()
	select {
	case <-done:
	case <-time.After(testTimeout):
		t.Fatal("handler did not return after context cancellation")
	}
}

func TestOperatorStatusHandler_UnknownForUnresolvedConnection(t *testing.T) {
	h := newControllersStatusTestHandler(t)

	req := httptest.NewRequest(http.MethodGet,
		"/api/system/controllers/operator/status?connectionId="+uuid.Must(uuid.NewV4()).String(), nil)
	rec := httptest.NewRecorder()

	h.OperatorStatusHandler(rec, req, nil, nil, nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"controller":"OPERATOR"`) || !strings.Contains(body, `"status":"`+string(controllersStatusUnknown)+`"`) {
		t.Fatalf("expected unknown operator status payload, got: %q", body)
	}
	if !strings.Contains(body, `"connectionId":`) {
		t.Fatalf("expected canonical connectionId key, got: %q", body)
	}
}

// A malformed connectionId must be rejected with 400 rather than falling back
// to uuid.Nil and echoing a zero UUID. Covers all three one-shot status
// handlers, which share the same validation.
func TestControllerStatusHandlers_RejectInvalidConnectionID(t *testing.T) {
	h := newControllersStatusTestHandler(t)

	handlers := map[string]func(http.ResponseWriter, *http.Request, *models.Preference, *models.User, models.Provider){
		"operator": h.OperatorStatusHandler,
		"meshsync": h.MeshsyncStatusHandler,
		"broker":   h.BrokerStatusHandler,
	}

	for name, handler := range handlers {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet,
				"/api/system/controllers/"+name+"/status?connectionId=not-a-uuid", nil)
			rec := httptest.NewRecorder()

			handler(rec, req, nil, nil, nil)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 for a malformed connectionId", rec.Code)
			}
			if strings.Contains(rec.Body.String(), uuid.Nil.String()) {
				t.Fatalf("response must not echo the zero UUID, got: %q", rec.Body.String())
			}
		})
	}
}
