import { describe, expect, it, vi } from 'vitest';

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

describe('User Management Error Integration', () => {
  it('creates ApiClientError with correlation ID correctly', () => {
    const error = new ApiClientError(
      { status: 'server_error', error: 'Failure', code: 'E_FAIL' },
      500,
      'corr-123',
    );

    expect(error.statusCode).toBe(500);
    expect(error.status).toBe('server_error');
    expect(error.correlationId).toBe('corr-123');
  });
});
