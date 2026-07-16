import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  Box,
  CustomTooltip,
  IconButton,
  InfoOutlinedIcon,
  Modal,
  ModalBody,
  ModalButtonDanger,
  ModalButtonPrimary,
  ModalButtonSecondary,
  ModalFooter,
  Typography,
  WarningIcon,
  useTheme,
} from '@sistent/sistent';
import { iconLarge } from '../../css/icons.styles';
import { CONNECTION_KINDS, CONNECTION_STATES } from '../../utils/Enum';
import { formatToTitleCase } from '../../utils/utils';
import { CONNECTION_DOCS_URL } from './ConnectionTable.constants';

export const KUBERNETES_CONNECTION_LIFECYCLE_DOCS_URL =
  'https://docs.meshery.io/guides/infrastructure-management/kubernetes-connection-lifecycle';

// Ramifications of landing in each lifecycle state, phrased for the person
// about to confirm the transition. Wording follows the Connections concept
// docs (docs.meshery.io/concepts/logical/connections).
const STATE_RAMIFICATIONS: Record<string, string> = {
  [CONNECTION_STATES.DELETED]:
    "The connection is administratively removed from Meshery's view of management. " +
    "The connection record and all data collected for it are purged from Meshery's " +
    'database. The underlying system itself is not deleted or modified. This cannot be undone.',
  [CONNECTION_STATES.DISCONNECTED]:
    'Meshery stops communicating with and managing this connection. Previously collected ' +
    'data is retained, and the connection can be connected again later.',
  [CONNECTION_STATES.IGNORED]:
    'Meshery takes no further action on this connection and stops managing it. It remains ' +
    'listed so you can register it again whenever you choose.',
  [CONNECTION_STATES.REGISTERED]:
    'The connection is registered with Meshery but not yet actively managed. Transition it ' +
    'to Connected when you want Meshery to begin managing it.',
  [CONNECTION_STATES.CONNECTED]:
    'Meshery actively manages this connection: it communicates with the system, collects ' +
    'data, and keeps its state in sync.',
  [CONNECTION_STATES.MAINTENANCE]:
    'The connection is placed under administrative maintenance. Meshery pauses management ' +
    'operations until you transition it back.',
  [CONNECTION_STATES.DISCOVERED]:
    'The connection returns to the discovered state: Meshery knows about it but does not ' +
    'manage it until it is registered and connected.',
  [CONNECTION_STATES.NOTFOUND]:
    'The connection is marked as not found. You can delete it or try re-registering it.',
};

// Kubernetes connections carry extra in-cluster machinery, so a few
// transitions have broader consequences than the generic ones above.
const KUBERNETES_STATE_RAMIFICATIONS: Record<string, string> = {
  [CONNECTION_STATES.DELETED]:
    "Deleting a Kubernetes connection removes the cluster from Meshery's purview of " +
    'management: Meshery Operator (along with MeshSync and Meshery Broker) is undeployed ' +
    'from the cluster, the connection and its associated credential are removed, and all ' +
    "cluster data collected through MeshSync is purged from Meshery's database. The " +
    'Kubernetes cluster itself is NOT deleted. Reconnecting: Meshery automatically ' +
    'reconnects to the cluster when next presented with the same kubeconfig context. To ' +
    'prevent reconnection, disconnect this connection instead of deleting it.',
  [CONNECTION_STATES.DISCONNECTED]:
    'Meshery stops managing the cluster and tears down its communication with the ' +
    "cluster's controllers. Data already collected through MeshSync is retained, and the " +
    'cluster can be connected again later without re-registering.',
  [CONNECTION_STATES.CONNECTED]:
    'Meshery begins actively managing the cluster: depending on the MeshSync deployment ' +
    'mode, Meshery Operator, MeshSync, and Meshery Broker are brought up to stream live ' +
    "cluster state into Meshery's database.",
};

const getRamifications = (kind: string | undefined, targetStatus: string): string =>
  (kind === CONNECTION_KINDS.KUBERNETES && KUBERNETES_STATE_RAMIFICATIONS[targetStatus]) ||
  STATE_RAMIFICATIONS[targetStatus] ||
  `The connection transitions to the ${targetStatus.toUpperCase()} state.`;

const getDocsTooltipMarkdown = (kind: string | undefined): string =>
  kind === CONNECTION_KINDS.KUBERNETES
    ? `Every connection moves through a defined lifecycle of states. Learn more about the [Kubernetes connection lifecycle](${KUBERNETES_CONNECTION_LIFECYCLE_DOCS_URL}) and the [behavior of state transitions](${CONNECTION_DOCS_URL}) in Meshery Docs.`
    : `Every connection moves through a defined lifecycle of states. Learn more about the [lifecycle of connections and the behavior of state transitions](${CONNECTION_DOCS_URL}) in Meshery Docs.`;

export interface TransitioningConnection {
  id?: string;
  name?: string;
}

export interface ConnectionStateTransitionShowParams {
  /** The lifecycle state being transitioned to, e.g. `deleted`. */
  targetStatus: string;
  /** The current lifecycle state, when known (single-connection flows). */
  currentStatus?: string;
  /** Connection kind, e.g. `kubernetes`. Drives kind-specific copy and docs links. */
  kind?: string;
  /** The connection(s) the transition applies to (one for row flows, many for bulk). */
  connections: TransitioningConnection[];
  /**
   * Transition-specific description from the connection definition's
   * transitionMap (see getStatusTransition), shown alongside the state
   * ramifications when available.
   */
  transitionDescription?: string;
}

export interface ConnectionStateTransitionModalRef {
  /** Resolves `true` when the user confirms, `false` on cancel/dismiss. */
  show: (params: ConnectionStateTransitionShowParams) => Promise<boolean>;
}

const MAX_LISTED_NAMES = 3;

const ConnectionNames = ({ connections }: { connections: TransitioningConnection[] }) => {
  const names = connections.map((connection) => connection.name).filter(Boolean) as string[];
  if (names.length === 0) {
    return null;
  }
  const listed = names.slice(0, MAX_LISTED_NAMES);
  const remainder = names.length - listed.length;
  return (
    <>
      {' '}
      (<b>{listed.join(', ')}</b>
      {remainder > 0 ? ` and ${remainder} more` : ''})
    </>
  );
};

/**
 * The single confirmation experience for every connection state transition -
 * row delete, bulk delete, status dropdown, the header's Kubernetes context
 * switcher, and the connection wizard all funnel through this modal. It
 * explains the ramifications of the selected transition (kind-aware), links
 * the relevant docs from an info tooltip, and uses the Sistent danger button
 * for destructive transitions.
 */
const ConnectionStateTransitionModal = forwardRef<ConnectionStateTransitionModalRef>(
  function ConnectionStateTransitionModal(_props, ref) {
    const theme = useTheme();
    const [params, setParams] = useState<ConnectionStateTransitionShowParams | null>(null);
    const promiseRef = useRef<{ resolve: (confirmed: boolean) => void }>({ resolve: () => {} });
    // Retains the last shown params so the modal can keep rendering its
    // content during the dialog's exit transition after params clears.
    const lastParamsRef = useRef<ConnectionStateTransitionShowParams | null>(null);
    if (params) {
      lastParamsRef.current = params;
    }

    useImperativeHandle(ref, () => ({
      show: (showParams) =>
        new Promise<boolean>((resolve) => {
          // Settle any in-flight confirmation as cancelled so a re-entrant
          // show() (e.g. a double-click) can never leave the first caller's
          // promise hanging.
          promiseRef.current.resolve(false);
          promiseRef.current = { resolve };
          setParams(showParams);
        }),
    }));

    const settle = (confirmed: boolean) => {
      setParams(null);
      const { resolve } = promiseRef.current;
      // Reset so a later settle (or re-entrant show) cannot re-invoke it.
      promiseRef.current = { resolve: () => {} };
      resolve(confirmed);
    };

    const displayParams = params ?? lastParamsRef.current;
    if (!displayParams) {
      return null;
    }

    const { targetStatus, currentStatus, kind, connections, transitionDescription } = displayParams;
    const isDelete = targetStatus === CONNECTION_STATES.DELETED;
    const count = connections.length;
    const plural = count > 1;
    const kindLabel = kind ? `${formatToTitleCase(kind)} ` : '';

    const title = isDelete
      ? `Delete ${plural ? `${count} ` : ''}${kindLabel}connection${plural ? 's' : ''}?`
      : `Transition ${plural ? `${count} connections` : 'connection'} to ${targetStatus.toUpperCase()}?`;

    const leadSentence = (
      <>
        You are about to {isDelete ? 'delete' : 'transition'}{' '}
        {plural ? `${count} connections` : 'the connection'}
        <ConnectionNames connections={connections} />
        {!isDelete && currentStatus
          ? ` from ${currentStatus.toUpperCase()} to ${targetStatus.toUpperCase()}`
          : ''}
        {isDelete && kind === CONNECTION_KINDS.KUBERNETES
          ? plural
            ? ' and their associated credentials'
            : ' and its associated credential'
          : ''}
        .
      </>
    );

    const ConfirmButton = isDelete ? ModalButtonDanger : ModalButtonPrimary;

    return (
      <Modal
        open={Boolean(params)}
        closeModal={() => settle(false)}
        title={title}
        headerIcon={
          <WarningIcon
            {...iconLarge}
            fill={theme.palette.text?.constant?.white ?? theme.palette.common.white}
          />
        }
        maxWidth="sm"
        data-testid="connection-transition-modal"
      >
        <ModalBody>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '0.25rem' }}>
            <Typography variant="body1" data-testid="connection-transition-lead">
              {leadSentence}
            </Typography>
            <CustomTooltip title={getDocsTooltipMarkdown(kind)} placement="top">
              <IconButton
                aria-label="Learn more about connection state transitions"
                data-testid="connection-transition-info"
                size="small"
                onClick={(event) => event.stopPropagation()}
              >
                <InfoOutlinedIcon height={20} width={20} />
              </IconButton>
            </CustomTooltip>
          </Box>
          <Typography variant="body1" sx={{ fontWeight: 600, marginTop: '0.75rem' }}>
            What happens next
          </Typography>
          <Typography
            variant="body2"
            data-testid="connection-transition-ramifications"
            sx={{ marginTop: '0.25rem', color: theme.palette.text.secondary }}
          >
            {getRamifications(kind, targetStatus)}
            {plural ? ' This applies to each selected connection.' : ''}
          </Typography>
          {transitionDescription && (
            <Typography
              variant="body2"
              data-testid="connection-transition-description"
              sx={{ marginTop: '0.5rem', color: theme.palette.text.secondary }}
            >
              {transitionDescription}
            </Typography>
          )}
        </ModalBody>
        <ModalFooter variant="filled">
          <Box sx={{ width: '100%', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <ModalButtonSecondary
              onClick={() => settle(false)}
              data-testid="connection-transition-cancel"
            >
              Cancel
            </ModalButtonSecondary>
            <ConfirmButton onClick={() => settle(true)} data-testid="connection-transition-confirm">
              {isDelete ? 'Delete' : 'Confirm'}
            </ConfirmButton>
          </Box>
        </ModalFooter>
      </Modal>
    );
  },
);

export default ConnectionStateTransitionModal;
