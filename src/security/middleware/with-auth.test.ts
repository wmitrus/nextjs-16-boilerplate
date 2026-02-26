import '@/testing/infrastructure/clerk';
import '@/testing/infrastructure/next-headers';
import '@/testing/infrastructure/logger';

import { NextResponse } from 'next/server';
import type { Mocked } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { container } from '@/core/container';
import { AUTH } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';

import { withAuth } from './with-auth';

import {
  createMockRequest,
  createMockRouteContext,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Auth Middleware', () => {
  const mockIdentityProvider = {
    getCurrentIdentity: vi.fn(),
  } as unknown as Mocked<IdentityProvider>;

  const mockUserRepository = {
    findById: vi.fn(),
    updateOnboardingStatus: vi.fn(),
  } as unknown as Mocked<UserRepository>;

  const mockHandler = vi
    .fn()
    .mockImplementation(async () => NextResponse.next());

  beforeEach(() => {
    resetAllInfrastructureMocks();
    container.register(AUTH.IDENTITY_PROVIDER, mockIdentityProvider);
    container.register(AUTH.USER_REPOSITORY, mockUserRepository);
    mockIdentityProvider.getCurrentIdentity.mockReset();
    mockUserRepository.findById.mockReset();
    mockHandler.mockClear();
  });

  it('should redirect authenticated users from auth routes to home if onboarding is complete', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue({
      id: 'user_1',
    });
    mockUserRepository.findById.mockResolvedValue({
      id: 'user_1',
      onboardingComplete: true,
    });

    const req = createMockRequest({ path: '/sign-in' });
    const ctx = createMockRouteContext({
      isAuthRoute: true,
      isPublicRoute: true,
    });

    const middleware = withAuth(mockHandler);
    const res = await middleware(req, ctx);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should redirect authenticated users from auth routes to onboarding if incomplete', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue({
      id: 'user_1',
    });
    mockUserRepository.findById.mockResolvedValue({
      id: 'user_1',
      onboardingComplete: false,
    });

    const req = createMockRequest({ path: '/sign-in' });
    const ctx = createMockRouteContext({
      isAuthRoute: true,
      isPublicRoute: true,
    });

    const middleware = withAuth(mockHandler);
    const res = await middleware(req, ctx);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/onboarding');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should redirect to onboarding for private routes if onboarding is incomplete', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue({
      id: 'user_1',
    });
    mockUserRepository.findById.mockResolvedValue({
      id: 'user_1',
      onboardingComplete: false,
    });

    const req = createMockRequest({ path: '/dashboard' });
    const ctx = createMockRouteContext({ isPublicRoute: false });

    const middleware = withAuth(mockHandler);
    const res = await middleware(req, ctx);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/onboarding');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should call next handler for public routes when unauthenticated', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue(null);

    const req = createMockRequest({ path: '/' });
    const ctx = createMockRouteContext({ isPublicRoute: true });

    const middleware = withAuth(mockHandler);
    await middleware(req, ctx);

    expect(mockHandler).toHaveBeenCalled();
  });

  it('should call next handler for authenticated users on private routes if onboarding is complete', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue({
      id: 'user_1',
    });
    mockUserRepository.findById.mockResolvedValue({
      id: 'user_1',
      onboardingComplete: true,
    });

    const req = createMockRequest({ path: '/dashboard' });
    const ctx = createMockRouteContext({ isPublicRoute: false });

    const middleware = withAuth(mockHandler);
    await middleware(req, ctx);

    expect(mockHandler).toHaveBeenCalled();
  });

  it('should redirect unauthenticated users from private routes to sign-in', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue(null);

    const req = createMockRequest({ path: '/dashboard' });
    const ctx = createMockRouteContext({ isPublicRoute: false });

    const middleware = withAuth(mockHandler);
    const res = await middleware(req, ctx);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/sign-in');
    expect(mockHandler).not.toHaveBeenCalled();
  });
});
