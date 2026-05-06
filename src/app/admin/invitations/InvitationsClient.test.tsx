import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { InvitationsClient } from './InvitationsClient';

describe('InvitationsClient', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('surfaces the server_error payload message for duplicate invitations', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'server_error',
          error: 'A pending invitation already exists for this email',
          code: 'DUPLICATE_INVITATION',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    render(
      <InvitationsClient
        invitations={[]}
        roles={[{ id: 'role-1', name: 'Owner' }]}
      />,
    );

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Send Invitation' }));

    await screen.findByText(
      'A pending invitation already exists for this email',
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('refreshes the page after a successful send', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          data: {
            invitationId: 'inv-1',
            email: 'alice@example.com',
            expiresAt: '2026-05-01T00:00:00.000Z',
          },
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    render(
      <InvitationsClient
        invitations={[]}
        roles={[{ id: 'role-1', name: 'Owner' }]}
      />,
    );

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Send Invitation' }));

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
    await screen.findByText('Invitation sent to alice@example.com');
  });
});
