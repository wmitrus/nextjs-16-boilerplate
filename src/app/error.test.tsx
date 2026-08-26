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

const pushMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
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

  it('navigates home via the router on "Go home"', async () => {
    const user = userEvent.setup();

    render(
      <ErrorBoundary
        error={new Error('Crash')}
        reset={vi.fn()}
        retry={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Go home' }));

    expect(pushMock).toHaveBeenCalledWith('/');
  });
});
