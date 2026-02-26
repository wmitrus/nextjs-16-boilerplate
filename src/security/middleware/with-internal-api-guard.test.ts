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
});
