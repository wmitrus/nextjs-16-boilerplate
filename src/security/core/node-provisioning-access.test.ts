import { describe, expect, it, vi } from 'vitest';

import { UserNotProvisionedError } from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  TenantMembershipRequiredError,
  TenantNotProvisionedError,
} from '@/core/contracts/tenancy';

import { evaluateNodeProvisioningAccess } from './node-provisioning-access';

function createDeps() {
  return {
    identityProvider: {
      getCurrentIdentity: vi.fn().mockResolvedValue({ id: 'u-1' }),
    },
    tenantResolver: {
      resolve: vi.fn().mockResolvedValue({
        organizationId: 't-1',
        tenantId: 't-1',
        userId: 'u-1',
      }),
    },
    organizationScopeAuthority: {
      readParentTenantId: vi.fn().mockResolvedValue('tenant-parent-1'),
      isMember: vi.fn().mockResolvedValue(true),
    },
    userRepository: {
      findById: vi
        .fn()
        .mockResolvedValue({ id: 'u-1', onboardingComplete: true }),
      findByEmail: vi.fn().mockResolvedValue(null),
      updateOnboardingStatus: vi.fn().mockResolvedValue(undefined),
      updateProfile: vi.fn().mockResolvedValue(undefined),
      listAll: vi.fn().mockResolvedValue({ users: [], total: 0 }),
      deactivate: vi.fn().mockResolvedValue(undefined),
    },
    tenancyMode: 'single' as const,
    // Fresh by default: a far-future issue time can never predate a
    // revocation marker, so the SEC-36 gate stays inert unless a test
    // deliberately sets one up.
    rawIdentity: {
      sessionIssuedAt: Math.floor(Date.now() / 1000) + 60,
    } as { sessionIssuedAt?: number },
  };
}

describe('evaluateNodeProvisioningAccess', () => {
  it('returns UNAUTHENTICATED when no identity exists', async () => {
    const deps = createDeps();
    deps.identityProvider.getCurrentIdentity.mockResolvedValue(null);

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('UNAUTHENTICATED');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('UNAUTHENTICATED');
    }
  });

  it('returns BOOTSTRAP_REQUIRED when identity is external but not provisioned', async () => {
    const deps = createDeps();
    deps.identityProvider.getCurrentIdentity.mockRejectedValue(
      new UserNotProvisionedError(),
    );

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('BOOTSTRAP_REQUIRED');
    expect(result.status).not.toBe('ONBOARDING_REQUIRED');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('BOOTSTRAP_REQUIRED');
    }
  });

  it('returns BOOTSTRAP_REQUIRED when identity resolves but internal user row is missing', async () => {
    const deps = createDeps();
    deps.userRepository.findById.mockResolvedValue(null);

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('BOOTSTRAP_REQUIRED');
    expect(result.status).not.toBe('ONBOARDING_REQUIRED');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('BOOTSTRAP_REQUIRED');
    }
  });

  it('returns ONBOARDING_REQUIRED when onboarding is incomplete', async () => {
    const deps = createDeps();
    deps.userRepository.findById.mockResolvedValue({
      id: 'u-1',
      onboardingComplete: false,
    });

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('ONBOARDING_REQUIRED');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('ONBOARDING_INCOMPLETE');
    }
  });

  it('returns FORBIDDEN/ACCOUNT_DISABLED when the user has been deactivated (SEC-33)', async () => {
    const deps = createDeps();
    deps.userRepository.findById.mockResolvedValue({
      id: 'u-1',
      onboardingComplete: true,
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('FORBIDDEN');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('ACCOUNT_DISABLED');
      expect(result.diagnostics.reason).toBe('account_disabled');
    }
    // Must never reach the tenant resolver -- deactivation is checked first.
    expect(deps.tenantResolver.resolve).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN/ACCOUNT_DISABLED even when onboarding is also incomplete -- deactivation is checked first and wins', async () => {
    const deps = createDeps();
    deps.userRepository.findById.mockResolvedValue({
      id: 'u-1',
      onboardingComplete: false,
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('FORBIDDEN');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('ACCOUNT_DISABLED');
    }
  });

  it('returns UNAUTHENTICATED when the session predates the revocation marker (SEC-36)', async () => {
    const deps = createDeps();
    deps.userRepository.findById.mockResolvedValue({
      id: 'u-1',
      onboardingComplete: true,
      sessionsValidFrom: new Date('2026-08-22T12:00:00.000Z'),
    });
    deps.rawIdentity = {
      sessionIssuedAt: Math.floor(
        new Date('2026-08-22T11:00:00.000Z').getTime() / 1000,
      ),
    };

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('UNAUTHENTICATED');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('UNAUTHENTICATED');
      expect(result.diagnostics.reason).toBe('session_revoked');
    }
    // A revoked session must never reach tenant resolution.
    expect(deps.tenantResolver.resolve).not.toHaveBeenCalled();
  });

  it('allows a session issued after the revocation marker (SEC-36)', async () => {
    const deps = createDeps();
    deps.userRepository.findById.mockResolvedValue({
      id: 'u-1',
      onboardingComplete: true,
      sessionsValidFrom: new Date('2026-08-22T12:00:00.000Z'),
    });
    deps.rawIdentity = {
      sessionIssuedAt: Math.floor(
        new Date('2026-08-22T12:30:00.000Z').getTime() / 1000,
      ),
    };

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('ALLOWED');
  });

  // Fail closed: the marker means this user's sessions get age-checked, and a
  // session with no issue time cannot be shown to be current.
  it('returns UNAUTHENTICATED when a marker exists but the session has no issue time (SEC-36)', async () => {
    const deps = createDeps();
    deps.userRepository.findById.mockResolvedValue({
      id: 'u-1',
      onboardingComplete: true,
      sessionsValidFrom: new Date('2026-08-22T12:00:00.000Z'),
    });
    deps.rawIdentity = {};

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('UNAUTHENTICATED');
  });

  // Deactivation is the stronger signal and must not be masked by revocation.
  it('still reports ACCOUNT_DISABLED when the user is both deactivated and revoked (SEC-36)', async () => {
    const deps = createDeps();
    deps.userRepository.findById.mockResolvedValue({
      id: 'u-1',
      onboardingComplete: true,
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      sessionsValidFrom: new Date('2026-08-22T12:00:00.000Z'),
    });
    deps.rawIdentity = {
      sessionIssuedAt: Math.floor(
        new Date('2026-08-22T11:00:00.000Z').getTime() / 1000,
      ),
    };

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('FORBIDDEN');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('ACCOUNT_DISABLED');
    }
  });

  it('returns TENANT_CONTEXT_REQUIRED when tenant context is missing', async () => {
    const deps = createDeps();
    deps.tenantResolver.resolve.mockRejectedValue(
      new MissingTenantContextError(),
    );

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('TENANT_CONTEXT_REQUIRED');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('TENANT_CONTEXT_REQUIRED');
    }
  });

  it('returns TENANT_CONTEXT_REQUIRED when tenant is not provisioned', async () => {
    const deps = createDeps();
    deps.tenantResolver.resolve.mockRejectedValue(
      new TenantNotProvisionedError(),
    );

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('TENANT_CONTEXT_REQUIRED');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('TENANT_CONTEXT_REQUIRED');
    }
  });

  it('returns TENANT_MEMBERSHIP_REQUIRED when user is not tenant member', async () => {
    const deps = createDeps();
    deps.tenantResolver.resolve.mockRejectedValue(
      new TenantMembershipRequiredError(),
    );

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('TENANT_MEMBERSHIP_REQUIRED');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('TENANT_MEMBERSHIP_REQUIRED');
    }
  });

  it('fails closed when the resolved organization has no authoritative parent tenant', async () => {
    const deps = createDeps();
    deps.organizationScopeAuthority.readParentTenantId.mockResolvedValue(null);

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('TENANT_CONTEXT_REQUIRED');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('TENANT_CONTEXT_REQUIRED');
      expect(result.diagnostics.tenantRecordExists).toBe(false);
      expect(result.diagnostics.membershipExists).toBe(null);
    }
    expect(deps.organizationScopeAuthority.isMember).not.toHaveBeenCalled();
  });

  it('returns TENANT_MEMBERSHIP_REQUIRED when canonical membership proof fails', async () => {
    const deps = createDeps();
    deps.organizationScopeAuthority.isMember.mockResolvedValue(false);

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('TENANT_MEMBERSHIP_REQUIRED');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('TENANT_MEMBERSHIP_REQUIRED');
      expect(result.diagnostics.membershipExists).toBe(false);
    }
  });

  it('ignores a mismatched legacy tenantId and uses the authoritative organization parent', async () => {
    const deps = createDeps();

    deps.tenantResolver.resolve.mockResolvedValue({
      organizationId: 'org-a',
      tenantId: 'tenant-b',
      userId: 'u-1',
    });
    deps.organizationScopeAuthority.readParentTenantId.mockResolvedValue(
      'tenant-a',
    );

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('ALLOWED');
    if (result.status === 'ALLOWED') {
      expect(result.activeOrganization).toEqual({
        organizationId: 'org-a',
        tenantId: 'tenant-a',
      });
      expect(result.activeOrganization.tenantId).not.toBe(
        result.tenant.tenantId,
      );
    }

    expect(
      deps.organizationScopeAuthority.readParentTenantId,
    ).toHaveBeenCalledWith('org-a');
    expect(deps.organizationScopeAuthority.isMember).toHaveBeenCalledWith(
      'u-1',
      'org-a',
    );
  });

  it('returns FORBIDDEN when optional authorize callback denies access', async () => {
    const deps = createDeps();

    const result = await evaluateNodeProvisioningAccess({
      ...deps,
      authorize: vi.fn().mockResolvedValue(false),
    });

    expect(result.status).toBe('FORBIDDEN');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('FORBIDDEN');
    }
  });

  it('returns ALLOWED when identity, onboarding, tenant and policy checks pass', async () => {
    const deps = createDeps();

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('ALLOWED');
    if (result.status === 'ALLOWED') {
      expect(result.identity.id).toBe('u-1');
      expect(result.tenant.tenantId).toBe('t-1');
      expect(result.activeOrganization).toEqual({
        organizationId: 't-1',
        tenantId: 'tenant-parent-1',
      });
      expect(result.user.onboardingComplete).toBe(true);
    }
  });
});
