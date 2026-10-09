import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const USER = '00000000-0000-4000-8000-000000000001';
const ACTIVE_ORG = '15000000-0000-4000-8000-000000000001';
const TARGET_ORG = '15000000-0000-4000-8000-000000000002';
const PARENT_TENANT = '10000000-0000-4000-8000-000000000001';
const TARGET_PARENT_TENANT = '10000000-0000-4000-8000-000000000002';
const PROVIDER_ALIAS = 'org_provider_target';

const mocks = vi.hoisted(() => ({
  readParentTenantId: vi.fn(),
  isMember: vi.fn(),
  isEnvAdmin: vi.fn(),
  resolveCanonicalWriteScope: vi.fn(),
}));

vi.mock(
  '@/modules/authorization/infrastructure/drizzle/DrizzleOrganizationScopeAuthority',
  () => ({
    DrizzleOrganizationScopeAuthority: class {
      readParentTenantId(...args: unknown[]) {
        return mocks.readParentTenantId(...args);
      }

      isMember(...args: unknown[]) {
        return mocks.isMember(...args);
      }
    },
  }),
);

vi.mock('@/security/core/platform-admin', () => ({
  isEnvBasedPlatformAdmin: mocks.isEnvAdmin,
}));

vi.mock('@/app/_lib/resolve-canonical-audit-write-scope', () => ({
  resolveCanonicalAuditWriteScope: mocks.resolveCanonicalWriteScope,
}));

import {
  AuditLogSettingsScopeInvariantError,
  resolveAuditLogSettingsAdminScope,
} from './audit-log-settings-admin-scope';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

const db = {} as never;
const authProvider = 'clerk' as const;

function makeAccess(
  overrides: Partial<Parameters<typeof makeAllowedProvisioningAccess>[0]> = {},
) {
  return makeAllowedProvisioningAccess({
    identity: { id: USER, email: 'admin@example.test' },
    user: {
      id: USER,
      email: 'admin@example.test',
      onboardingComplete: true,
    },
    tenant: {
      organizationId: ACTIVE_ORG,
      tenantId: ACTIVE_ORG,
      userId: USER,
    },
    activeOrganization: {
      organizationId: ACTIVE_ORG,
      tenantId: PARENT_TENANT,
    },
    ...overrides,
  });
}

describe('resolveAuditLogSettingsAdminScope', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.readParentTenantId.mockResolvedValue(PARENT_TENANT);
    mocks.isMember.mockResolvedValue(true);
    mocks.isEnvAdmin.mockReturnValue(false);

    mocks.resolveCanonicalWriteScope.mockResolvedValue({
      outcome: 'resolved',
      writeScope: {
        kind: 'organization',
        organizationId: TARGET_ORG,
        tenantId: TARGET_PARENT_TENANT,
      },
    });
  });

  it('derives canonical organization scope for an ordinary actor', async () => {
    await expect(
      resolveAuditLogSettingsAdminScope({
        access: makeAccess(),
        db,
        authProvider,
      }),
    ).resolves.toEqual({
      outcome: 'resolved',
      scope: {
        kind: 'organization',
        organizationId: ACTIVE_ORG,
        tenantId: PARENT_TENANT,
      },
    });

    expect(mocks.isMember).toHaveBeenCalledWith(USER, ACTIVE_ORG);
  });

  it('does not trust the legacy collapsed TenantContext tenantId', async () => {
    const result = await resolveAuditLogSettingsAdminScope({
      access: makeAccess({
        tenant: {
          organizationId: ACTIVE_ORG,
          tenantId: 'legacy-collapsed-bogus-value',
          userId: USER,
        },
      }),
      db,
      authProvider,
    });

    expect(result).toEqual({
      outcome: 'resolved',
      scope: {
        kind: 'organization',
        organizationId: ACTIVE_ORG,
        tenantId: PARENT_TENANT,
      },
    });

    expect(mocks.readParentTenantId).toHaveBeenCalledWith(ACTIVE_ORG);
  });

  it('returns denied for an ordinary membership denial without fallback', async () => {
    mocks.isMember.mockResolvedValue(false);

    await expect(
      resolveAuditLogSettingsAdminScope({
        access: makeAccess(),
        db,
        authProvider,
      }),
    ).resolves.toEqual({ outcome: 'denied' });

    expect(mocks.resolveCanonicalWriteScope).not.toHaveBeenCalled();
  });

  it('platform admin with no target receives platform-global scope', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);

    await expect(
      resolveAuditLogSettingsAdminScope({
        access: makeAccess(),
        db,
        authProvider,
      }),
    ).resolves.toEqual({
      outcome: 'resolved',
      scope: { kind: 'platform-global' },
    });

    expect(mocks.readParentTenantId).not.toHaveBeenCalled();
    expect(mocks.isMember).not.toHaveBeenCalled();
    expect(mocks.resolveCanonicalWriteScope).not.toHaveBeenCalled();
  });

  it('platform admin with an explicit null target receives platform-global scope', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);

    await expect(
      resolveAuditLogSettingsAdminScope({
        access: makeAccess(),
        db,
        authProvider,
        platformTargetOrganizationId: null,
      }),
    ).resolves.toEqual({
      outcome: 'resolved',
      scope: { kind: 'platform-global' },
    });

    expect(mocks.resolveCanonicalWriteScope).not.toHaveBeenCalled();
  });

  it('platform admin can target a canonically resolved organization', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);

    await expect(
      resolveAuditLogSettingsAdminScope({
        access: makeAccess(),
        db,
        authProvider,
        platformTargetOrganizationId: PROVIDER_ALIAS,
      }),
    ).resolves.toEqual({
      outcome: 'resolved',
      scope: {
        kind: 'organization',
        organizationId: TARGET_ORG,
        tenantId: TARGET_PARENT_TENANT,
      },
    });

    expect(mocks.resolveCanonicalWriteScope).toHaveBeenCalledWith({
      isPlatformAdmin: true,
      ordinaryActiveOrganizationId: ACTIVE_ORG,
      platformTargetOrganizationId: PROVIDER_ALIAS,
      db,
      authProvider,
    });
  });

  it('returns an explicit unresolved outcome for an invalid platform organization target', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveCanonicalWriteScope.mockResolvedValue({
      outcome: 'unresolvable-organization-target',
    });

    await expect(
      resolveAuditLogSettingsAdminScope({
        access: makeAccess(),
        db,
        authProvider,
        platformTargetOrganizationId: 'unknown-provider-org',
      }),
    ).resolves.toEqual({
      outcome: 'unresolvable-organization-target',
    });
  });

  it('fails closed if an explicit organization target unexpectedly resolves as platform-global', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveCanonicalWriteScope.mockResolvedValue({
      outcome: 'resolved',
      writeScope: { kind: 'platform-global' },
    });

    await expect(
      resolveAuditLogSettingsAdminScope({
        access: makeAccess(),
        db,
        authProvider,
        platformTargetOrganizationId: PROVIDER_ALIAS,
      }),
    ).rejects.toBeInstanceOf(AuditLogSettingsScopeInvariantError);
  });

  it('treats a missing authoritative parent tenant as an invariant failure', async () => {
    mocks.readParentTenantId.mockResolvedValue(null);

    await expect(
      resolveAuditLogSettingsAdminScope({
        access: makeAccess(),
        db,
        authProvider,
      }),
    ).rejects.toBeInstanceOf(AuditLogSettingsScopeInvariantError);
  });

  it('fails closed on contradictory ordinary organization evidence', async () => {
    mocks.readParentTenantId.mockResolvedValue(null);

    await expect(
      resolveAuditLogSettingsAdminScope({
        access: makeAccess(),
        db,
        authProvider,
      }),
    ).rejects.toBeInstanceOf(AuditLogSettingsScopeInvariantError);
  });

  it('treats malformed trusted canonical ids as an invariant failure', async () => {
    await expect(
      resolveAuditLogSettingsAdminScope({
        access: makeAccess({
          user: {
            id: 'not-a-uuid',
            email: 'admin@example.test',
            onboardingComplete: true,
          },
        }),
        db,
        authProvider,
      }),
    ).rejects.toBeInstanceOf(AuditLogSettingsScopeInvariantError);
  });

  it('propagates infrastructure failures without granting fallback scope', async () => {
    mocks.readParentTenantId.mockRejectedValue(new Error('db unavailable'));

    await expect(
      resolveAuditLogSettingsAdminScope({
        access: makeAccess(),
        db,
        authProvider,
      }),
    ).rejects.toThrow('db unavailable');
  });
});
