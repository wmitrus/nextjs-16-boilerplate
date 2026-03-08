import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./sign-in-client', () => ({
  SignInClient: () => <div data-testid="sign-in-client" />,
}));

import Page from './page';

import { mockEnv, resetEnvMocks } from '@/testing';

describe('SignInPage', () => {
  afterEach(() => {
    resetEnvMocks();
  });

  it('renders the client-only SignInClient when AUTH_PROVIDER is clerk', async () => {
    mockEnv.AUTH_PROVIDER = 'clerk';

    render(await Page());

    expect(screen.getByTestId('sign-in-client')).toBeInTheDocument();
    expect(
      screen.queryByText(/Sign-in UI is not configured/),
    ).not.toBeInTheDocument();
  });

  it('renders "not configured" message when AUTH_PROVIDER is not clerk', async () => {
    mockEnv.AUTH_PROVIDER = 'authjs';

    render(await Page());

    expect(
      screen.getByText(/Sign-in UI is not configured for AUTH_PROVIDER=/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('sign-in-client')).not.toBeInTheDocument();
  });
});
