import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const signInMock = vi.hoisted(() => vi.fn());

vi.mock('next-auth/react', () => ({
  signIn: signInMock,
}));

import { SignInClient } from './sign-in-client';

describe('AuthJS SignInClient', () => {
  it('sends the default post-auth destination through bootstrap', async () => {
    signInMock.mockResolvedValue({
      url: '/auth/bootstrap/start?redirect_url=%2Fdashboard',
    });

    render(<SignInClient />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith('credentials', {
        email: 'admin@example.com',
        password: 'password123',
        callbackUrl: '/auth/bootstrap/start?redirect_url=%2Fdashboard',
        redirect: false,
      });
    });
  });

  it('preserves an explicit internal destination through bootstrap', async () => {
    signInMock.mockResolvedValue({
      url: '/auth/bootstrap/start?redirect_url=%2Fadmin',
    });

    render(<SignInClient callbackUrl="/admin" />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith('credentials', {
        email: 'admin@example.com',
        password: 'password123',
        callbackUrl: '/auth/bootstrap/start?redirect_url=%2Fadmin',
        redirect: false,
      });
    });
  });
});
