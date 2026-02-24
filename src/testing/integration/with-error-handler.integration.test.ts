import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { withErrorHandler } from '@/shared/lib/api/with-error-handler';
import { AppError } from '@/shared/types/api-response';

vi.mock('@/core/logger/server', () => {
  const mockChildLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };

  return {
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(() => mockChildLogger),
    },
  };
});

describe('withErrorHandler integration', () => {
  const mockContext = { params: Promise.resolve({}) };
  const mockUrl = 'http://localhost/api/test';

  it('maps AppError validation errors to form_errors response', async () => {
    const handler = vi.fn().mockRejectedValue(
      new AppError('Validation failed', 422, 'VALIDATION', {
        email: ['required'],
      }),
    );

    const wrapped = withErrorHandler(handler);
    const response = await wrapped(new NextRequest(mockUrl), mockContext);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      status: 'form_errors',
      errors: { email: ['required'] },
    });
  });

  it('maps generic errors to server_error response', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Boom'));
    const wrapped = withErrorHandler(handler);

    const response = await wrapped(new NextRequest(mockUrl), mockContext);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.status).toBe('server_error');
  });
});
