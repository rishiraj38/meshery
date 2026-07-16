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

/**
 * Scannable consequence blocks for a lifecycle transition. Prefer short
 * "This will / This will not / Note" lists over prose walls so destructive
 * confirms stay readable under load.
 */
export type StateConsequences = {
  will: string[];
  willNot?: string[];
  note?: string;
};

// Ramifications of landing in each lifecycle state, phrased for the person
// about to confirm the transition. Wording follows the Connections concept
// docs (docs.meshery.io/concepts/logical/connections).
const STATE_CONSEQUENCES: Record<string, StateConsequences> = {
  [CONNECTION_STATES.DELETED]: {
    will: [
      "Remove the connection from Meshery's view of management",
      "Purge the connection record and all data collected for it from Meshery's database",
    ],
    willNot: ['Delete or modify the underlying system itself'],
    note: 'This cannot be undone.',
  },
  [CONNECTION_STATES.DISCONNECTED]: {
    will: ['Stop communicating with and managing this connection'],
    willNot: ['Delete previously collected data'],
    note: 'You can connect the connection again later.',
  },
  [CONNECTION_STATES.IGNORED]: {
    will: ['Stop managing this connection and take no further action on it'],
    willNot: ['Remove it from the list — you can register it again whenever you choose'],
  },
  [CONNECTION_STATES.REGISTERED]: {
    will: ['Register the connection with Meshery without actively managing it yet'],
    note: 'Transition it to Connected when you want Meshery to begin managing it.',
  },
  [CONNECTION_STATES.CONNECTED]: {
    will: [
      'Actively manage this connection: communicate with the system, collect data, and keep state in sync',
    ],
  },
  [CONNECTION_STATES.MAINTENANCE]: {
    will: ['Place the connection under administrative maintenance'],
    note: 'Meshery pauses management operations until you transition it back.',
  },
  [CONNECTION_STATES.DISCOVERED]: {
    will: ['Return the connection to discovered: Meshery knows about it but does not manage it'],
    note: 'Register and connect it when you want Meshery to manage it again.',
  },
  [CONNECTION_STATES.NOTFOUND]: {
    will: ['Mark the connection as not found'],
    note: 'You can delete it or try re-registering it.',
  },
};

// Kubernetes connections carry extra in-cluster machinery, so a few
// transitions have broader consequences than the generic ones above.
// Operator/Broker wording is soft ("when present") so embedded MeshSync mode
// is not mis-described as always deploying in-cluster components.
const KUBERNETES_STATE_CONSEQUENCES: Record<string, StateConsequences> = {
  [CONNECTION_STATES.DELETED]: {
    will: [
      'Remove the connection and its associated credential from Meshery',
      'Undeploy Meshery Operator, MeshSync, and Meshery Broker from the cluster (when present)',
      "Purge cluster data collected through MeshSync from Meshery's database",
    ],
    willNot: ['Delete or modify the Kubernetes cluster itself'],
    note: 'Presenting the same kubeconfig context again may auto-reconnect. Prefer Disconnect if you want to keep the record and avoid reconnection.',
  },
  [CONNECTION_STATES.DISCONNECTED]: {
    will: ["Stop managing the cluster and tear down communication with the cluster's controllers"],
    willNot: ['Delete MeshSync data already collected for this connection'],
    note: 'You can connect the cluster again later without re-registering.',
  },
  [CONNECTION_STATES.CONNECTED]: {
    will: [
      'Begin actively managing the cluster',
      'Depending on MeshSync mode, bring up Meshery Operator, MeshSync, and Meshery Broker (when used) to stream live cluster state',
    ],
  },
};

const FALLBACK_CONSEQUENCES = (targetStatus: string): StateConsequences => ({
  will: [`Transition the connection to the ${targetStatus.toUpperCase()} state`],
});

export const getConsequences = (
  kind: string | undefined,
  targetStatus: string,
): StateConsequences =>
  (kind === CONNECTION_KINDS.KUBERNETES && KUBERNETES_STATE_CONSEQUENCES[targetStatus]) ||
  STATE_CONSEQUENCES[targetStatus] ||
  FALLBACK_CONSEQUENCES(targetStatus);

const getDocsTooltipMarkdown = (kind: string | undefined): string =>
  kind === CONNECTION_KINDS.KUBERNETES
    ? `Every connection moves through a defined lifecycle of states. Learn more about the [Kubernetes connection lifecycle](${KUBERNETES_CONNECTION_LIFECYCLE_DOCS_URL}) and the [behavior of state transitions](${CONNECTION_DOCS_URL}) in Meshery Docs.`
    : `Every connection moves through a defined lifecycle of states. Learn more about the [lifecycle of connections and the behavior of state transitions](${CONNECTION_DOCS_URL}) in Meshery Docs.`;

/**
 * Definition-authored transition copy often restates the modal lead
 * ("Are you sure… transition from X to Y"). Suppress it when it adds no
 * decision-relevant fact beyond the consequence bullets — especially on delete,
 * where every entry path should look the same.
 */
export const shouldShowTransitionDescription = (
  description: string | undefined,
  options: { isDelete: boolean; currentStatus?: string; targetStatus: string },
): description is string => {
  if (!description?.trim()) {
    return false;
  }
  if (options.isDelete) {
    return false;
  }

  const normalized = description.trim().toLowerCase();
  // Prompt-style leftovers from connection definitions / getStatusTransition.
  if (normalized.startsWith('are you sure')) {
    return false;
  }

  const { currentStatus, targetStatus } = options;
  if (currentStatus) {
    const fromTo = `from ${currentStatus.toLowerCase()} to ${targetStatus.toLowerCase()}`;
    if (normalized === fromTo || normalized.includes(`transition ${fromTo}`)) {
      return false;
    }
  }

  return true;
};

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
   * transitionMap. Shown only when it adds a fact the consequence list does
   * not already cover (never for delete — all delete entry paths share one body).
   */
  transitionDescription?: string;
}

export interface ConnectionStateTransitionModalRef {
  /** Resolves `true` when the user confirms, `false` on cancel/dismiss. */
  show: (params: ConnectionStateTransitionShowParams) => Promise<boolean>;
}

const MAX_LISTED_NAMES = 3;

const bulletListSx = {
  margin: '0.25rem 0 0',
  paddingLeft: '1.25rem',
  color: 'inherit',
} as const;

// Sistent ModalButtonDanger sets backgroundColor on its own class, but MUI's
// `.MuiButton-contained` rule wins on specificity and paints brand teal instead
// of error red. Raise specificity here until Sistent ships the same fix.
// Theme callbacks use Sistent palette tokens (no hard-coded colors).
const dangerButtonSx = {
  '&&.MuiButton-contained': {
    backgroundColor: (theme) => theme.palette.background?.error?.default,
    color: (theme) => theme.palette.text?.constant?.white ?? theme.palette.common?.white,
    '&:hover': {
      backgroundColor: (theme) =>
        theme.palette.background?.error?.hover ?? theme.palette.background?.error?.default,
    },
  },
};

const ConsequenceSection = ({
  title,
  items,
  testId,
  color,
}: {
  title: string;
  items: string[];
  testId: string;
  color: string;
}) => {
  if (items.length === 0) {
    return null;
  }
  return (
    <Box data-testid={testId} sx={{ marginTop: '0.5rem', color }}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: 'inherit' }}>
        {title}
      </Typography>
      <Box component="ul" sx={bulletListSx}>
        {items.map((item) => (
          <Typography component="li" key={item} variant="body2" sx={{ color: 'inherit' }}>
            {item}
          </Typography>
        ))}
      </Box>
    </Box>
  );
};

/**
 * Lists named connections for the lead sentence. Remainder is computed against
 * the full selection size (not only named rows) so "Delete N connections" and
 * "and M more" stay consistent when some rows have empty names.
 */
export const ConnectionNames = ({ connections }: { connections: TransitioningConnection[] }) => {
  const names = connections.map((connection) => connection.name).filter(Boolean) as string[];
  if (names.length === 0) {
    return null;
  }
  const listed = names.slice(0, MAX_LISTED_NAMES);
  const remainder = connections.length - listed.length;
  return (
    <>
      {' '}
      (<b>{listed.join(', ')}</b>
      {remainder > 0 ? ` and ${remainder} more` : ''})
    </>
  );
};

const normalizeStatus = (status: string | undefined): string | undefined =>
  status === undefined ? undefined : status.toLowerCase();

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
          // Normalize status case so isDelete / consequence maps stay reliable
          // regardless of caller (table lowercases; wizard historically did not).
          setParams({
            ...showParams,
            targetStatus: showParams.targetStatus.toLowerCase(),
            currentStatus: normalizeStatus(showParams.currentStatus),
          });
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
    const secondaryColor = theme.palette.text.secondary;
    const consequences = getConsequences(kind, targetStatus);
    const showTransitionDescription = shouldShowTransitionDescription(transitionDescription, {
      isDelete,
      currentStatus,
      targetStatus,
    });

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
            // Amber/yellow via Sistent status warning (#F0A303), not white on the header.
            fill={
              theme.palette.status?.warning ??
              theme.palette.background?.warning?.default ??
              theme.palette.warning?.main
            }
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

          <Box data-testid="connection-transition-ramifications" sx={{ marginTop: '0.5rem' }}>
            <ConsequenceSection
              title="This will:"
              items={consequences.will}
              testId="connection-transition-will"
              color={secondaryColor}
            />
            <ConsequenceSection
              title="This will not:"
              items={consequences.willNot ?? []}
              testId="connection-transition-will-not"
              color={secondaryColor}
            />
            {consequences.note && (
              <Typography
                variant="body2"
                data-testid="connection-transition-note"
                sx={{ marginTop: '0.5rem', color: secondaryColor }}
              >
                <Box component="span" sx={{ fontWeight: 600 }}>
                  Note:{' '}
                </Box>
                {consequences.note}
              </Typography>
            )}
            {plural && (
              <Typography
                variant="body2"
                data-testid="connection-transition-bulk-scope"
                sx={{ marginTop: '0.5rem', color: secondaryColor }}
              >
                This applies to each selected connection.
              </Typography>
            )}
          </Box>

          {showTransitionDescription && (
            <Typography
              variant="body2"
              data-testid="connection-transition-description"
              sx={{ marginTop: '0.5rem', color: secondaryColor }}
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
            <ConfirmButton
              onClick={() => settle(true)}
              data-testid="connection-transition-confirm"
              sx={isDelete ? dangerButtonSx : undefined}
            >
              {isDelete ? 'Delete' : 'Confirm'}
            </ConfirmButton>
          </Box>
        </ModalFooter>
      </Modal>
    );
  },
);

export default ConnectionStateTransitionModal;
