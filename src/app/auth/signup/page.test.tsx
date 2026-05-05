import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getServerSessionMock = vi.hoisted(() => vi.fn());

vi.mock('next/server', () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next-auth/next', () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock('@/modules/auth/infrastructure/authjs/auth', () => ({
  authOptions: {},
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: vi.fn(() => ({
    resolve: vi.fn(),
  })),
}));

vi.mock('./sign-up-client', () => ({
  SignUpClient: () => <div data-testid="sign-up-client" />,
}));

import { SignUpPageContent } from './page';

import { mockEnv, resetEnvMocks } from '@/testing';

describe('AuthJS SignUpPage', () => {
  afterEach(() => {
    resetEnvMocks();
    getServerSessionMock.mockReset();
  });

  it('renders the default sign-in link with the bootstrap callback', async () => {
    mockEnv.AUTH_PROVIDER = 'authjs';
    mockEnv.REGISTRATION_MODE = 'open';
    getServerSessionMock.mockResolvedValue(null);

    render(
      await SignUpPageContent({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByTestId('sign-up-client')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth/signin?callbackUrl=%2Fauth%2Fbootstrap%2Fstart%3Fredirect_url%3D%252Fdashboard',
    );
  });
});
