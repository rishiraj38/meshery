import React, { createRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sistent/sistent', () => ({
  Modal: ({ open, title, children, headerIcon }) =>
    open ? (
      <div data-testid="modal">
        {headerIcon}
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
  ModalBody: ({ children }) => <div>{children}</div>,
  ModalFooter: ({ children }) => <div>{children}</div>,
  ModalButtonPrimary: ({ children, onClick, ...props }) => (
    <button data-variant="primary" onClick={onClick} type="button" {...props}>
      {children}
    </button>
  ),
  ModalButtonSecondary: ({ children, onClick, ...props }) => (
    <button data-variant="secondary" onClick={onClick} type="button" {...props}>
      {children}
    </button>
  ),
  ModalButtonDanger: ({ children, onClick, ...props }) => (
    <button data-variant="danger" onClick={onClick} type="button" {...props}>
      {children}
    </button>
  ),
  CustomTooltip: ({ children, title }) => (
    <div data-testid="tooltip" data-title={String(title)}>
      {children}
    </div>
  ),
  IconButton: ({ children, onClick, ...props }) => {
    // Drop MUI-only props so React does not warn in the unit mock.
    const { disableRipple: _disableRipple, sx: _sx, size: _size, ...domProps } = props;
    return (
      <button onClick={onClick} type="button" {...domProps}>
        {children}
      </button>
    );
  },
  InfoOutlinedIcon: () => <svg data-testid="info-outlined-icon" />,
  // Capture fill so we can assert amber/warning theming.
  WarningIcon: (props) => <svg data-testid="warning-icon" data-fill={props.fill} />,
  Box: ({ children, component, ...props }) => {
    const Tag = component || 'div';
    return <Tag {...props}>{children}</Tag>;
  },
  Typography: ({ children, component, ...props }) => {
    const Tag = component || 'span';
    return <Tag {...props}>{children}</Tag>;
  },
  useTheme: () => ({
    palette: {
      text: { secondary: 'gray', constant: { white: 'white' } },
      common: { white: 'white' },
      // Named tokens only in the mock (no hex/rgb literals — ui color-literal audit).
      status: { warning: 'warning-amber' },
      background: {
        error: { default: 'error-default', hover: 'error-hover' },
        warning: { default: 'warning-amber' },
      },
      warning: { main: 'warning-amber' },
    },
  }),
}));

vi.mock('../../css/icons.styles', () => ({
  iconLarge: {},
  iconMedium: {},
  iconSmall: {},
}));

vi.mock('../../utils/utils', () => ({
  formatToTitleCase: (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value),
}));

import ConnectionStateTransitionModal, {
  KUBERNETES_CONNECTION_LIFECYCLE_DOCS_URL,
  shouldShowTransitionDescription,
} from './ConnectionStateTransitionModal';
import type { ConnectionStateTransitionModalRef } from './ConnectionStateTransitionModal';

const setup = () => {
  const ref = createRef<ConnectionStateTransitionModalRef>();
  render(<ConnectionStateTransitionModal ref={ref} />);
  return ref;
};

describe('shouldShowTransitionDescription', () => {
  it('hides definition copy on delete so every delete entry path matches', () => {
    expect(
      shouldShowTransitionDescription(
        'Are you sure you want to transition from not found to deleted? This will remove the unreachable connection completely by unregistering it.',
        { isDelete: true, currentStatus: 'not found', targetStatus: 'deleted' },
      ),
    ).toBe(false);
  });

  it('hides prompt-style "Are you sure" leftovers on non-delete transitions', () => {
    expect(
      shouldShowTransitionDescription(
        'Are you sure you want to transition from discovered to registered?',
        { isDelete: false, currentStatus: 'discovered', targetStatus: 'registered' },
      ),
    ).toBe(false);
  });

  it('keeps authored descriptions that add a real transition-specific fact', () => {
    expect(
      shouldShowTransitionDescription('Registration description from the connection definition.', {
        isDelete: false,
        currentStatus: 'discovered',
        targetStatus: 'registered',
      }),
    ).toBe(true);
  });
});

describe('ConnectionStateTransitionModal', () => {
  it('renders nothing until show() is called', () => {
    setup();
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('explains a Kubernetes delete with scannable consequences and a red confirm button', async () => {
    const ref = setup();

    let resolved: boolean | undefined;
    act(() => {
      ref.current
        .show({
          targetStatus: 'deleted',
          kind: 'kubernetes',
          connections: [{ id: 'c1', name: 'prod-cluster' }],
        })
        .then((value) => (resolved = value));
    });

    expect(await screen.findByText('Delete Kubernetes connection?')).toBeInTheDocument();
    expect(screen.getByTestId('warning-icon')).toHaveAttribute('data-fill', 'warning-amber');
    expect(screen.getByTestId('connection-transition-lead')).toHaveTextContent('prod-cluster');
    expect(screen.getByTestId('connection-transition-lead')).toHaveTextContent(
      'its associated credential',
    );

    const will = screen.getByTestId('connection-transition-will');
    expect(will).toHaveTextContent('This will:');
    expect(will).toHaveTextContent('Meshery Operator');
    expect(will).toHaveTextContent('when present');
    expect(will).toHaveTextContent(
      "Purge cluster data collected through MeshSync from Meshery's database",
    );

    const willNot = screen.getByTestId('connection-transition-will-not');
    expect(willNot).toHaveTextContent('This will not:');
    expect(willNot).toHaveTextContent('Kubernetes cluster itself');

    const note = screen.getByTestId('connection-transition-note');
    expect(note).toHaveTextContent('Note:');
    expect(note).toHaveTextContent('auto-reconnect');
    expect(note).toHaveTextContent('Disconnect');

    const confirm = screen.getByTestId('connection-transition-confirm');
    expect(confirm).toHaveAttribute('data-variant', 'danger');
    expect(confirm).toHaveTextContent('Delete');

    await userEvent.click(confirm);
    expect(resolved).toBe(true);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('does not stack definition transitionDescription on delete', async () => {
    const ref = setup();

    act(() => {
      ref.current.show({
        targetStatus: 'deleted',
        currentStatus: 'not found',
        kind: 'kubernetes',
        connections: [{ id: 'c1', name: 'unreachable-cluster' }],
        transitionDescription:
          'Are you sure you want to transition from not found to deleted? This will remove the unreachable connection completely by unregistering it.',
      });
    });

    await screen.findByText('Delete Kubernetes connection?');
    expect(screen.queryByTestId('connection-transition-description')).not.toBeInTheDocument();
    expect(screen.getByTestId('connection-transition-will')).toBeInTheDocument();
  });

  it('normalizes mixed-case targetStatus so delete still uses danger styling', async () => {
    const ref = setup();

    act(() => {
      ref.current.show({
        targetStatus: 'DELETED',
        kind: 'kubernetes',
        connections: [{ id: 'c1', name: 'prod-cluster' }],
      });
    });

    expect(await screen.findByText('Delete Kubernetes connection?')).toBeInTheDocument();
    expect(screen.getByTestId('connection-transition-confirm')).toHaveAttribute(
      'data-variant',
      'danger',
    );
  });

  it('reconciles bulk title count with "and N more" when some names are empty', async () => {
    const ref = setup();

    act(() => {
      ref.current.show({
        targetStatus: 'deleted',
        kind: 'kubernetes',
        connections: [
          { id: 'c1', name: 'docker-desktop' },
          { id: 'c2', name: 'meshery' },
          { id: 'c3', name: 'Artifact Hub' },
          { id: 'c4', name: '' },
          { id: 'c5', name: 'delta' },
        ],
      });
    });

    // 5 total; 3 listed names; remainder uses connections.length so 5 - 3 = 2.
    expect(await screen.findByText('Delete 5 Kubernetes connections?')).toBeInTheDocument();
    const lead = screen.getByTestId('connection-transition-lead');
    expect(lead).toHaveTextContent('docker-desktop, meshery, Artifact Hub');
    expect(lead).toHaveTextContent('and 2 more');
  });

  it('settles an in-flight confirmation as cancelled when show() is re-entered', async () => {
    const ref = setup();

    let firstResolved: boolean | undefined;
    act(() => {
      ref.current
        .show({
          targetStatus: 'deleted',
          connections: [{ id: 'c1', name: 'first' }],
        })
        .then((value) => (firstResolved = value));
    });

    let secondResolved: boolean | undefined;
    act(() => {
      ref.current
        .show({
          targetStatus: 'deleted',
          connections: [{ id: 'c2', name: 'second' }],
        })
        .then((value) => (secondResolved = value));
    });

    await screen.findByTestId('connection-transition-confirm');
    expect(firstResolved).toBe(false);

    await userEvent.click(screen.getByTestId('connection-transition-confirm'));
    expect(secondResolved).toBe(true);
  });

  it('resolves false on cancel', async () => {
    const ref = setup();

    let resolved: boolean | undefined;
    act(() => {
      ref.current
        .show({
          targetStatus: 'deleted',
          connections: [{ id: 'c1', name: 'some-conn' }],
        })
        .then((value) => (resolved = value));
    });

    await userEvent.click(await screen.findByTestId('connection-transition-cancel'));
    expect(resolved).toBe(false);
  });

  it('uses action-style titles and primary confirm for forward transitions', async () => {
    const ref = setup();

    act(() => {
      ref.current.show({
        targetStatus: 'registered',
        currentStatus: 'discovered',
        kind: 'kubernetes',
        connections: [{ id: 'c1', name: 'prod-cluster' }],
        transitionDescription: 'Registration description from the connection definition.',
      });
    });

    // Reuses CONNECTION_STATE_TO_TRANSITION_MAP verbs (Register), same shape as Delete.
    expect(await screen.findByText('Register Kubernetes connection?')).toBeInTheDocument();
    expect(screen.getByTestId('connection-transition-lead')).toHaveTextContent(
      'You are about to register the connection',
    );
    expect(screen.getByTestId('connection-transition-lead')).toHaveTextContent('prod-cluster');
    // Do not restate from→to in the lead; title/verb already carry the target.
    expect(screen.getByTestId('connection-transition-lead')).not.toHaveTextContent(
      'from DISCOVERED to REGISTERED',
    );
    const confirm = screen.getByTestId('connection-transition-confirm');
    expect(confirm).toHaveAttribute('data-variant', 'primary');
    expect(confirm).toHaveAttribute('data-severity', 'primary');
    expect(confirm).toHaveTextContent('Register');
    expect(screen.getByTestId('connection-transition-will')).toHaveTextContent(
      'Register the connection with Meshery',
    );
    expect(screen.getByTestId('connection-transition-description')).toHaveTextContent(
      'Registration description from the connection definition.',
    );
  });

  it('frames disconnect with a caution (warning) confirm, not delete-red or bare Confirm', async () => {
    const ref = setup();

    act(() => {
      ref.current.show({
        targetStatus: 'disconnected',
        currentStatus: 'connected',
        kind: 'kubernetes',
        connections: [{ id: 'c1', name: 'prod-cluster' }],
      });
    });

    expect(await screen.findByText('Disconnect Kubernetes connection?')).toBeInTheDocument();
    expect(screen.getByTestId('connection-transition-lead')).toHaveTextContent(
      'You are about to disconnect the connection',
    );
    const confirm = screen.getByTestId('connection-transition-confirm');
    expect(confirm).toHaveAttribute('data-severity', 'caution');
    expect(confirm).toHaveTextContent('Disconnect');
    // Still the primary component (Sistent has no warning button); severity is via sx.
    expect(confirm).toHaveAttribute('data-variant', 'primary');
  });

  it('uses Discover verb for discovered transitions (consistent with Delete/Disconnect)', async () => {
    const ref = setup();

    act(() => {
      ref.current.show({
        targetStatus: 'discovered',
        currentStatus: 'not found',
        connections: [{ id: 'c1', name: 'prom' }],
      });
    });

    expect(await screen.findByText('Discover connection?')).toBeInTheDocument();
    expect(screen.getByTestId('connection-transition-confirm')).toHaveTextContent('Discover');
  });

  it('summarizes bulk deletions and notes the per-connection scope', async () => {
    const ref = setup();

    act(() => {
      ref.current.show({
        targetStatus: 'deleted',
        kind: 'kubernetes',
        connections: [
          { id: 'c1', name: 'alpha' },
          { id: 'c2', name: 'beta' },
          { id: 'c3', name: 'gamma' },
          { id: 'c4', name: 'delta' },
        ],
      });
    });

    expect(await screen.findByText('Delete 4 Kubernetes connections?')).toBeInTheDocument();
    const lead = screen.getByTestId('connection-transition-lead');
    expect(lead).toHaveTextContent('alpha, beta, gamma');
    expect(lead).toHaveTextContent('and 1 more');
    expect(screen.getByTestId('connection-transition-bulk-scope')).toHaveTextContent(
      'This applies to each selected connection.',
    );
  });

  it('offers an info tooltip linking the relevant docs', async () => {
    const ref = setup();

    act(() => {
      ref.current.show({
        targetStatus: 'deleted',
        kind: 'kubernetes',
        connections: [{ id: 'c1', name: 'prod-cluster' }],
      });
    });

    await screen.findByTestId('connection-transition-info');
    const tooltips = screen.getAllByTestId('tooltip');
    const docsTooltip = tooltips.find((tooltip) =>
      (tooltip.getAttribute('data-title') || '').includes(KUBERNETES_CONNECTION_LIFECYCLE_DOCS_URL),
    );
    expect(docsTooltip).toBeDefined();
    expect(docsTooltip.getAttribute('data-title')).toContain(
      KUBERNETES_CONNECTION_LIFECYCLE_DOCS_URL,
    );
    expect(docsTooltip.getAttribute('data-title')).toContain(
      'docs.meshery.io/concepts/logical/connections',
    );
  });
});
