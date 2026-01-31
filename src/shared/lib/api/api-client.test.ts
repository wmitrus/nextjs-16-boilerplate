import { describe, expect, it, vi, beforeEach } from 'vitest';

import { apiClient, ApiClientError } from './api-client';

describe('apiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should return data on successful ok response', async () => {
    const mockData = { id: 1, name: 'Test' };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ status: 'ok', data: mockData }),
    } as Response);

    const data = await apiClient.get('/test');
    expect(data).toEqual(mockData);
  });

  it('should throw ApiClientError on form_errors', async () => {
    const mockErrors = { email: ['Invalid'] };
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ status: 'form_errors', errors: mockErrors }),
    } as Response);

    try {
      await apiClient.get('/test');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      const apiError = error as ApiClientError;
      expect(apiError.status).toBe('form_errors');
      expect(apiError.errors).toEqual(mockErrors);
      expect(apiError.message).toBe('Validation failed');
    }
  });

  it('should throw ApiClientError on server_error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        status: 'server_error',
        error: 'Boom',
        code: 'INTERNAL',
      }),
    } as Response);

    try {
      await apiClient.get('/test');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      const apiError = error as ApiClientError;
      expect(apiError.status).toBe('server_error');
      expect(apiError.message).toBe('Boom');
      expect(apiError.code).toBe('INTERNAL');
    }
  });

  it('should handle non-json error responses', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: new Headers({ 'content-type': 'text/html' }),
    } as Response);

    await expect(apiClient.get('/test')).rejects.toThrow(
      'HTTP Error 502: Bad Gateway',
    );
  });

  it('should capture x-correlation-id from response headers', async () => {
    const correlationId = 'test-id-123';
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({
        'content-type': 'application/json',
        'x-correlation-id': correlationId,
      }),
      json: async () => ({
        status: 'server_error',
        error: 'Internal Error',
      }),
    } as Response);

    try {
      await apiClient.get('/test');
    } catch (error) {
      const apiError = error as ApiClientError;
      expect(apiError.correlationId).toBe(correlationId);
    }
  });

  it('should handle redirect status in ApiClientError', () => {
    const apiError = new ApiClientError(
      { status: 'redirect', url: '/new-path' },
      302,
    );
    expect(apiError.message).toBe('Redirect to /new-path');
    expect(apiError.url).toBe('/new-path');
  });

  it('should handle unknown status in ApiClientError', () => {
    const apiError = new ApiClientError(
      { status: 'weird_status' } as never,
      520,
    );

    expect(apiError.message).toBe('Unknown API error');
  });

  it('should handle 204 No Content', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    } as Response);

    const data = await apiClient.delete('/test');
    expect(data).toEqual({});
  });

  it('should handle non-json success responses', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'ok',
    } as unknown as Response);

    const data = await apiClient.get('/test');
    expect(data).toEqual({});
  });

  it('should support POST, PUT, PATCH, DELETE methods', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ status: 'ok', data: { success: true } }),
    } as Response);

    await apiClient.post('/test', { foo: 'bar' });
    expect(fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' }),
      }),
    );

    await apiClient.put('/test', { foo: 'bar' });
    expect(fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({ method: 'PUT' }),
    );

    await apiClient.patch('/test', { foo: 'bar' });
    expect(fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({ method: 'PATCH' }),
    );

    await apiClient.delete('/test');
    expect(fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('should fallback when crypto.randomUUID is not available', async () => {
    vi.stubGlobal('crypto', { randomUUID: undefined });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ status: 'ok', data: {} }),
    } as Response);

    await apiClient.get('/test');

    expect(fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-correlation-id': expect.stringMatching(/^fallback-/),
        }),
      }),
    );

    vi.unstubAllGlobals();
  });
});
