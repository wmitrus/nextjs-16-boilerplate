import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import { Header } from './Header';

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SignUpButton: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SignedIn: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="signed-in">{children}</div>
  ),
  SignedOut: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="signed-out">{children}</div>
  ),
  UserButton: () => <div data-testid="user-button">User Button</div>,
}));

describe('Header', () => {
  it('renders auth buttons when signed out', () => {
    render(<Header />);

    expect(screen.getByTestId('signed-out')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('renders user button when signed in', () => {
    render(<Header />);

    expect(screen.getByTestId('signed-in')).toBeInTheDocument();
    expect(screen.getByTestId('user-button')).toBeInTheDocument();
  });
});
