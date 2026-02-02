import { render, screen } from '@testing-library/react';
import React from 'react';

import Home from '../page';

describe('Home Page', () => {
  it('renders the hero section with heading', () => {
    render(<Home />);
    expect(screen.getByText(/Build your next big idea/i)).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(<Home />);
    // Check for Features link in the header navigation
    expect(screen.getAllByText(/Features/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Pricing/i)).toBeInTheDocument();
  });

  it('renders the logo', () => {
    render(<Home />);
    // Check for multiple logo images (e.g., in header and footer)
    expect(screen.getAllByAltText(/Logo/i).length).toBeGreaterThan(0);
  });
});
