/** @vitest-environment node */
import '@/testing/infrastructure/env';
import { NextResponse } from 'next/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockRouteContext } from './route-classification.mock';
import { withDemoAllowlistGuard, withDemoGuard } from './with-demo-guard';

import {
  createMockRequest,
  mockEnv,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('withDemoGuard', () => {
  const mockHandler = vi
    .fn()
    .mockImplementation(async () => NextResponse.next());

  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockHandler.mockClear();
  });

  it('calls through for non-demo routes regardless of the flag', async () => {
    mockEnv.DEMO_SHOWCASE_ENABLED = false;
    const req = createMockRequest({ path: '/dashboard' });
    const ctx = createMockRouteContext({ isDemoRoute: false });

    await withDemoGuard(mockHandler)(req, ctx);

    expect(mockHandler).toHaveBeenCalled();
  });

  it('404s an API demo route when the flag is off', async () => {
    mockEnv.DEMO_SHOWCASE_ENABLED = false;
    const req = createMockRequest({ path: '/api/security-test/ssrf' });
    const ctx = createMockRouteContext({ isDemoRoute: true, isApi: true });

    const res = await withDemoGuard(mockHandler)(req, ctx);

    expect(res.status).toBe(404);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('rewrites a page demo route to a not-found path when the flag is off', async () => {
    mockEnv.DEMO_SHOWCASE_ENABLED = false;
    const req = createMockRequest({ path: '/security-showcase' });
    const ctx = createMockRouteContext({ isDemoRoute: true, isApi: false });

    const res = await withDemoGuard(mockHandler)(req, ctx);

    // NextResponse.rewrite carries the rewritten destination on this header.
    expect(res.headers.get('x-middleware-rewrite')).toContain(
      '/__demo_route_disabled__',
    );
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('calls through for a demo route when the flag is on', async () => {
    mockEnv.DEMO_SHOWCASE_ENABLED = true;
    const req = createMockRequest({ path: '/security-showcase' });
    const ctx = createMockRouteContext({ isDemoRoute: true });

    await withDemoGuard(mockHandler)(req, ctx);

    expect(mockHandler).toHaveBeenCalled();
  });
});

describe('withDemoAllowlistGuard', () => {
  const mockHandler = vi
    .fn()
    .mockImplementation(async () => NextResponse.next());
  const getCurrentIdentity = vi.fn();
  const dependencies = { identityProvider: { getCurrentIdentity } };

  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockHandler.mockClear();
    getCurrentIdentity.mockReset();
  });

  it('calls through when no allowlist email is configured', async () => {
    mockEnv.DEMO_SHOWCASE_ENABLED = true;
    mockEnv.DEMO_SHOWCASE_ALLOWED_EMAIL = undefined;
    const req = createMockRequest({ path: '/security-showcase' });
    const ctx = createMockRouteContext({ isDemoRoute: true });

    await withDemoAllowlistGuard(mockHandler, { dependencies })(req, ctx);

    expect(mockHandler).toHaveBeenCalled();
    expect(getCurrentIdentity).not.toHaveBeenCalled();
  });

  it('calls through when the signed-in email matches the allowlist', async () => {
    mockEnv.DEMO_SHOWCASE_ENABLED = true;
    mockEnv.DEMO_SHOWCASE_ALLOWED_EMAIL = 'owner@example.com';
    getCurrentIdentity.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
    });
    const req = createMockRequest({ path: '/security-showcase' });
    const ctx = createMockRouteContext({ isDemoRoute: true });

    await withDemoAllowlistGuard(mockHandler, { dependencies })(req, ctx);

    expect(mockHandler).toHaveBeenCalled();
  });

  it('404s when the signed-in email does not match the allowlist', async () => {
    mockEnv.DEMO_SHOWCASE_ENABLED = true;
    mockEnv.DEMO_SHOWCASE_ALLOWED_EMAIL = 'owner@example.com';
    getCurrentIdentity.mockResolvedValue({
      id: 'user-2',
      email: 'someone-else@example.com',
    });
    const req = createMockRequest({ path: '/api/security-test/ssrf' });
    const ctx = createMockRouteContext({ isDemoRoute: true, isApi: true });

    const res = await withDemoAllowlistGuard(mockHandler, { dependencies })(
      req,
      ctx,
    );

    expect(res.status).toBe(404);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('404s when nobody is signed in and an allowlist email is configured', async () => {
    mockEnv.DEMO_SHOWCASE_ENABLED = true;
    mockEnv.DEMO_SHOWCASE_ALLOWED_EMAIL = 'owner@example.com';
    getCurrentIdentity.mockResolvedValue(null);
    const req = createMockRequest({ path: '/api/security-test/ssrf' });
    const ctx = createMockRouteContext({ isDemoRoute: true, isApi: true });

    const res = await withDemoAllowlistGuard(mockHandler, { dependencies })(
      req,
      ctx,
    );

    expect(res.status).toBe(404);
    expect(mockHandler).not.toHaveBeenCalled();
  });
});
