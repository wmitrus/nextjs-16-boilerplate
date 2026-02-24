/** @vitest-environment node */
import '@/testing/infrastructure/env';
import { NextResponse } from 'next/server';
import { describe, it, expect, beforeEach } from 'vitest';

import { createMockRouteContext } from './route-classification.mock';
import { withInternalApiGuard } from './with-internal-api-guard';

import {
  createMockRequest,
  mockEnv,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Internal API Guard', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockEnv.INTERNAL_API_KEY = 'test-secret';
  });

  it('should return null if not an internal api route', () => {
    const req = createMockRequest();
    const ctx = createMockRouteContext({ isInternalApi: false });
    const res = withInternalApiGuard(req, NextResponse.next(), ctx);
    expect(res).toBeNull();
  });

  it('should block internal route if key is missing', () => {
    const req = createMockRequest();
    const ctx = createMockRouteContext({ isInternalApi: true });
    const res = withInternalApiGuard(req, NextResponse.next(), ctx);
    expect(res?.status).toBe(403);
  });

  it('should block internal route if key is incorrect', () => {
    const req = createMockRequest({ headers: { 'x-internal-key': 'wrong' } });
    const ctx = createMockRouteContext({ isInternalApi: true });
    const res = withInternalApiGuard(req, NextResponse.next(), ctx);
    expect(res?.status).toBe(403);
  });

  it('should allow internal route if key is correct', () => {
    const req = createMockRequest({
      headers: { 'x-internal-key': 'test-secret' },
    });
    const ctx = createMockRouteContext({ isInternalApi: true });
    const res = withInternalApiGuard(req, NextResponse.next(), ctx);
    expect(res).toBeNull();
  });
});
