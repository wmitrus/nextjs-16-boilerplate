import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { AUTH } from '@/core/contracts';
import { UserNotProvisionedError } from '@/core/contracts/identity';
import type { IdentityProvider } from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  TenantMembershipRequiredError,
  TenantNotProvisionedError,
} from '@/core/contracts/tenancy';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getSecurityContext } from './security-context';

import { mockNextHeaders, resetAllInfrastructureMocks } from '@/testing';
import { mockEnv } from '@/testing/infrastructure/env';

describe('Security Context', () => {
  let identityProvider: IdentityProvider;
  let tenantResolver: TenantResolver;
  let userRepository: UserRepository;

  // Sessions in these tests are "current" unless a test says otherwise: a
  // far-future issue time can never be older than a revocation marker, so
  // the SEC-36 gate stays inert and each test exercises the branch it is
  // actually about.
  let sessionIssuedAt: number | undefined = Math.floor(Date.now() / 1000) + 60;

  const getDependencies = () => ({
    identityProvider,
    tenantResolver,
    userRepository,
    requestIdentitySource: {
      get: () => Promise.resolve({ sessionIssuedAt }),
    },
  });

  beforeEach(() => {
    const container = getAppContainer();

    identityProvider = container.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    );
    tenantResolver = container.resolve<TenantResolver>(AUTH.TENANT_RESOLVER);
    userRepository = container.resolve<UserRepository>(AUTH.USER_REPOSITORY);
    sessionIssuedAt = Math.floor(Date.now() / 1000) + 60;
    resetAllInfrastructureMocks();
    vi.clearAllMocks();

    vi.mocked(userRepository.findById).mockImplementation(async (id) => ({
      id,
      email: `${id}@example.com`,
      onboardingComplete: true,
    }));
  });

  it('should return guest context when not authenticated', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue(null);
    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toBeUndefined();
    expect(context.readinessStatus).toBe('UNAUTHENTICATED');
    // SEC-43: no declared trust model in the test env, so there is no
    // client to name. This asserted '127.0.0.1' before -- and passed because
    // the old `getIP()` returned that string whenever it had nothing, not
    // because any client was identified.
    expect(context.ip).toBeNull();
    expect(context.correlationId).toBeDefined();
  });

  it('should return BOOTSTRAP_REQUIRED when identityProvider throws UserNotProvisionedError', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockRejectedValue(
      new UserNotProvisionedError(),
    );
    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toBeUndefined();
    expect(context.readinessStatus).toBe('BOOTSTRAP_REQUIRED');
  });

  it('should return user context when authenticated', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
    });
    vi.mocked(tenantResolver.resolve).mockResolvedValue({
      organizationId: 'tenant_123',
      tenantId: 'tenant_123',
      userId: 'user_123',
    });

    // SEC-43: a declared trust model is what makes a header believable, so
    // this test states one. Without it the same request yields `ip: null` --
    // asserted separately below.
    mockEnv.DEPLOYMENT_PROXY = 'vercel';
    mockNextHeaders.mockReturnValue(
      new Headers({
        'user-agent': 'test-agent',
        'x-correlation-id': 'test-correlation',
        'x-real-ip': '1.1.1.1',
      }),
    );

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toEqual({
      id: 'user_123',
      tenantId: 'tenant_123',
    });
    expect(context.readinessStatus).toBe('ALLOWED');
    expect(context.ip).toBe('1.1.1.1');
    expect(context.userAgent).toBe('test-agent');
  });

  it('reports no ip when the same request arrives with no declared trust model (SEC-43)', async () => {
    // The pair to the test above. The header is identical; only the declared
    // ingress differs. That is the whole point of the trust model -- a header
    // is believed because the deployment says who sets it, never because it
    // is present.
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue(null);
    mockEnv.DEPLOYMENT_PROXY = undefined;
    mockNextHeaders.mockReturnValue(
      new Headers({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '1.1.1.1' }),
    );

    const context = await getSecurityContext(getDependencies());

    expect(context.ip).toBeNull();
  });

  it('should return user context with correct tenantId', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'admin_1',
    });
    vi.mocked(tenantResolver.resolve).mockResolvedValue({
      organizationId: 't1',
      tenantId: 't1',
      userId: 'admin_1',
    });

    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.user?.id).toBe('admin_1');
    expect(context.user?.tenantId).toBe('t1');
  });

  it('should use provided x-request-id if present', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue(null);
    mockNextHeaders.mockReturnValue(
      new Headers({
        'x-request-id': 'req_123',
      }),
    );

    const context = await getSecurityContext(getDependencies());

    expect(context.requestId).toBe('req_123');
  });

  it('should represent unauthenticated state as undefined user', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue(null);
    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toBeUndefined();
    expect(context.readinessStatus).toBe('UNAUTHENTICATED');
    expect(context.correlationId).toBeDefined();
    expect(context.requestId).toBeDefined();
  });

  it('should return ONBOARDING_REQUIRED when user exists but onboarding is incomplete', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_incomplete',
    });
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'user_incomplete',
      email: 'user_incomplete@example.com',
      onboardingComplete: false,
    });
    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toBeUndefined();
    expect(context.readinessStatus).toBe('ONBOARDING_REQUIRED');
  });

  it('should return ACCOUNT_DISABLED when the user has been deactivated (SEC-33)', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_deactivated',
    });
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'user_deactivated',
      email: 'user_deactivated@example.com',
      onboardingComplete: true,
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toBeUndefined();
    expect(context.readinessStatus).toBe('ACCOUNT_DISABLED');
    // Must never reach the tenant resolver -- deactivation is checked first.
    expect(tenantResolver.resolve).not.toHaveBeenCalled();
  });

  it('should return ACCOUNT_DISABLED even when onboarding is also incomplete -- deactivation is checked first and wins (SEC-33)', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_deactivated_incomplete',
    });
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'user_deactivated_incomplete',
      email: 'user_deactivated_incomplete@example.com',
      onboardingComplete: false,
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.readinessStatus).toBe('ACCOUNT_DISABLED');
  });

  it('should use tenant from tenantResolver', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_multi',
    });
    vi.mocked(tenantResolver.resolve).mockResolvedValue({
      organizationId: 'org_abc',
      tenantId: 'org_abc',
      userId: 'user_multi',
    });

    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.user?.tenantId).toBe('org_abc');
  });

  it('should return user=undefined when tenant context is missing (MissingTenantContextError)', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_without_org',
    });
    vi.mocked(tenantResolver.resolve).mockRejectedValue(
      new MissingTenantContextError(),
    );

    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toBeUndefined();
    expect(context.readinessStatus).toBe('TENANT_CONTEXT_REQUIRED');
  });

  it('should return user=undefined when tenant is not provisioned (TenantNotProvisionedError)', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_no_tenant',
    });
    vi.mocked(tenantResolver.resolve).mockRejectedValue(
      new TenantNotProvisionedError(),
    );

    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toBeUndefined();
    expect(context.readinessStatus).toBe('TENANT_CONTEXT_REQUIRED');
  });

  it('returns UNAUTHENTICATED when the session predates the revocation marker (SEC-36)', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_revoked',
    });
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'user_revoked',
      onboardingComplete: true,
      sessionsValidFrom: new Date('2026-08-22T12:00:00.000Z'),
    });
    sessionIssuedAt = Math.floor(
      new Date('2026-08-22T11:00:00.000Z').getTime() / 1000,
    );

    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toBeUndefined();
    expect(context.readinessStatus).toBe('UNAUTHENTICATED');
    // A revoked session must never reach tenant resolution.
    expect(tenantResolver.resolve).not.toHaveBeenCalled();
  });

  it('allows a session issued after the revocation marker (SEC-36)', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_fresh',
    });
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'user_fresh',
      onboardingComplete: true,
      sessionsValidFrom: new Date('2026-08-22T12:00:00.000Z'),
    });
    sessionIssuedAt = Math.floor(
      new Date('2026-08-22T12:30:00.000Z').getTime() / 1000,
    );

    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.readinessStatus).not.toBe('UNAUTHENTICATED');
  });

  it('should return user=undefined when tenant membership is required (TenantMembershipRequiredError)', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_not_member',
    });
    vi.mocked(tenantResolver.resolve).mockRejectedValue(
      new TenantMembershipRequiredError(),
    );

    mockNextHeaders.mockReturnValue(new Headers());

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toBeUndefined();
    expect(context.readinessStatus).toBe('TENANT_MEMBERSHIP_REQUIRED');
  });
});
