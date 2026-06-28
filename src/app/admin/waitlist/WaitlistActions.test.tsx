import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WaitlistActions } from './WaitlistActions';

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

describe('WaitlistActions', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    vi.restoreAllMocks();
  });

  it('approves an entry and refreshes the page', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    render(
      <WaitlistActions entryId="entry-1" entryEmail="person@example.com" />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Approve waitlist application from person@example.com',
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/waitlist/entry-1?action=approve',
      { method: 'POST' },
    );
    expect(await screen.findByText('Approved')).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an entry and refreshes the page', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    render(
      <WaitlistActions entryId="entry-2" entryEmail="person@example.com" />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Reject waitlist application from person@example.com',
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/waitlist/entry-2?action=reject',
      { method: 'POST' },
    );
    expect(await screen.findByText('Rejected')).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('shows an error state and allows retry after a failed request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'No longer pending' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(
      <WaitlistActions entryId="entry-3" entryEmail="person@example.com" />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Approve waitlist application from person@example.com',
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/waitlist/entry-3?action=approve',
      { method: 'POST' },
    );
    expect(await screen.findByText('No longer pending')).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      screen.getByRole('button', {
        name: 'Approve waitlist application from person@example.com',
      }),
    ).toBeInTheDocument();
  });
});
