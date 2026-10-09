import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Container } from '@/core/container';
import { AUTH, AUTHORIZATION } from '@/core/contracts';

import { resolveNodeProvisioningAccess } from './node-provisioning-runtime';

import { mockEnv } from '@/testing';

const evaluateNodeProvisioningAccessMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    status: 'UNAUTHENTICATED',
    code: 'UNAUTHENTICATED',
    message: 'Authentication required.',
    diagnostics: {
      tenancyMode: 'single',
      userRecordExists: null,
      tenantRecordExists: null,
      membershipExists: null,
      onboardingStateExists: null,
      onboardingComplete: null,
      provisioningRequired: false,
      reason: 'unauthenticated',
    },
  }),
);

vi.mock('./node-provisioning-access', async () => {
  const actual = await vi.importActual('./node-provisioning-access');
  return {
    ...actual,
    evaluateNodeProvisioningAccess: evaluateNodeProvisioningAccessMock,
  };
});

function createContainer() {
  const requestIdentitySource = {
    get: vi.fn().mockResolvedValue({
      userId: 'external-user-1',
      orgExternalId: 'external-org-1',
    }),
  };
  const identityProvider = { getCurrentIdentity: vi.fn() };
  const tenantResolver = { resolve: vi.fn() };
  const userRepository = { findById: vi.fn() };
  const organizationScopeAuthority = {
    readParentTenantId: vi.fn().mockResolvedValue('tenant-parent-1'),
    isMember: vi.fn().mockResolvedValue(true),
  };

  const services = new Map<symbol, unknown>([
    [AUTH.IDENTITY_SOURCE, requestIdentitySource],
    [AUTH.IDENTITY_PROVIDER, identityProvider],
    [AUTH.TENANT_RESOLVER, tenantResolver],
    [AUTH.USER_REPOSITORY, userRepository],
    [AUTHORIZATION.ORGANIZATION_SCOPE_AUTHORITY, organizationScopeAuthority],
  ]);

  return {
    container: {
      resolve: vi.fn((token: symbol) => services.get(token)),
    } as unknown as Container,
    identityProvider,
    organizationScopeAuthority,
    requestIdentitySource,
    tenantResolver,
    userRepository,
  };
}

describe('resolveNodeProvisioningAccess', () => {
  beforeEach(() => {
    mockEnv.TENANCY_MODE = 'single';
    evaluateNodeProvisioningAccessMock.mockClear();
  });

  it('wires request identity and canonical organization authority', async () => {
    const {
      container,
      identityProvider,
      organizationScopeAuthority,
      requestIdentitySource,
    } = createContainer();

    await resolveNodeProvisioningAccess(container);

    expect(requestIdentitySource.get).toHaveBeenCalledTimes(1);
    expect(evaluateNodeProvisioningAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        identityProvider,
        organizationScopeAuthority,
        rawIdentity: {
          userId: 'external-user-1',
          orgExternalId: 'external-org-1',
        },
      }),
    );
  });

  it('does not pass legacy tenancy mode into runtime access evaluation', async () => {
    mockEnv.TENANCY_MODE = 'org';
    const { container, organizationScopeAuthority } = createContainer();

    await resolveNodeProvisioningAccess(container);

    const deps = evaluateNodeProvisioningAccessMock.mock.calls[0]?.[0];

    expect(deps.organizationScopeAuthority).toBe(organizationScopeAuthority);
    expect(deps).not.toHaveProperty('tenancyMode');
  });
});
