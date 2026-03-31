import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import UsersErrorBoundary from './error';

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock('@/core/logger/client', () => ({
  logger: mockLogger,
}));

describe('Users error boundary UI', () => {
  it('renders fallback and calls unstable_retry', async () => {
    const user = userEvent.setup();
    const unstable_retry = vi.fn();

    render(
      <UsersErrorBoundary
        error={new Error('Oops')}
        reset={vi.fn()}
        unstable_retry={unstable_retry}
      />,
    );

    expect(screen.getByText('Users page crashed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry users page' }));

    expect(unstable_retry).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
