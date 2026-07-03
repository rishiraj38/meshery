import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PermissionInfo } from './PermissionInfo';
import { getPermissionMetadata } from '@/utils/permission_constants';

vi.mock('@/utils/permission_constants', () => ({
  getPermissionMetadata: vi.fn(),
  keys: {
    VIEW_CREDENTIALS: {
      action: '96759f76-4add-45f8-b4ef-d4ace5ab1bc4',
      subject: 'View Credentials',
    },
  },
}));

describe('PermissionInfo Component', () => {
  it('should render the info icon with correct aria label based on permission metadata', () => {
    vi.mocked(getPermissionMetadata).mockReturnValue({
      id: '96759f76-4add-45f8-b4ef-d4ace5ab1bc4',
      category: 'Security Management',
      subcategory: 'Credentials',
      function: 'View Credentials',
      description: 'Allows viewing of system credentials.',
    });

    render(<PermissionInfo permissionId="96759f76-4add-45f8-b4ef-d4ace5ab1bc4" />);

    const button = screen.getByRole('button', {
      name: /permission details for view credentials/i,
    });
    expect(button).toBeInTheDocument();
  });

  it('should render fallback text when metadata is not found', () => {
    vi.mocked(getPermissionMetadata).mockReturnValue(undefined);

    render(<PermissionInfo permissionId="non-existent" />);

    const button = screen.getByRole('button', { name: /permission details for action/i });
    expect(button).toBeInTheDocument();
  });
});
