import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import GlobalError from './global-error';

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

describe('Global error UI', () => {
  it('renders fallback and calls unstable_retry', async () => {
    const user = userEvent.setup();
    const unstable_retry = vi.fn();

    render(
      <GlobalError
        error={new Error('Critical')}
        reset={vi.fn()}
        unstable_retry={unstable_retry}
      />,
    );

    expect(screen.getByText('Critical Error')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Refresh Application' }),
    );

    expect(unstable_retry).toHaveBeenCalled();
    expect(mockLogger.child).toHaveBeenCalled();
  });
});
