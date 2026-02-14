import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { core } from 'zod';
import { ZodError } from 'zod';

import { AppError } from '@/shared/lib/api/app-error';

import { withActionHandler } from './with-action-handler';

import {
  resetAllInfrastructureMocks,
  mockLogger,
  mockHeaders,
} from '@/testing';

// Initialize infrastructure mocks
import '@/testing/infrastructure/next-headers';
import '@/testing/infrastructure/logger';

describe('withActionHandler', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
  });

  it('should return ok status and data on success', async () => {
    const mockData = { id: 123 };
    const action = vi.fn().mockResolvedValue(mockData);
    const wrapped = withActionHandler(action);

    const result = await wrapped();

    expect(result).toEqual({
      status: 'ok',
      data: mockData,
    });
  });

  it('should handle AppError and return error status', async () => {
    const appError = new AppError('Custom error', 400, 'CUSTOM_CODE');
    const action = vi.fn().mockRejectedValue(appError);
    const wrapped = withActionHandler(action);

    const result = await wrapped();

    expect(result).toEqual({
      status: 'server_error',
      error: 'Custom error',
      code: 'CUSTOM_CODE',
    });
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should handle validation errors from AppError', async () => {
    const appError = new AppError('Validation failed', 400, 'VALIDATION', {
      email: ['required'],
    });
    const action = vi.fn().mockRejectedValue(appError);
    const wrapped = withActionHandler(action);

    const result = await wrapped();

    expect(result).toEqual({
      status: 'form_errors',
      errors: { email: ['required'] },
    });
  });

  it('should log AppError with 500+ status via error logger', async () => {
    const appError = new AppError('Server fail', 503, 'SERVER_FAIL');
    const action = vi.fn().mockRejectedValue(appError);
    const wrapped = withActionHandler(action);

    const result = await wrapped();

    expect(result).toEqual({
      status: 'server_error',
      error: 'Server fail',
      code: 'SERVER_FAIL',
    });
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should return generic error message in production for non-Error rejections', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const action = vi.fn().mockRejectedValue('bad');
    const wrapped = withActionHandler(action);

    const result = await wrapped();

    expect(result).toEqual({
      status: 'server_error',
      error: 'Internal Server Error',
    });

    vi.unstubAllEnvs();
  });

  it('should log correlationId from headers', async () => {
    const correlationId = 'action-id-789';
    mockHeaders.set('x-correlation-id', correlationId);

    const action = vi.fn().mockRejectedValue(new Error('Boom'));
    const wrapped = withActionHandler(action);

    await wrapped();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId }),
      expect.any(String),
    );
  });

  it('should map ZodError to form_errors status', async () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        path: ['username'],
        message: 'Expected string, received number',
        expected: 'string',
        received: 'number',
      } as core.$ZodIssue,
    ]);
    const action = vi.fn().mockRejectedValue(zodError);
    const wrapped = withActionHandler(action);

    const result = await wrapped();

    expect(result).toEqual({
      status: 'form_errors',
      errors: {
        username: ['Expected string, received number'],
      },
    });
  });
});
