import { describe, expect, it } from 'vitest';

import type { ApiResponse } from '@/shared/types/api-response';

import { handleApiResponse } from './api-client-handler';

describe('api-client-handler', () => {
  it('should handle success response', () => {
    const response: ApiResponse<{ id: number }> = {
      status: 'ok',
      data: { id: 1 },
      meta: { total: 1 },
    };

    const result = handleApiResponse(response);

    expect(result.isOk).toBe(true);
    expect(result.data).toEqual({ id: 1 });
    expect(result.meta).toEqual({ total: 1 });
    expect(result.isFormError).toBe(false);
  });

  it('should handle form errors response', () => {
    const response: ApiResponse<unknown> = {
      status: 'form_errors',
      errors: { email: ['invalid'] },
    };

    const result = handleApiResponse(response);

    expect(result.isOk).toBe(false);
    expect(result.isFormError).toBe(true);
    expect(result.errors).toEqual({ email: ['invalid'] });
  });

  it('should handle server error response', () => {
    const response: ApiResponse<unknown> = {
      status: 'server_error',
      error: 'Not found',
      code: 'ERR_404',
    };

    const result = handleApiResponse(response);

    expect(result.isOk).toBe(false);
    expect(result.isServerError).toBe(true);
    expect(result.error).toBe('Not found');
    expect(result.code).toBe('ERR_404');
  });

  it('should handle redirect response', () => {
    const response: ApiResponse<unknown> = {
      status: 'redirect',
      url: '/login',
    };

    const result = handleApiResponse(response);

    expect(result.isOk).toBe(false);
    expect(result.isRedirect).toBe(true);
    expect(result.url).toBe('/login');
  });
});
