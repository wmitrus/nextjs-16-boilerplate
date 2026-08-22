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
  it('renders fallback and calls retry', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();

    render(
      <GlobalError
        error={new Error('Critical')}
        reset={vi.fn()}
        retry={retry}
      />,
    );

    expect(screen.getByText('Critical Error')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Refresh Application' }),
    );

    expect(retry).toHaveBeenCalled();
    expect(mockLogger.child).toHaveBeenCalled();
  });
});
