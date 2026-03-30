import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  SignIn: ({ path }: { path: string }) => (
    <div data-testid="clerk-sign-in" data-path={path} />
  ),
}));

import { SignInClient } from './sign-in-client';

describe('SignInClient', () => {
  it('renders Clerk SignIn with correct path after mount', () => {
    render(<SignInClient />);

    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
    expect(screen.getByTestId('clerk-sign-in')).toHaveAttribute(
      'data-path',
      '/sign-in',
    );
  });

  it('does not SSR the Clerk component — SignInClient is a client-only wrapper', () => {
    render(<SignInClient />);

    expect(screen.queryByText(/animate-pulse/)).not.toBeInTheDocument();
    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
  });
});
