import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./sign-up-client', () => ({
  SignUpClient: () => <div data-testid="sign-up-client" />,
}));

import SignUpPage from './page';

import { mockEnv, resetEnvMocks } from '@/testing';

describe('SignUpPage', () => {
  afterEach(() => {
    resetEnvMocks();
  });

  it('renders the client-only SignUpClient when AUTH_PROVIDER is clerk', async () => {
    mockEnv.AUTH_PROVIDER = 'clerk';

    render(await SignUpPage());

    expect(screen.getByTestId('sign-up-client')).toBeInTheDocument();
    expect(
      screen.queryByText(/Sign-up UI is not configured/),
    ).not.toBeInTheDocument();
  });

  it('renders "not configured" message when AUTH_PROVIDER is not clerk', async () => {
    mockEnv.AUTH_PROVIDER = 'authjs';

    render(await SignUpPage());

    expect(
      screen.getByText(/Sign-up UI is not configured for AUTH_PROVIDER=/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('sign-up-client')).not.toBeInTheDocument();
  });
});
