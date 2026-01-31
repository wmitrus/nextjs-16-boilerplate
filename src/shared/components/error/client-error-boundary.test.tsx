import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ClientErrorBoundary } from './client-error-boundary';

vi.mock('@/core/logger/client', () => ({
  logger: {
    error: vi.fn(),
  },
}));

type ThrowerProps = {
  shouldThrow: boolean;
};

function Thrower({ shouldThrow }: ThrowerProps) {
  if (shouldThrow) {
    throw new Error('Boom');
  }

  return <div>Safe content</div>;
}

describe('ClientErrorBoundary', () => {
  it('renders fallback UI when child throws', () => {
    render(
      <ClientErrorBoundary>
        <Thrower shouldThrow={true} />
      </ClientErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('supports custom fallback render and reset', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <ClientErrorBoundary
        fallback={(error, reset) => (
          <div>
            <div>Custom fallback: {error.message}</div>
            <button type="button" onClick={reset}>
              Reset
            </button>
          </div>
        )}
      >
        <Thrower shouldThrow={true} />
      </ClientErrorBoundary>,
    );

    expect(screen.getByText('Custom fallback: Boom')).toBeInTheDocument();

    rerender(
      <ClientErrorBoundary
        fallback={(error, reset) => (
          <div>
            <div>Custom fallback: {error.message}</div>
            <button type="button" onClick={reset}>
              Reset
            </button>
          </div>
        )}
      >
        <Thrower shouldThrow={false} />
      </ClientErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });
});
