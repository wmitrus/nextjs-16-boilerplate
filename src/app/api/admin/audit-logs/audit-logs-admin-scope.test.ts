import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const USER = '00000000-0000-4000-8000-000000000001';
const ACTIVE_ORG = '15000000-0000-4000-8000-000000000001';
const PARENT_TENANT = '10000000-0000-4000-8000-000000000001';
const LEGACY_COLLAPSED_TENANT_ID = ACTIVE_ORG;

const mocks = vi.hoisted(() => ({
  readParentTenantId: vi.fn(),
  isMember: vi.fn(),
  isEnvAdmin: vi.fn(),
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

import {
  AuditLogsScopeInvariantError,
  resolveAuditLogsAdminScope,
} from './audit-logs-admin-scope';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

const db = {} as never;

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
      tenantId: LEGACY_COLLAPSED_TENANT_ID,
      userId: USER,
    },
    ...overrides,
  });
}

describe('resolveAuditLogsAdminScope', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readParentTenantId.mockResolvedValue(PARENT_TENANT);
    mocks.isMember.mockResolvedValue(true);
    mocks.isEnvAdmin.mockReturnValue(false);
  });

  it('derives canonical organization scope for an ordinary actor', async () => {
    await expect(resolveAuditLogsAdminScope(makeAccess(), db)).resolves.toEqual(
      {
        kind: 'organization',
        organizationId: ACTIVE_ORG,
        tenantId: PARENT_TENANT,
      },
    );

    expect(mocks.isMember).toHaveBeenCalledWith(USER, ACTIVE_ORG);
  });

  it('loads the parent tenant independently of legacy TenantContext tenantId', async () => {
    const scope = await resolveAuditLogsAdminScope(
      makeAccess({
        tenant: {
          organizationId: ACTIVE_ORG,
          tenantId: 'legacy-collapsed-bogus-value',
          userId: USER,
        },
      }),
      db,
    );

    expect(mocks.readParentTenantId).toHaveBeenCalledWith(ACTIVE_ORG);
    expect(scope).toEqual({
      kind: 'organization',
      organizationId: ACTIVE_ORG,
      tenantId: PARENT_TENANT,
    });
  });

  it('binds parent-tenant and membership evidence to the same organization', async () => {
    await resolveAuditLogsAdminScope(makeAccess(), db);

    expect(mocks.readParentTenantId).toHaveBeenNthCalledWith(1, ACTIVE_ORG);
    expect(mocks.readParentTenantId).toHaveBeenNthCalledWith(2, ACTIVE_ORG);
    expect(mocks.isMember).toHaveBeenCalledWith(USER, ACTIVE_ORG);
  });

  it('returns null on an ordinary membership denial without legacy fallback', async () => {
    mocks.isMember.mockResolvedValue(false);

    await expect(
      resolveAuditLogsAdminScope(makeAccess(), db),
    ).resolves.toBeNull();
  });

  it('derives explicit platform-global scope for a platform admin', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);

    await expect(resolveAuditLogsAdminScope(makeAccess(), db)).resolves.toEqual(
      {
        kind: 'platform-global',
      },
    );

    expect(mocks.readParentTenantId).not.toHaveBeenCalled();
    expect(mocks.isMember).not.toHaveBeenCalled();
  });

  it('treats a missing authoritative parent tenant as an invariant failure', async () => {
    mocks.readParentTenantId.mockResolvedValue(null);

    await expect(
      resolveAuditLogsAdminScope(makeAccess(), db),
    ).rejects.toBeInstanceOf(AuditLogsScopeInvariantError);
  });

  it('fails closed on contradictory organization evidence', async () => {
    mocks.readParentTenantId
      .mockResolvedValueOnce(PARENT_TENANT)
      .mockResolvedValueOnce(null);

    await expect(
      resolveAuditLogsAdminScope(makeAccess(), db),
    ).rejects.toBeInstanceOf(AuditLogsScopeInvariantError);
  });

  it('treats malformed trusted canonical ids as an invariant failure', async () => {
    await expect(
      resolveAuditLogsAdminScope(
        makeAccess({
          user: {
            id: 'not-a-uuid',
            email: 'admin@example.test',
            onboardingComplete: true,
          },
        }),
        db,
      ),
    ).rejects.toBeInstanceOf(AuditLogsScopeInvariantError);
  });

  it('propagates infrastructure failures instead of granting a fallback scope', async () => {
    mocks.readParentTenantId.mockRejectedValue(new Error('db unavailable'));

    await expect(resolveAuditLogsAdminScope(makeAccess(), db)).rejects.toThrow(
      'db unavailable',
    );
  });

  it('only yields organization or platform-global scope', async () => {
    const organizationScope = await resolveAuditLogsAdminScope(
      makeAccess(),
      db,
    );

    mocks.isEnvAdmin.mockReturnValue(true);
    const platformScope = await resolveAuditLogsAdminScope(makeAccess(), db);

    for (const scope of [organizationScope, platformScope]) {
      expect(
        scope?.kind === 'organization' || scope?.kind === 'platform-global',
      ).toBe(true);
    }
  });
});
