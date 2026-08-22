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

// Real script loading (document.createElement('script')) is exercised by
// this repository's browser-driven checks, not here -- this stub just
// verifies SignInClient wires the widget's onVerify callback correctly.
vi.mock('@/shared/components/captcha/TurnstileWidget', () => ({
  TurnstileWidget: ({ onVerify }: { onVerify: (token: string) => void }) => (
    <button type="button" onClick={() => onVerify('mock-turnstile-token')}>
      Complete security check
    </button>
  ),
}));

import { SignInClient } from './sign-in-client';

import { mockEnv, resetEnvMocks } from '@/testing/infrastructure/env';

describe('AuthJS SignInClient', () => {
  beforeEach(() => {
    signInMock.mockReset();
    replaceMock.mockReset();
    resetEnvMocks();
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

  it('shows a locked-account message and does not navigate', async () => {
    signInMock.mockResolvedValue({ error: 'AccountTemporarilyLocked' });

    render(<SignInClient />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText(/temporarily locked/i)).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  describe('CAPTCHA challenge (SEC-34)', () => {
    beforeEach(() => {
      mockEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key';
    });

    it('does not render the widget until the server requires it', () => {
      render(<SignInClient />);
      expect(
        screen.queryByRole('button', { name: 'Complete security check' }),
      ).not.toBeInTheDocument();
    });

    it('renders the widget and disables submit after a CaptchaRequired response', async () => {
      signInMock.mockResolvedValue({ error: 'CaptchaRequired' });

      render(<SignInClient />);
      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'admin@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'password123' },
      });
      fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

      expect(
        await screen.findByText(/complete the security check/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Complete security check' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeDisabled();
    });

    it('re-enables submit and resubmits with the token once the widget verifies', async () => {
      signInMock.mockResolvedValueOnce({ error: 'CaptchaRequired' });

      render(<SignInClient />);
      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'admin@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'password123' },
      });
      fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));
      await screen.findByRole('button', { name: 'Complete security check' });

      fireEvent.click(
        screen.getByRole('button', { name: 'Complete security check' }),
      );
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();

      signInMock.mockResolvedValueOnce({
        url: '/auth/bootstrap/start?redirect_url=%2Fdashboard',
      });
      fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

      await waitFor(() => {
        expect(signInMock).toHaveBeenLastCalledWith(
          'credentials',
          expect.objectContaining({ cfTurnstileToken: 'mock-turnstile-token' }),
        );
      });
    });

    it('does not render the widget when no site key is configured, even if the server asks for one', async () => {
      mockEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY = undefined;
      signInMock.mockResolvedValue({ error: 'CaptchaRequired' });

      render(<SignInClient />);
      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'admin@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'password123' },
      });
      fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

      await screen.findByText(/complete the security check/i);
      expect(
        screen.queryByRole('button', { name: 'Complete security check' }),
      ).not.toBeInTheDocument();
    });
  });
});
