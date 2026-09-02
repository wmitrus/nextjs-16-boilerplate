import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const USER = '00000000-0000-4000-8000-000000000001';
const ACTIVE_ORG = '15000000-0000-4000-8000-000000000001';
const PARENT_TENANT = '10000000-0000-4000-8000-000000000001';
/** A deliberately non-canonical value in the legacy collapsed slot. */
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
  AdminUsersScopeInvariantError,
  resolveAdminUsersScope,
} from './users-admin-scope';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

const db = {} as never;

function makeAccess(
  overrides: Partial<Parameters<typeof makeAllowedProvisioningAccess>[0]> = {},
) {
  return makeAllowedProvisioningAccess({
    identity: { id: USER, email: 'admin@example.test' },
    user: { id: USER, email: 'admin@example.test', onboardingComplete: true },
    tenant: {
      organizationId: ACTIVE_ORG,
      tenantId: LEGACY_COLLAPSED_TENANT_ID,
      userId: USER,
    },
    ...overrides,
  });
}

describe('resolveAdminUsersScope (shared server-only seam)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readParentTenantId.mockResolvedValue(PARENT_TENANT);
    mocks.isMember.mockResolvedValue(true);
    mocks.isEnvAdmin.mockReturnValue(false);
  });

  it('(1,2,3) ordinary actor derives organization scope for the SERVER-RESOLVED active organization', async () => {
    const scope = await resolveAdminUsersScope(makeAccess(), db);

    expect(scope).toEqual({
      kind: 'organization',
      organizationId: ACTIVE_ORG,
      tenantId: PARENT_TENANT,
    });
    // Membership is proven for exactly the active organization + this user.
    expect(mocks.isMember).toHaveBeenCalledWith(USER, ACTIVE_ORG);
  });

  it('(3,4) resulting tenantId comes from authoritative organizations.tenant_id, not the collapsed access.tenant.tenantId', async () => {
    const scope = await resolveAdminUsersScope(
      makeAccess({
        tenant: {
          organizationId: ACTIVE_ORG,
          tenantId: 'tenant_collapsed_bogus_value',
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

  it('(5,6) the internal actor user id is taken from access.user.id (no second user query)', async () => {
    await resolveAdminUsersScope(
      makeAccess({
        identity: { id: 'external-clerk-id', email: 'admin@example.test' },
        user: {
          id: USER,
          email: 'admin@example.test',
          onboardingComplete: true,
        },
      }),
      db,
    );

    expect(mocks.isMember).toHaveBeenCalledWith(USER, ACTIVE_ORG);
    // Only the two organization-authority reads happen; no extra user lookup.
    expect(mocks.readParentTenantId).toHaveBeenCalledTimes(2);
  });

  it('(7) ordinary membership evidence uses the SAME requested organization', async () => {
    await resolveAdminUsersScope(makeAccess(), db);

    expect(mocks.readParentTenantId).toHaveBeenNthCalledWith(1, ACTIVE_ORG);
    expect(mocks.readParentTenantId).toHaveBeenNthCalledWith(2, ACTIVE_ORG);
    expect(mocks.isMember).toHaveBeenCalledWith(USER, ACTIVE_ORG);
  });

  it('(8,9) an ordinary membership denial returns null — never a legacy scope fallback', async () => {
    mocks.isMember.mockResolvedValue(false);

    const scope = await resolveAdminUsersScope(makeAccess(), db);

    expect(scope).toBeNull();
  });

  it('(10,13) platform admin derives explicit platform-global scope', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);

    const scope = await resolveAdminUsersScope(makeAccess(), db);

    expect(scope).toEqual({ kind: 'platform-global' });
    expect(mocks.isEnvAdmin).toHaveBeenCalledWith('admin@example.test');
    // The platform path proves neither membership nor tenant existence.
    expect(mocks.isMember).not.toHaveBeenCalled();
  });

  it('(11) platform admin does NOT receive tenant scope', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);

    const scope = await resolveAdminUsersScope(makeAccess(), db);

    expect(scope?.kind).not.toBe('tenant');
    expect(scope?.kind).toBe('platform-global');
  });

  it('(12) platform admin does NOT receive null', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.isMember.mockResolvedValue(false); // irrelevant on the platform path

    const scope = await resolveAdminUsersScope(makeAccess(), db);

    expect(scope).not.toBeNull();
    expect(scope).toEqual({ kind: 'platform-global' });
  });

  it('(14) readParentTenantId null -> invariant error (not a 404)', async () => {
    mocks.readParentTenantId.mockResolvedValue(null);

    await expect(
      resolveAdminUsersScope(makeAccess(), db),
    ).rejects.toBeInstanceOf(AdminUsersScopeInvariantError);
  });

  it('(14) a contradictory "not an internal organization" on the second authoritative read throws an invariant error', async () => {
    mocks.readParentTenantId
      .mockResolvedValueOnce(PARENT_TENANT) // AccessContext construction
      .mockResolvedValueOnce(null); // deriveOrganizationScope re-read

    await expect(
      resolveAdminUsersScope(makeAccess(), db),
    ).rejects.toBeInstanceOf(AdminUsersScopeInvariantError);
  });

  it('(15) a non-UUID trusted id (access.user.id) is a construction invariant, not an authorization outcome', async () => {
    await expect(
      resolveAdminUsersScope(
        makeAccess({
          user: {
            id: 'not-a-uuid',
            email: 'admin@example.test',
            onboardingComplete: true,
          },
        }),
        db,
      ),
    ).rejects.toBeInstanceOf(AdminUsersScopeInvariantError);
  });

  it('(16) an infrastructure failure propagates as-is (never null, never a grant)', async () => {
    mocks.readParentTenantId.mockRejectedValue(new Error('db unavailable'));

    await expect(resolveAdminUsersScope(makeAccess(), db)).rejects.toThrow(
      'db unavailable',
    );
  });

  it('the invariant error message is identifier-free', () => {
    const message = new AdminUsersScopeInvariantError().message;
    expect(message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(message).not.toContain(ACTIVE_ORG);
    expect(message).not.toContain(PARENT_TENANT);
  });

  it('this seam only ever yields organization or platform-global scope', async () => {
    const ordinary = await resolveAdminUsersScope(makeAccess(), db);
    mocks.isEnvAdmin.mockReturnValue(true);
    const platform = await resolveAdminUsersScope(makeAccess(), db);

    for (const scope of [ordinary, platform]) {
      expect(
        scope?.kind === 'organization' || scope?.kind === 'platform-global',
      ).toBe(true);
    }
  });
});
