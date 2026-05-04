import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthJsWorkspaceSwitcher } from './AuthJsWorkspaceSwitcher';

describe('AuthJsWorkspaceSwitcher', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing when organizations list is empty', () => {
    const { container } = render(
      <AuthJsWorkspaceSwitcher organizations={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a toggle button when organizations exist', () => {
    render(
      <AuthJsWorkspaceSwitcher
        organizations={[{ id: 'org-1', name: 'Acme' }]}
        activeOrganizationId="org-1"
      />,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('shows "Select organization" when no activeOrganizationId matches', () => {
    render(
      <AuthJsWorkspaceSwitcher
        organizations={[{ id: 'org-1', name: 'Acme' }]}
      />,
    );
    expect(screen.getByText('Select organization')).toBeInTheDocument();
  });

  it('opens the dropdown on button click', () => {
    render(
      <AuthJsWorkspaceSwitcher
        organizations={[
          { id: 'org-1', name: 'Acme' },
          { id: 'org-2', name: 'Beta Corp' },
        ]}
        activeOrganizationId="org-1"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /acme/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();
  });

  it('calls the active-org API with the selected org id', async () => {
    render(
      <AuthJsWorkspaceSwitcher
        organizations={[
          { id: 'org-1', name: 'Acme' },
          { id: 'org-2', name: 'Beta Corp' },
        ]}
        activeOrganizationId="org-1"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /acme/i }));
    fireEvent.click(screen.getByText('Beta Corp'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/active-org',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ organizationId: 'org-2' }),
        }),
      );
    });
  });

  it('shows an error when the active-org API rejects the switch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: vi
        .fn()
        .mockResolvedValue({ error: 'Organization membership required' }),
    });

    render(
      <AuthJsWorkspaceSwitcher
        organizations={[
          { id: 'org-1', name: 'Acme' },
          { id: 'org-2', name: 'Beta Corp' },
        ]}
        activeOrganizationId="org-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /acme/i }));
    fireEvent.click(screen.getByText('Beta Corp'));

    await waitFor(() => {
      expect(
        screen.getByText('Organization membership required'),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /acme/i })).toBeInTheDocument();
  });
});
