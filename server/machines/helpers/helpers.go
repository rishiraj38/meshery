package helpers

import (
	"context"
	"fmt"

	"github.com/meshery/meshery/server/machines"
	"github.com/meshery/meshery/server/machines/grafana"
	"github.com/meshery/meshery/server/machines/kubernetes"
	"github.com/meshery/meshery/server/machines/prometheus"
	"github.com/meshery/meshery/server/models"
	"github.com/meshery/meshery/server/models/connections"
	"github.com/meshery/meshkit/database"
	"github.com/meshery/meshkit/logger"
	"github.com/meshery/meshkit/utils"
	"github.com/meshery/schemas/models/core"
)

func StatusToEvent(status connections.ConnectionStatus) machines.EventType {
	switch status {
	case connections.DISCOVERED:
		return machines.Discovery
	case connections.REGISTERED:
		return machines.Register
	case connections.CONNECTED:
		return machines.Connect
	case connections.DISCONNECTED:
		return machines.Disconnect
	case connections.IGNORED:
		return machines.Ignore
	case connections.DELETED:
		return machines.Delete
	case connections.NOTFOUND:
		return machines.NotFound
	}
	return machines.EventType(machines.DefaultState)
}
func getMachine(initialState machines.StateType, mtype, id string, userID core.Uuid, log logger.Handler, dbHandler *database.Handler) (*machines.StateMachine, error) {
	switch mtype {
	case "kubernetes":
		return kubernetes.New(id, userID, log)
	case "grafana":
		mch, err := machines.New(initialState, id, userID, log, mtype)
		if err != nil {
			return mch, err
		}
		register := mch.States[machines.REGISTERED]
		mch.States[machines.REGISTERED] = *register.RegisterAction(&grafana.RegisterAction{})

		connect := mch.States[machines.CONNECTED]
		mch.States[machines.CONNECTED] = *connect.RegisterAction(&machines.DefaultConnectAction{})
		return mch, nil
	case "prometheus":
		mch, err := machines.New(initialState, id, userID, log, mtype)
		if err != nil {
			return mch, err
		}
		register := mch.States[machines.REGISTERED]
		mch.States[machines.REGISTERED] = *register.RegisterAction(&prometheus.RegisterAction{})

		connect := mch.States[machines.CONNECTED]
		mch.States[machines.CONNECTED] = *connect.RegisterAction(&machines.DefaultConnectAction{})

		return mch, nil
	}
	return nil, machines.ErrInvalidType(fmt.Errorf("invlaid type requested"))
}

// IsMachineReady reports whether a state machine instance returned by
// InitializeMachineWithContext is safe to drive, i.e. it exists and its Context
// was actually assigned by Start.
//
// Two distinct shapes have to be treated as "not ready":
//
//   - a nil instance, returned when the machine could not be built at all (e.g.
//     the cluster's API server was unreachable, so the client set could not be
//     generated and AssignInitialCtx returned an error);
//   - a non-nil instance whose Context is nil. InitializeMachineWithContext
//     caches the instance via smInstanceTracker.Add *before* checking the Start
//     error, so every later call for that connection takes the cache-hit path
//     and gets back the same half-built instance, this time paired with a nil
//     error. The tracker is only ever cleared by an explicit user action
//     (deleting the connection, cancelling registration), so this state persists
//     for the life of the process.
//
// Driving either shape nil-dereferences, or type-asserts a nil interface and
// logs meshkit-11180 ("nil interface cannot be type casted") - which, on the
// ~5s controller-status poll, is a log line every five seconds per broken
// connection.
//
// The Context test uses utils.IsInterfaceNil rather than a bare `== nil` so a
// boxed typed-nil pointer is caught too, matching the check utils.Cast performs
// internally; a bare nil-interface comparison would silently stop working if an
// InitFunc ever returned a partially-built context instead of a literal nil.
func IsMachineReady(inst *machines.StateMachine) bool {
	return inst != nil && !utils.IsInterfaceNil(inst.Context)
}

func InitializeMachineWithContext(
	machineCtx interface{},
	ctx context.Context,
	ID core.Uuid,
	userID core.Uuid,
	smInstanceTracker *machines.ConnectionToStateMachineInstanceTracker,
	log logger.Handler,
	provider models.Provider,
	initialState machines.StateType,
	mtype string,
	initFunc connections.InitFunc,
) (*machines.StateMachine, error) {
	inst, ok := smInstanceTracker.Get(ID)
	if ok {
		return inst, nil
	}

	inst, err := getMachine(initialState, mtype, ID.String(), userID, log, provider.GetGenericPersister())
	if err != nil {
		log.Error(err)
		return nil, err
	}
	inst.Provider = provider
	_, err = inst.Start(ctx, machineCtx, log, initFunc)
	smInstanceTracker.Add(ID, inst)
	if err != nil {
		return nil, err
	}

	return inst, nil
}
