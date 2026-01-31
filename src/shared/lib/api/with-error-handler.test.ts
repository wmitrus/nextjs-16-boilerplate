import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import type { core } from 'zod';
import { ZodError } from 'zod';

import { logger } from '@/core/logger/server';

import { AppError } from './app-error';
import { withErrorHandler } from './with-error-handler';

// Mock logger
vi.mock('@/core/logger/server', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('withErrorHandler', () => {
  const mockContext = { params: Promise.resolve({}) };
  const mockUrl = 'http://localhost/api/test';

  it('should return the response from the handler if no error occurs', async () => {
    const expectedResponse = new Response(JSON.stringify({ data: 'success' }), {
      status: 200,
    });
    const handler = vi.fn().mockResolvedValue(expectedResponse);
    const wrappedHandler = withErrorHandler(handler);

    const request = new NextRequest(mockUrl);
    const response = await wrappedHandler(request, mockContext);

    expect(response).toBe(expectedResponse);
    expect(handler).toHaveBeenCalledWith(request, mockContext);
  });

  it('should handle AppError with validation errors', async () => {
    const validationErrors = { email: ['invalid'] };
    const appError = new AppError(
      'Validation failed',
      422,
      'VALIDATION_ERROR',
      validationErrors,
    );
    const handler = vi.fn().mockRejectedValue(appError);
    const wrappedHandler = withErrorHandler(handler);

    const request = new NextRequest(mockUrl);
    const response = await wrappedHandler(request, mockContext);

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toEqual({
      status: 'form_errors',
      errors: validationErrors,
    });
  });

  it('should handle AppError with custom code', async () => {
    const appError = new AppError('Not found', 404, 'USER_NOT_FOUND');
    const handler = vi.fn().mockRejectedValue(appError);
    const wrappedHandler = withErrorHandler(handler);

    const request = new NextRequest(mockUrl);
    const response = await wrappedHandler(request, mockContext);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({
      status: 'server_error',
      error: 'Not found',
      code: 'USER_NOT_FOUND',
    });
  });

  it('should log AppError with 500+ status via error logger', async () => {
    const appError = new AppError('Server down', 503, 'SERVER_DOWN');
    const handler = vi.fn().mockRejectedValue(appError);
    const wrappedHandler = withErrorHandler(handler);

    const request = new NextRequest(mockUrl);
    const response = await wrappedHandler(request, mockContext);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      status: 'server_error',
      error: 'Server down',
      code: 'SERVER_DOWN',
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('should handle generic Error and return 500', async () => {
    const genericError = new Error('Database connection failed');
    const handler = vi.fn().mockRejectedValue(genericError);
    const wrappedHandler = withErrorHandler(handler);

    const request = new NextRequest(mockUrl);
    const response = await wrappedHandler(request, mockContext);

    expect(response.status).toBe(500);
    const body = await response.json();

    // In test environment it might leak error if NODE_ENV is not production
    // But we can check for status server_error
    expect(body.status).toBe('server_error');
  });

  it('should hide non-Error messages in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const handler = vi.fn().mockRejectedValue('bad');
    const wrappedHandler = withErrorHandler(handler);

    const request = new NextRequest(mockUrl);
    const response = await wrappedHandler(request, mockContext);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      status: 'server_error',
      error: 'Internal Server Error',
    });

    vi.unstubAllEnvs();
  });

  it('should include correlationId from headers in logs', async () => {
    const correlationId = 'log-id-456';
    const genericError = new Error('Log error');
    const handler = vi.fn().mockRejectedValue(genericError);
    const wrappedHandler = withErrorHandler(handler);

    const request = new NextRequest(mockUrl, {
      headers: { 'x-correlation-id': correlationId },
    });
    await wrappedHandler(request, mockContext);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId }),
      expect.any(String),
    );
  });

  it('should map ZodError to validation error response', async () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        path: ['email'],
        message: 'Expected string, received number',
        expected: 'string',
        received: 'number',
      } as core.$ZodIssue,
    ]);
    const handler = vi.fn().mockRejectedValue(zodError);
    const wrappedHandler = withErrorHandler(handler);

    const request = new NextRequest(mockUrl);
    const response = await wrappedHandler(request, mockContext);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      status: 'form_errors',
      errors: {
        email: ['Expected string, received number'],
      },
    });
  });
});
