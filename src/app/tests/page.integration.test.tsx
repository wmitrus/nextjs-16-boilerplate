import { render, screen } from '@testing-library/react';
import React from 'react';

import Home from '../page';

describe('Home Page', () => {
  it('renders the welcome message', () => {
    render(<Home />);
    expect(
      screen.getByText(/To get started, edit the page.tsx file/i),
    ).toBeInTheDocument();
  });

  it('renders the documentation link', () => {
    render(<Home />);
    const docsLink = screen.getByRole('link', { name: /documentation/i });
    expect(docsLink).toBeInTheDocument();
    expect(docsLink).toHaveAttribute(
      'href',
      expect.stringContaining('nextjs.org/docs'),
    );
  });

  it('renders the Vercel logo', () => {
    render(<Home />);
    expect(screen.getByAltText(/Vercel logomark/i)).toBeInTheDocument();
  });
});
