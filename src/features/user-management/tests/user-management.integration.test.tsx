import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import UsersPage from '@/app/users/page';

describe('UsersPage Integration', () => {
  it('fetches and displays users on mount', async () => {
    render(<UsersPage />);

    // Check loading state
    expect(screen.getByLabelText('loading')).toBeInTheDocument();

    // Wait for users to be displayed
    await waitFor(() => {
      expect(screen.getByText('MSW User 1')).toBeInTheDocument();
      expect(screen.getByText('MSW User 2')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('loading')).not.toBeInTheDocument();
  });

  it('handles error state', async () => {
    const { server } = await import('@/shared/lib/mocks/server');
    const { http, HttpResponse } = await import('msw');

    // Override handler for this test
    server.use(
      http.get('/api/users', () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to fetch users',
      );
    });
  });
});
