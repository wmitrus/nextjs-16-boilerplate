import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const signOutMock = vi.fn();
const pushMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({
    signOut: signOutMock,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

import { BootstrapErrorUI } from './bootstrap-error';

describe('BootstrapErrorUI', () => {
  it.each([
    [
      'cross_provider_linking',
      'This account is linked to a different sign-in method. Please sign in with your original provider or contact support.',
    ],
    [
      'quota_exceeded',
      'This workspace has reached its user limit. Please contact your workspace administrator to upgrade the plan.',
    ],
    [
      'tenant_config',
      'Workspace configuration is incomplete or missing. Please contact your administrator.',
    ],
  ] as const)(
    'renders the correct user-facing message for %s',
    (error, expectedMessage) => {
      render(<BootstrapErrorUI error={error} />);

      expect(
        screen.getByRole('heading', {
          name: 'Sign-in could not be completed',
        }),
      ).toBeInTheDocument();
      expect(screen.getByText(expectedMessage)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Try Again' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Sign Out' }),
      ).toBeInTheDocument();
    },
  );

  it.each([
    'cross_provider_linking',
    'quota_exceeded',
    'tenant_config',
    'Failed query:',
    'auth_user_identities',
    'tenant_attributes',
  ])('does not expose internal error details: %s', (internalDetail) => {
    render(<BootstrapErrorUI error="tenant_config" />);

    expect(screen.queryByText(internalDetail)).not.toBeInTheDocument();
  });
});
