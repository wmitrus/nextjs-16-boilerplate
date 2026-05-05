import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';

import { Header } from '@/shared/components/Header';

const mockUsePathname = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('Home Page', () => {
  it('renders header with navigation', () => {
    mockUsePathname.mockReturnValue('/');

    render(<Header />);
    // Check for Features link in the header navigation
    expect(screen.getAllByText(/Features/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Pricing/i)).toBeInTheDocument();
  });

  it('renders the logo', () => {
    mockUsePathname.mockReturnValue('/');

    render(<Header />);
    // Check for logo images
    expect(screen.getAllByAltText(/Logo/i).length).toBeGreaterThan(0);
  });
});
