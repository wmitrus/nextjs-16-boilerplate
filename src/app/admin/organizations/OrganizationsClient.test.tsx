import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OrganizationsClient,
  type OrganizationSummary,
} from './OrganizationsClient';

const refreshMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const organizations: OrganizationSummary[] = [
  {
    id: '15000000-0000-4000-8000-000000000001',
    name: 'Acme HQ',
    slug: 'acme-hq',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    memberCount: 2,
    roleCount: 2,
    pendingInvitationCount: 1,
    isActive: true,
  },
  {
    id: '25000000-0000-4000-8000-000000000001',
    name: 'Beta Lab',
    slug: 'beta-lab',
    status: 'active',
    createdAt: '2026-01-02T00:00:00.000Z',
    memberCount: 1,
    roleCount: 1,
    pendingInvitationCount: 0,
    isActive: false,
  },
];

describe('OrganizationsClient', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('does not render the DB-backed active-org action for Clerk', () => {
    render(
      <OrganizationsClient
        authProvider="clerk"
        organizations={organizations}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Set active' }),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to active-org only in AuthJS mode', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    render(
      <OrganizationsClient
        authProvider="authjs"
        organizations={organizations}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set active' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/active-org',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ organizationId: organizations[1]?.id }),
        }),
      );
    });
    expect(refreshMock).toHaveBeenCalled();
  });
});
