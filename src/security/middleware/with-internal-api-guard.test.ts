/** @vitest-environment node */
import '@/testing/infrastructure/env';
import { NextResponse } from 'next/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockRouteContext } from './route-classification.mock';
import { withInternalApiGuard } from './with-internal-api-guard';

import {
  createMockRequest,
  mockEnv,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Internal API Guard', () => {
  const mockHandler = vi
    .fn()
    .mockImplementation(async () => NextResponse.next());

  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockEnv.INTERNAL_API_KEY = 'test-secret';
    mockHandler.mockClear();
  });

  it('should call next handler if not an internal api route', async () => {
    const req = createMockRequest();
    const ctx = createMockRouteContext({ isInternalApi: false });

    const middleware = withInternalApiGuard(mockHandler);
    await middleware(req, ctx);

    expect(mockHandler).toHaveBeenCalled();
  });

  it('should block internal route if key is missing', async () => {
    const req = createMockRequest();
    const ctx = createMockRouteContext({ isInternalApi: true });

    const middleware = withInternalApiGuard(mockHandler);
    const res = await middleware(req, ctx);

    expect(res.status).toBe(403);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should block internal route if key is incorrect', async () => {
    const req = createMockRequest({ headers: { 'x-internal-key': 'wrong' } });
    const ctx = createMockRouteContext({ isInternalApi: true });

    const middleware = withInternalApiGuard(mockHandler);
    const res = await middleware(req, ctx);

    expect(res.status).toBe(403);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should allow internal route if key is correct', async () => {
    const req = createMockRequest({
      headers: { 'x-internal-key': 'test-secret' },
    });
    const ctx = createMockRouteContext({ isInternalApi: true });

    const middleware = withInternalApiGuard(mockHandler);
    await middleware(req, ctx);

    expect(mockHandler).toHaveBeenCalled();
  });

  it.each([
    [undefined, 403],
    ['wrong', 403],
    ['test-secret', 200],
  ])(
    'enforces the current key for the Preview canary route',
    async (key, status) => {
      const req = createMockRequest({
        headers: key ? { 'x-internal-key': key } : {},
        path: '/api/internal/preview-canary/database-binding',
      });
      const response = await withInternalApiGuard(mockHandler)(
        req,
        createMockRouteContext({ isApi: true, isInternalApi: true }),
      );
      expect(response.status).toBe(status);
      expect(mockHandler).toHaveBeenCalledTimes(key === 'test-secret' ? 1 : 0);
    },
  );

  describe('SEC-44 hardening', () => {
    it('accepts the previous key during a rotation', async () => {
      // The point of the second slot: callers can cut over without a
      // synchronised flag day.
      mockEnv.INTERNAL_API_KEY = 'new-key';
      mockEnv.INTERNAL_API_KEY_PREVIOUS = 'test-secret';

      const req = createMockRequest({
        headers: { 'x-internal-key': 'test-secret' },
      });
      const middleware = withInternalApiGuard(mockHandler);
      await middleware(req, createMockRouteContext({ isInternalApi: true }));

      expect(mockHandler).toHaveBeenCalled();
    });

    it('still accepts the current key while a previous one is configured', async () => {
      mockEnv.INTERNAL_API_KEY = 'new-key';
      mockEnv.INTERNAL_API_KEY_PREVIOUS = 'old-key';

      const req = createMockRequest({
        headers: { 'x-internal-key': 'new-key' },
      });
      const middleware = withInternalApiGuard(mockHandler);
      await middleware(req, createMockRouteContext({ isInternalApi: true }));

      expect(mockHandler).toHaveBeenCalled();
    });

    it('rejects a retired key once it is removed from the previous slot', async () => {
      mockEnv.INTERNAL_API_KEY = 'new-key';
      mockEnv.INTERNAL_API_KEY_PREVIOUS = undefined;

      const req = createMockRequest({
        headers: { 'x-internal-key': 'test-secret' },
      });
      const middleware = withInternalApiGuard(mockHandler);
      const res = await middleware(
        req,
        createMockRouteContext({ isInternalApi: true }),
      );

      expect(res.status).toBe(403);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('refuses everything when no key is configured at all', async () => {
      // An unconfigured deployment must be closed, not open -- including
      // against the empty string a missing header collapses to.
      mockEnv.INTERNAL_API_KEY = undefined;
      mockEnv.INTERNAL_API_KEY_PREVIOUS = undefined;

      const middleware = withInternalApiGuard(mockHandler);
      const ctx = createMockRouteContext({ isInternalApi: true });

      const cases: Record<string, string>[] = [{}, { 'x-internal-key': '' }];
      for (const headers of cases) {
        const res = await middleware(createMockRequest({ headers }), ctx);
        expect(res.status).toBe(403);
      }
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('rejects a prefix of the real key', async () => {
      mockEnv.INTERNAL_API_KEY = 'test-secret';

      const req = createMockRequest({
        headers: { 'x-internal-key': 'test-sec' },
      });
      const middleware = withInternalApiGuard(mockHandler);
      const res = await middleware(
        req,
        createMockRouteContext({ isInternalApi: true }),
      );

      expect(res.status).toBe(403);
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });
});
