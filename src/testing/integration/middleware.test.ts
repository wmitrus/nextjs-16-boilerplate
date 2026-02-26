/** @vitest-environment node */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { Mocked } from 'vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { container } from '@/core/container';
import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { RoleRepository } from '@/core/contracts/repositories';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';

import type { SecurityDependencies } from '@/security/core/security-dependencies';
import { withAuth } from '@/security/middleware/with-auth';
import { withInternalApiGuard } from '@/security/middleware/with-internal-api-guard';
import { withRateLimit } from '@/security/middleware/with-rate-limit';
import { withSecurity } from '@/security/middleware/with-security';
import { createMockRequest } from '@/testing/factories/request';
import { resetClerkMocks } from '@/testing/infrastructure/clerk';
import { mockEnv, resetEnvMocks } from '@/testing/infrastructure/env';
import { resetLoggerMocks } from '@/testing/infrastructure/logger';
import { resetNextHeadersMocks } from '@/testing/infrastructure/next-headers';

describe('Middleware Integration', () => {
  const mockIdentityProvider = {
    getCurrentIdentity: vi.fn(),
  } as unknown as Mocked<IdentityProvider>;

  const mockUserRepository = {
    findById: vi.fn(),
    updateOnboardingStatus: vi.fn(),
  } as unknown as Mocked<UserRepository>;

  beforeEach(() => {
    resetClerkMocks();
    resetLoggerMocks();
    resetEnvMocks();
    resetNextHeadersMocks();
    vi.clearAllMocks();

    container.register(AUTH.IDENTITY_PROVIDER, mockIdentityProvider);
    container.register(AUTH.USER_REPOSITORY, mockUserRepository);
    mockIdentityProvider.getCurrentIdentity.mockReset();
    mockUserRepository.findById.mockReset();

    // Setup base environment for security
    mockEnv.INTERNAL_API_KEY = 'test_secret';
    mockEnv.API_RATE_LIMIT_REQUESTS = 100;
    mockEnv.API_RATE_LIMIT_WINDOW = '60 s';
    mockEnv.NODE_ENV = 'production';

    // Default: Authenticated, Onboarding complete
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue({ id: 'user_1' });
    mockUserRepository.findById.mockResolvedValue({
      id: 'user_1',
      onboardingComplete: true,
    });
  });

  const createPipeline = () => {
    const securityDependencies: SecurityDependencies = {
      identityProvider: mockIdentityProvider,
      tenantResolver: container.resolve<TenantResolver>(AUTH.TENANT_RESOLVER),
      roleRepository: container.resolve<RoleRepository>(
        AUTHORIZATION.ROLE_REPOSITORY,
      ),
      authorizationService: container.resolve<AuthorizationService>(
        AUTHORIZATION.SERVICE,
      ),
    };

    return withSecurity(
      withInternalApiGuard(
        withRateLimit(
          withAuth(
            async () => {
              return new Response(null, {
                status: 200,
              }) as unknown as NextResponse;
              return NextResponse.next();
            },
            {
              dependencies: securityDependencies,
              userRepository: mockUserRepository,
            },
          ),
        ),
      ),
    ) as unknown as (req: NextRequest) => Promise<NextResponse>;
  };

  it('should process a public route successfully with security headers', async () => {
    const pipeline = createPipeline();

    const req = createMockRequest({ path: '/' });
    const res = await pipeline(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-correlation-id')).toBeDefined();
    expect(res.headers.get('Content-Security-Policy')).toBeDefined();
  });

  it('should redirect unauthenticated access to private routes to sign-in', async () => {
    const pipeline = createPipeline();

    mockIdentityProvider.getCurrentIdentity.mockResolvedValue(null);
    const req = createMockRequest({ path: '/dashboard' });

    const res = await pipeline(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/sign-in');
  });

  it('should block external access to internal APIs', async () => {
    const pipeline = createPipeline();

    const req = createMockRequest({ path: '/api/internal/test' });
    const res = await pipeline(req);

    expect(res.status).toBe(403);
  });

  it('should allow internal access to internal APIs with secret', async () => {
    const pipeline = createPipeline();

    const req = createMockRequest({
      path: '/api/internal/test',
      headers: { 'x-internal-key': 'test_secret' },
    });
    const res = await pipeline(req);

    expect(res.status).toBe(200);
  });

  it('should apply rate limiting headers to API routes', async () => {
    const pipeline = createPipeline();

    const req = createMockRequest({ path: '/api/test' });
    const res = await pipeline(req);

    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
  });

  it('should return 429 when rate limit is exceeded', async () => {
    mockEnv.API_RATE_LIMIT_REQUESTS = 0;

    const pipeline = createPipeline();

    const req = createMockRequest({ path: '/api/test' });
    const res = await pipeline(req);

    expect(res.status).toBe(429);
  });

  it('should redirect authenticated users away from auth routes to home', async () => {
    const pipeline = createPipeline();

    const req = createMockRequest({ path: '/sign-in' });

    const res = await pipeline(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/');
  });

  it('should redirect authenticated users to onboarding if not complete', async () => {
    const pipeline = createPipeline();

    mockUserRepository.findById.mockResolvedValue({
      id: 'user_1',
      onboardingComplete: false,
    });
    const req = createMockRequest({ path: '/dashboard' });

    const res = await pipeline(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/onboarding');
  });

  it('should bypass auth for E2E routes when enabled', async () => {
    mockEnv.E2E_ENABLED = true;
    const pipeline = createPipeline();

    const req = createMockRequest({ path: '/users' });
    mockIdentityProvider.getCurrentIdentity.mockResolvedValue(null);

    const res = await pipeline(req);

    expect(res.status).toBe(200);
  });
});
