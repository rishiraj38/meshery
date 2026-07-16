import React, { createRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sistent/sistent', () => ({
  Modal: ({ open, title, children }) =>
    open ? (
      <div data-testid="modal">
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
  IconButton: ({ children, onClick, ...props }) => (
    <button onClick={onClick} type="button" {...props}>
      {children}
    </button>
  ),
  InfoOutlinedIcon: () => <svg data-testid="info-outlined-icon" />,
  WarningIcon: () => <svg data-testid="warning-icon" />,
  Box: ({ children }) => <div>{children}</div>,
  Typography: ({ children, ...props }) => <span {...props}>{children}</span>,
  useTheme: () => ({
    palette: {
      text: { secondary: 'gray', constant: { white: 'white' } },
      common: { white: 'white' },
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
} from './ConnectionStateTransitionModal';
import type { ConnectionStateTransitionModalRef } from './ConnectionStateTransitionModal';

const setup = () => {
  const ref = createRef<ConnectionStateTransitionModalRef>();
  render(<ConnectionStateTransitionModal ref={ref} />);
  return ref;
};

describe('ConnectionStateTransitionModal', () => {
  it('renders nothing until show() is called', () => {
    setup();
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('explains a Kubernetes delete with full ramifications and a red confirm button', async () => {
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
    expect(screen.getByTestId('connection-transition-lead')).toHaveTextContent('prod-cluster');
    expect(screen.getByTestId('connection-transition-lead')).toHaveTextContent(
      'its associated credential',
    );
    const ramifications = screen.getByTestId('connection-transition-ramifications');
    expect(ramifications).toHaveTextContent('Meshery Operator');
    expect(ramifications).toHaveTextContent("purged from Meshery's database");
    expect(ramifications).toHaveTextContent('NOT deleted');
    expect(ramifications).toHaveTextContent('Reconnecting');

    const confirm = screen.getByTestId('connection-transition-confirm');
    expect(confirm).toHaveAttribute('data-variant', 'danger');
    expect(confirm).toHaveTextContent('Delete');

    await userEvent.click(confirm);
    expect(resolved).toBe(true);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
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

  it('uses the primary (non-danger) button and transition copy for non-destructive transitions', async () => {
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

    expect(await screen.findByText('Transition connection to REGISTERED?')).toBeInTheDocument();
    expect(screen.getByTestId('connection-transition-lead')).toHaveTextContent(
      'from DISCOVERED to REGISTERED',
    );
    expect(screen.getByTestId('connection-transition-confirm')).toHaveAttribute(
      'data-variant',
      'primary',
    );
    expect(screen.getByTestId('connection-transition-description')).toHaveTextContent(
      'Registration description from the connection definition.',
    );
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
    expect(screen.getByTestId('connection-transition-ramifications')).toHaveTextContent(
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
      'docs.meshery.io/concepts/logical/connections',
    );
  });
});
