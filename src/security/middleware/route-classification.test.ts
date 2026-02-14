import { describe, it, expect } from 'vitest';

import { classifyRequest } from './route-classification';

import { createMockRequest } from '@/testing';

describe('Route Classification', () => {
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

  it('should classify private routes as non-public', () => {
    const ctx = classifyRequest(createMockRequest({ path: '/dashboard' }));
    expect(ctx.isPublicRoute).toBe(false);
  });
});
