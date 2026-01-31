import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ApiClientError } from '@/shared/lib/api/api-client';

vi.mock('@/features/user-management/api/userService', () => ({
  getUsers: vi.fn(),
}));

const mockLogger = {
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
};

vi.mock('@/core/logger/client', () => ({
  logger: mockLogger,
}));

describe('UsersPage error integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows ErrorAlert for ApiClientError and logs correlation ID', async () => {
    const { getUsers } =
      await import('@/features/user-management/api/userService');

    vi.mocked(getUsers).mockRejectedValue(
      new ApiClientError(
        { status: 'server_error', error: 'Failure', code: 'E_FAIL' },
        500,
        'corr-123',
      ),
    );

    const { default: UsersPage } = await import('@/app/users/page');

    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('ID: corr-123')).toBeInTheDocument();
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'corr-123' }),
      expect.any(String),
    );
  });
});
