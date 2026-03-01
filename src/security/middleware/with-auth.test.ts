import '@/testing/infrastructure/clerk';
import '@/testing/infrastructure/next-headers';
import '@/testing/infrastructure/logger';

import { NextResponse } from 'next/server';
import type { Mocked } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AuthorizationService } from '@/core/contracts/authorization';
import type { IdentityProvider } from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  type TenantResolver,
} from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';

import { withAuth } from './with-auth';

import type {
  EdgeSecurityDependencies,
  NodeSecurityDependencies,
} from '@/security/core/security-dependencies';
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

  const mockTenantResolver = {
    resolve: vi.fn(),
  } as unknown as Mocked<TenantResolver>;

  const mockAuthorizationService = {
    can: vi.fn(),
  } as unknown as Mocked<AuthorizationService>;

  const securityDependencies: NodeSecurityDependencies = {
    identityProvider: mockIdentityProvider,
    tenantResolver: mockTenantResolver,
    authorizationService: mockAuthorizationService,
  };

  const edgeSecurityDependencies: EdgeSecurityDependencies = {
    identityProvider: mockIdentityProvider,
    tenantResolver: mockTenantResolver,
  };

  const mockHandler = vi
    .fn()
    .mockImplementation(async () => NextResponse.next());

  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockIdentityProvider.getCurrentIdentity.mockReset();
    mockUserRepository.findById.mockReset();
    mockTenantResolver.resolve.mockReset();
    mockAuthorizationService.can.mockReset();

    mockTenantResolver.resolve.mockResolvedValue({
      tenantId: 't1',
      userId: 'user_1',
    });
    mockAuthorizationService.can.mockResolvedValue(true);
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

    const middleware = withAuth(mockHandler, {
      dependencies: securityDependencies,
      userRepository: mockUserRepository,
    });
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

    const middleware = withAuth(mockHandler, {
      dependencies: securityDependencies,
      userRepository: mockUserRepository,
    });
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

    const middleware = withAuth(mockHandler, {
      dependencies: securityDependencies,
      userRepository: mockUserRepository,
    });
    const res = await middleware(req, ctx);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/onboarding');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should call next handler for public routes when unauthenticated', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue(null);

    const req = createMockRequest({ path: '/' });
    const ctx = createMockRouteContext({ isPublicRoute: true });

    const middleware = withAuth(mockHandler, {
      dependencies: securityDependencies,
      userRepository: mockUserRepository,
    });
    await middleware(req, ctx);

    expect(mockHandler).toHaveBeenCalled();
    expect(mockIdentityProvider.getCurrentIdentity).not.toHaveBeenCalled();
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

    const middleware = withAuth(mockHandler, {
      dependencies: securityDependencies,
      userRepository: mockUserRepository,
    });
    await middleware(req, ctx);

    expect(mockHandler).toHaveBeenCalled();
  });

  it('should redirect unauthenticated users from private routes to sign-in', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue(null);

    const req = createMockRequest({ path: '/dashboard' });
    const ctx = createMockRouteContext({ isPublicRoute: false });

    const middleware = withAuth(mockHandler, {
      dependencies: securityDependencies,
      userRepository: mockUserRepository,
    });
    const res = await middleware(req, ctx);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/sign-in');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should return 403 JSON when authorization denies an authenticated user on API route', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue({ id: 'user_1' });
    mockUserRepository.findById.mockResolvedValue({
      id: 'user_1',
      onboardingComplete: true,
    });
    mockAuthorizationService.can.mockResolvedValue(false);

    const req = createMockRequest({ path: '/api/protected' });
    const ctx = createMockRouteContext({ isPublicRoute: false, isApi: true });

    const middleware = withAuth(mockHandler, {
      dependencies: securityDependencies,
      userRepository: mockUserRepository,
    });
    const res = await middleware(req, ctx);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should redirect to home when authorization denies an authenticated user on page route', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue({ id: 'user_1' });
    mockUserRepository.findById.mockResolvedValue({
      id: 'user_1',
      onboardingComplete: true,
    });
    mockAuthorizationService.can.mockResolvedValue(false);

    const req = createMockRequest({ path: '/admin' });
    const ctx = createMockRouteContext({ isPublicRoute: false, isApi: false });

    const middleware = withAuth(mockHandler, {
      dependencies: securityDependencies,
      userRepository: mockUserRepository,
    });
    const res = await middleware(req, ctx);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should call authorization with correct tenant and subject structure', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue({ id: 'user_1' });
    mockUserRepository.findById.mockResolvedValue({
      id: 'user_1',
      onboardingComplete: true,
    });
    mockTenantResolver.resolve.mockResolvedValue({
      tenantId: 'org_abc',
      userId: 'user_1',
    });
    mockAuthorizationService.can.mockResolvedValue(true);

    const req = createMockRequest({ path: '/dashboard' });
    const ctx = createMockRouteContext({ isPublicRoute: false });

    const middleware = withAuth(mockHandler, {
      dependencies: securityDependencies,
      userRepository: mockUserRepository,
    });
    await middleware(req, ctx);

    expect(mockAuthorizationService.can).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: expect.objectContaining({ tenantId: 'org_abc' }),
        subject: expect.objectContaining({ id: 'user_1' }),
        resource: expect.objectContaining({ type: 'route' }),
        action: 'route:access',
      }),
    );
  });

  it('should return 401 JSON for unauthenticated user on API route', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue(null);

    const req = createMockRequest({ path: '/api/data' });
    const ctx = createMockRouteContext({ isPublicRoute: false, isApi: true });

    const middleware = withAuth(mockHandler, {
      dependencies: securityDependencies,
      userRepository: mockUserRepository,
    });
    const res = await middleware(req, ctx);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should skip onboarding repository lookups in edge mode', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue({
      id: 'user_1',
    });

    const req = createMockRequest({ path: '/dashboard' });
    const ctx = createMockRouteContext({ isPublicRoute: false, isApi: false });

    const middleware = withAuth(mockHandler, {
      dependencies: edgeSecurityDependencies,
      enforceResourceAuthorization: false,
    });

    await middleware(req, ctx);

    expect(mockUserRepository.findById).not.toHaveBeenCalled();
    expect(mockHandler).toHaveBeenCalled();
  });

  it('should skip onboarding repository lookups in edge mode when enforceResourceAuthorization is omitted', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue({
      id: 'user_1',
    });

    const req = createMockRequest({ path: '/dashboard' });
    const ctx = createMockRouteContext({ isPublicRoute: false, isApi: false });

    const middleware = withAuth(mockHandler, {
      dependencies: edgeSecurityDependencies,
    });

    await middleware(req, ctx);

    expect(mockUserRepository.findById).not.toHaveBeenCalled();
    expect(mockHandler).toHaveBeenCalled();
  });

  it('should redirect authenticated user to onboarding when tenant context is missing', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue({ id: 'user_1' });
    mockUserRepository.findById.mockResolvedValue({
      id: 'user_1',
      onboardingComplete: true,
    });
    mockTenantResolver.resolve.mockRejectedValue(
      new MissingTenantContextError(),
    );

    const req = createMockRequest({ path: '/dashboard' });
    const ctx = createMockRouteContext({ isPublicRoute: false, isApi: false });

    const middleware = withAuth(mockHandler, {
      dependencies: securityDependencies,
      userRepository: mockUserRepository,
    });
    const res = await middleware(req, ctx);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://localhost/onboarding?reason=tenant-context-required',
    );
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should return 409 JSON when tenant context is missing on API route', async () => {
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue({ id: 'user_1' });
    mockUserRepository.findById.mockResolvedValue({
      id: 'user_1',
      onboardingComplete: true,
    });
    mockTenantResolver.resolve.mockRejectedValue(
      new MissingTenantContextError(),
    );

    const req = createMockRequest({ path: '/api/protected' });
    const ctx = createMockRouteContext({ isPublicRoute: false, isApi: true });

    const middleware = withAuth(mockHandler, {
      dependencies: securityDependencies,
      userRepository: mockUserRepository,
    });
    const res = await middleware(req, ctx);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(mockHandler).not.toHaveBeenCalled();
  });
});
