import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ErrorBoundary from './error';

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock('@/core/logger/client', () => ({
  logger: mockLogger,
}));

describe('Root error boundary UI', () => {
  it('renders fallback and calls reset', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(<ErrorBoundary error={new Error('Crash')} reset={reset} />);

    expect(screen.getByText('Something went wrong!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
