import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="next-auth-provider">{children}</div>
  ),
}));

import { SessionProvider } from './SessionProvider';

describe('SessionProvider', () => {
  it('renders children wrapped in the next-auth SessionProvider', () => {
    const { getByTestId, getByText } = render(
      <SessionProvider>
        <span>child content</span>
      </SessionProvider>,
    );
    expect(getByTestId('next-auth-provider')).toBeInTheDocument();
    expect(getByText('child content')).toBeInTheDocument();
  });
});
