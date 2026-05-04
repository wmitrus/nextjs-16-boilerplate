import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSession } from 'next-auth/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { HeaderAuthControlsAuthjs } from './HeaderAuthControlsAuthjs';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

const mockUseSession = vi.mocked(useSession);

describe('HeaderAuthControlsAuthjs', () => {
  it('shows skeleton while loading', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'loading',
      update: vi.fn(),
    });
    const { container } = render(<HeaderAuthControlsAuthjs />);

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows sign in and sign up links when unauthenticated', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: vi.fn(),
    });
    render(<HeaderAuthControlsAuthjs />);

    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('shows user email and sign out button when avatar menu is opened', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: { email: 'user@example.com', id: 'abc', emailVerified: false },
        expires: '2099-01-01',
      },
      status: 'authenticated',
      update: vi.fn(),
    });
    render(<HeaderAuthControlsAuthjs />);

    const avatarButton = screen.getByRole('button', { expanded: false });
    await userEvent.click(avatarButton);

    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });
});
