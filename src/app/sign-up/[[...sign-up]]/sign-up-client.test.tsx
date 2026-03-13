import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  SignUp: ({ path }: { path: string }) => (
    <div data-testid="clerk-sign-up" data-path={path} />
  ),
}));

import { SignUpClient } from './sign-up-client';

describe('SignUpClient', () => {
  it('renders Clerk SignUp with correct path after mount', () => {
    render(<SignUpClient />);

    expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
    expect(screen.getByTestId('clerk-sign-up')).toHaveAttribute(
      'data-path',
      '/sign-up',
    );
  });

  it('does not SSR the Clerk component — SignUpClient is a client-only wrapper', () => {
    render(<SignUpClient />);

    expect(screen.queryByText(/animate-pulse/)).not.toBeInTheDocument();
    expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
  });
});
