import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InviteAcceptButton } from './InviteAcceptButton';

const assignMock = vi.fn();

describe('InviteAcceptButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    });
    assignMock.mockReset();
  });

  it('accepts the invitation and redirects through bootstrap', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: { invitationId: 'inv-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(
      <InviteAcceptButton
        token="invite-token"
        redirectUrl="/auth/bootstrap/start?redirect_url=%2Fdashboard"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/invite/invite-token', {
        method: 'POST',
      });
      expect(assignMock).toHaveBeenCalledWith(
        '/auth/bootstrap/start?redirect_url=%2Fdashboard',
      );
    });
  });

  it('shows an error when invitation acceptance fails', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invitation expired' }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(
      <InviteAcceptButton
        token="invite-token"
        redirectUrl="/auth/bootstrap/start?redirect_url=%2Fdashboard"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await screen.findByText('Invitation expired');
    expect(assignMock).not.toHaveBeenCalled();
  });
});
