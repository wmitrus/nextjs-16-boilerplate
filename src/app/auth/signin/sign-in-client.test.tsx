import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());

vi.mock('next-auth/react', () => ({
  signIn: signInMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

import { SignInClient } from './sign-in-client';

describe('AuthJS SignInClient', () => {
  beforeEach(() => {
    signInMock.mockReset();
    replaceMock.mockReset();
  });

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

  it('navigates through the App Router after successful credentials sign-in', async () => {
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
      expect(replaceMock).toHaveBeenCalledWith(
        '/auth/bootstrap/start?redirect_url=%2Fdashboard',
      );
    });
  });

  it('shows a retry message when the AuthJS client request rejects', async () => {
    signInMock.mockRejectedValue(new Error('Connection closed.'));

    render(<SignInClient />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
  });

  it('shows an AuthJS credentials error without navigating', async () => {
    signInMock.mockResolvedValue({ error: 'CredentialsSignin' });

    render(<SignInClient />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

    expect(
      await screen.findByText('Incorrect email or password.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('navigates to email verification for an unverified account', async () => {
    signInMock.mockResolvedValue({ error: 'EmailNotVerified' });

    render(<SignInClient />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/auth/verify-email-pending');
    });
  });

  it('rejects a cross-origin AuthJS callback URL', async () => {
    signInMock.mockResolvedValue({
      url: 'https://untrusted.example/dashboard',
    });

    render(<SignInClient />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
