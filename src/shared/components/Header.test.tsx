import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';

import { Header } from './Header';

const mockUsePathname = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('Header', () => {
  it('uses in-page anchors on the homepage', () => {
    mockUsePathname.mockReturnValue('/');

    render(<Header />);

    expect(screen.getByRole('link', { name: /features/i })).toHaveAttribute(
      'href',
      '#features',
    );
    expect(screen.getByRole('link', { name: /use cases/i })).toHaveAttribute(
      'href',
      '#use-cases',
    );
    expect(screen.getByRole('link', { name: /pricing/i })).toHaveAttribute(
      'href',
      '#pricing',
    );
  });

  it('routes homepage anchors correctly from nested pages', () => {
    mockUsePathname.mockReturnValue('/dashboard');

    render(<Header />);

    expect(screen.getByRole('link', { name: /features/i })).toHaveAttribute(
      'href',
      '/#features',
    );
    expect(screen.getByRole('link', { name: /use cases/i })).toHaveAttribute(
      'href',
      '/#use-cases',
    );
    expect(screen.getByRole('link', { name: /pricing/i })).toHaveAttribute(
      'href',
      '/#pricing',
    );
  });

  it('renders navigation links', () => {
    mockUsePathname.mockReturnValue('/');

    render(<Header />);

    expect(screen.getAllByText(/Features/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Pricing/i)).toBeInTheDocument();
  });

  it('renders logo', () => {
    mockUsePathname.mockReturnValue('/');

    render(<Header />);

    expect(screen.getAllByAltText(/Logo/i).length).toBeGreaterThan(0);
  });
});
