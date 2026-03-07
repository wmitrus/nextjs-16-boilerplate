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
      resolve: vi.fn().mockResolvedValue({ tenantId: 't-1', userId: 'u-1' }),
    },
    userRepository: {
      findById: vi
        .fn()
        .mockResolvedValue({ id: 'u-1', onboardingComplete: true }),
      updateOnboardingStatus: vi.fn().mockResolvedValue(undefined),
      updateProfile: vi.fn().mockResolvedValue(undefined),
    },
    tenancyMode: 'single' as const,
    tenantExistsProbe: vi.fn().mockResolvedValue(true),
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

  it('fails fast in single mode when configured default tenant does not exist', async () => {
    const deps = createDeps();
    deps.tenantExistsProbe.mockResolvedValue(false);

    const result = await evaluateNodeProvisioningAccess(deps);

    expect(result.status).toBe('TENANT_CONTEXT_REQUIRED');
    if (result.status !== 'ALLOWED') {
      expect(result.code).toBe('DEFAULT_TENANT_NOT_FOUND');
    }
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
      expect(result.user.onboardingComplete).toBe(true);
    }
  });
});
