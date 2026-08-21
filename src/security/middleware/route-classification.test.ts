import { describe, it, expect, beforeEach } from 'vitest';

import { classifyRequest } from './route-classification';

import {
  createMockRequest,
  mockEnv,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Route Classification', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
  });

  it('should classify root as public', () => {
    const ctx = classifyRequest(createMockRequest({ path: '/' }));
    expect(ctx.isPublicRoute).toBe(true);
    expect(ctx.isApi).toBe(false);
  });

  it('should classify /api routes correctly', () => {
    const ctx = classifyRequest(createMockRequest({ path: '/api/users' }));
    expect(ctx.isApi).toBe(true);
    expect(ctx.isInternalApi).toBe(false);
  });

  it('should classify internal api routes', () => {
    const ctx = classifyRequest(
      createMockRequest({ path: '/api/internal/jobs' }),
    );
    expect(ctx.isInternalApi).toBe(true);
    expect(ctx.isApi).toBe(true);
  });

  it('should classify webhooks', () => {
    const ctx = classifyRequest(
      createMockRequest({ path: '/api/webhooks/clerk' }),
    );
    expect(ctx.isWebhook).toBe(true);
  });

  it('should classify auth routes', () => {
    const ctx = classifyRequest(createMockRequest({ path: '/sign-in' }));
    expect(ctx.isAuthRoute).toBe(true);
    expect(ctx.isPublicRoute).toBe(true);
  });

  it('should classify static files', () => {
    const ctx = classifyRequest(createMockRequest({ path: '/logo.png' }));
    expect(ctx.isStaticFile).toBe(true);

    const nextCtx = classifyRequest(
      createMockRequest({ path: '/_next/static/chunks/main.js' }),
    );
    expect(nextCtx.isStaticFile).toBe(true);
  });

  it('should classify onboarding', () => {
    const ctx = classifyRequest(
      createMockRequest({ path: '/onboarding/step-1' }),
    );
    expect(ctx.isOnboardingRoute).toBe(true);
  });

  it('should classify /auth/bootstrap as bootstrap-only route', () => {
    const ctx = classifyRequest(createMockRequest({ path: '/auth/bootstrap' }));
    expect(ctx.isBootstrapRoute).toBe(true);
    expect(ctx.isAuthRoute).toBe(false);
    expect(ctx.isPublicRoute).toBe(false);
  });

  it('should classify private routes as non-public', () => {
    const ctx = classifyRequest(createMockRequest({ path: '/dashboard' }));
    expect(ctx.isPublicRoute).toBe(false);
  });

  it('should classify demo/showcase routes as demo routes, not public', () => {
    for (const path of [
      '/security-showcase',
      '/sentry-example-page',
      '/feature-flags-demo',
      '/env-summary',
      '/api/security-test/ssrf',
    ]) {
      const ctx = classifyRequest(createMockRequest({ path }));
      expect(ctx.isDemoRoute).toBe(true);
      expect(ctx.isPublicRoute).toBe(false);
    }
  });

  it('should keep the Sentry tunnel route public and not a demo route', () => {
    const ctx = classifyRequest(createMockRequest({ path: '/monitoring' }));
    expect(ctx.isDemoRoute).toBe(false);
    expect(ctx.isPublicRoute).toBe(true);
  });

  it('should generate a nonce when CSP_SCRIPT_STRICT_MODE is on', () => {
    mockEnv.CSP_SCRIPT_STRICT_MODE = true;
    const ctx = classifyRequest(createMockRequest({ path: '/' }));
    expect(ctx.nonce).toBeTruthy();
    expect(typeof ctx.nonce).toBe('string');
  });

  it('should generate a different nonce per request', () => {
    mockEnv.CSP_SCRIPT_STRICT_MODE = true;
    const first = classifyRequest(createMockRequest({ path: '/' }));
    const second = classifyRequest(createMockRequest({ path: '/' }));
    expect(first.nonce).not.toBe(second.nonce);
  });

  it('should not generate a nonce when CSP_SCRIPT_STRICT_MODE is off', () => {
    mockEnv.CSP_SCRIPT_STRICT_MODE = false;
    const ctx = classifyRequest(createMockRequest({ path: '/' }));
    expect(ctx.nonce).toBeUndefined();
  });
});
