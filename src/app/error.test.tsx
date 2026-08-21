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
  it('renders fallback and calls retry', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();

    render(
      <ErrorBoundary
        error={new Error('Crash')}
        reset={vi.fn()}
        retry={retry}
      />,
    );

    expect(screen.getByText('Something went wrong!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalled();
    expect(mockLogger.child).toHaveBeenCalled();
  });
});
