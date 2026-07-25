import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WaitlistJoinForm } from './WaitlistJoinForm';

describe('WaitlistJoinForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits email and optional name, then shows success', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 201 }));

    render(<WaitlistJoinForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/name/i), 'Ada');
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Join Waitlist' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', name: 'Ada' }),
    });
    expect(await screen.findByText("You're on the list!")).toBeInTheDocument();
    expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledWith('ada@example.com');
  });

  it('shows duplicate state for existing waitlist entries', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 409 }),
    );

    render(<WaitlistJoinForm />);

    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Join Waitlist' }));

    expect(await screen.findByText('Already registered')).toBeInTheDocument();
    expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
  });

  it('shows server error messages from failed responses', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Waitlist is closed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<WaitlistJoinForm />);

    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Join Waitlist' }));

    expect(await screen.findByText('Waitlist is closed')).toBeInTheDocument();
  });

  it('shows a network error when the request rejects', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    render(<WaitlistJoinForm />);

    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Join Waitlist' }));

    expect(
      await screen.findByText('Network error. Please try again.'),
    ).toBeInTheDocument();
  });
});
