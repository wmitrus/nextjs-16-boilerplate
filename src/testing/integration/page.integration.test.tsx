import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';

import { Header } from '@/shared/components/Header';

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
