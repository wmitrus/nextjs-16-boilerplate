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

describe('Global error UI', () => {
  it('renders fallback and calls reset', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(<GlobalError error={new Error('Critical')} reset={reset} />);

    expect(screen.getByText('Critical Error')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Refresh Application' }),
    );

    expect(reset).toHaveBeenCalled();
    expect(mockLogger.child).toHaveBeenCalled();
  });
});
