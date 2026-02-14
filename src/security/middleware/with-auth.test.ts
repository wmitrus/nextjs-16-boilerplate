import '@/testing/infrastructure/clerk';
import '@/testing/infrastructure/next-headers';
import '@/testing/infrastructure/logger';

import type { ClerkMiddlewareAuth } from '@clerk/nextjs/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { withAuth } from './with-auth';

import {
  createMockRequest,
  createMockRouteContext,
  mockClerkClient,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Auth Middleware', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
  });

  it('should redirect authenticated users from auth routes to home if onboarding is complete', async () => {
    const auth = vi.fn().mockResolvedValue({
      userId: 'user_1',
      sessionClaims: { metadata: { onboardingComplete: true } },
    }) as unknown as ClerkMiddlewareAuth;
    const req = createMockRequest({ path: '/sign-in' });
    const ctx = createMockRouteContext({
      isAuthRoute: true,
      isPublicRoute: true,
    });

    const res = await withAuth(auth, req, ctx);

    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toBe('http://localhost/');
  });

  it('should redirect authenticated users from auth routes to onboarding if incomplete', async () => {
    mockClerkClient.mockResolvedValue({
      users: {
        getUser: vi
          .fn()
          .mockResolvedValue({ publicMetadata: { onboardingComplete: false } }),
      },
    });

    const auth = vi.fn().mockResolvedValue({
      userId: 'user_1',
      sessionClaims: { metadata: {} }, // Missing onboardingComplete triggers fallback to clerkClient
    }) as unknown as ClerkMiddlewareAuth;
    const req = createMockRequest({ path: '/sign-in' });
    const ctx = createMockRouteContext({
      isAuthRoute: true,
      isPublicRoute: true,
    });

    const res = await withAuth(auth, req, ctx);

    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toBe('http://localhost/onboarding');
  });

  it('should redirect to onboarding for private routes if onboarding is incomplete', async () => {
    mockClerkClient.mockResolvedValue({
      users: {
        getUser: vi
          .fn()
          .mockResolvedValue({ publicMetadata: { onboardingComplete: false } }),
      },
    });

    const auth = vi.fn().mockResolvedValue({
      userId: 'user_1',
      sessionClaims: { metadata: {} },
    }) as unknown as ClerkMiddlewareAuth;
    const req = createMockRequest({ path: '/dashboard' });
    const ctx = createMockRouteContext({ isPublicRoute: false });

    const res = await withAuth(auth, req, ctx);

    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toBe('http://localhost/onboarding');
  });

  it('should return null for public routes', async () => {
    const auth = vi
      .fn()
      .mockResolvedValue({ userId: null }) as unknown as ClerkMiddlewareAuth;
    const req = createMockRequest({ path: '/' });
    const ctx = createMockRouteContext({ isPublicRoute: true });

    const res = await withAuth(auth, req, ctx);

    expect(res).toBeNull();
  });

  it('should return null for authenticated users on private routes if onboarding is complete', async () => {
    const auth = vi.fn().mockResolvedValue({
      userId: 'user_1',
      sessionClaims: { metadata: { onboardingComplete: true } },
    }) as unknown as ClerkMiddlewareAuth;
    const req = createMockRequest({ path: '/dashboard' });
    const ctx = createMockRouteContext({ isPublicRoute: false });

    const res = await withAuth(auth, req, ctx);

    expect(res).toBeNull();
  });
});
