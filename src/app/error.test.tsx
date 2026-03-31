import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ErrorBoundary from './error';

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  child: vi.fn(() => ({
    error: vi.fn(),
  })),
}));

vi.mock('@/core/logger/client', () => ({
  logger: mockLogger,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

describe('Root error boundary UI', () => {
  it('renders fallback and calls unstable_retry', async () => {
    const user = userEvent.setup();
    const unstable_retry = vi.fn();

    render(
      <ErrorBoundary
        error={new Error('Crash')}
        reset={vi.fn()}
        unstable_retry={unstable_retry}
      />,
    );

    expect(screen.getByText('Something went wrong!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(unstable_retry).toHaveBeenCalled();
    expect(mockLogger.child).toHaveBeenCalled();
  });
});
