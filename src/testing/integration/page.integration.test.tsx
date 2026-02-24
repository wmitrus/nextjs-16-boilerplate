import { render, screen } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect } from 'vitest';

import { Header } from '@/shared/components/Header';

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

describe('Home Page', () => {
  it('renders header with navigation', () => {
    render(<Header />);
    // Check for Features link in the header navigation
    expect(screen.getAllByText(/Features/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Pricing/i)).toBeInTheDocument();
  });

  it('renders the logo', () => {
    render(<Header />);
    // Check for logo images
    expect(screen.getAllByAltText(/Logo/i).length).toBeGreaterThan(0);
  });
});
