import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';

import { Header } from './Header';

describe('Header', () => {
  it('renders navigation links', () => {
    render(<Header />);

    expect(screen.getAllByText(/Features/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Pricing/i)).toBeInTheDocument();
  });

  it('renders logo', () => {
    render(<Header />);

    expect(screen.getAllByAltText(/Logo/i).length).toBeGreaterThan(0);
  });
});
