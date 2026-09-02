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
  tenantExists: vi.fn(),
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

vi.mock(
  '@/modules/authorization/infrastructure/drizzle/DrizzleTenantExistenceReader',
  () => ({
    DrizzleTenantExistenceReader: class {
      exists(...args: unknown[]) {
        return mocks.tenantExists(...args);
      }
    },
  }),
);

vi.mock('@/security/core/platform-admin', () => ({
  isEnvBasedPlatformAdmin: mocks.isEnvAdmin,
}));

import {
  OrganizationsAdminScopeInvariantError,
  resolveOrganizationsAdminScope,
} from './organizations-admin-scope';

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

describe('resolveOrganizationsAdminScope (shared server-only seam)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readParentTenantId.mockResolvedValue(PARENT_TENANT);
    mocks.isMember.mockResolvedValue(true);
    mocks.tenantExists.mockResolvedValue(true);
    mocks.isEnvAdmin.mockReturnValue(false);
  });

  it('(1,4) ordinary actor derives organization scope for the SERVER-RESOLVED active organization', async () => {
    const scope = await resolveOrganizationsAdminScope(makeAccess(), db);

    expect(scope).toEqual({
      kind: 'organization',
      organizationId: ACTIVE_ORG,
      tenantId: PARENT_TENANT,
    });
    // Membership is proven for exactly the active organization + this user.
    expect(mocks.isMember).toHaveBeenCalledWith(USER, ACTIVE_ORG);
  });

  it('(1) the internal user id is taken from access.user.id (no second user query)', async () => {
    await resolveOrganizationsAdminScope(
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
  });

  it('(2,10) parent tenant comes from OrganizationScopeAuthority, never the collapsed access.tenant.tenantId', async () => {
    const scope = await resolveOrganizationsAdminScope(
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

  it('(3) isPlatformAdmin stays server-derived (evaluated from the identity email)', async () => {
    await resolveOrganizationsAdminScope(makeAccess(), db);
    expect(mocks.isEnvAdmin).toHaveBeenCalledWith('admin@example.test');
  });

  it('(5) platform admin derives bounded tenant scope for the active org parent tenant', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);

    const scope = await resolveOrganizationsAdminScope(makeAccess(), db);

    expect(scope).toEqual({ kind: 'tenant', tenantId: PARENT_TENANT });
    expect(mocks.tenantExists).toHaveBeenCalledWith(PARENT_TENANT);
    // Platform path proves tenant existence, not membership.
    expect(mocks.isMember).not.toHaveBeenCalled();
  });

  it('(6,9) an ordinary membership denial returns null — never a legacy scope fallback', async () => {
    mocks.isMember.mockResolvedValue(false);

    const scope = await resolveOrganizationsAdminScope(makeAccess(), db);

    expect(scope).toBeNull();
  });

  it('(7) a contradictory "not an internal organization" on the second authoritative read throws an invariant error', async () => {
    mocks.readParentTenantId
      .mockResolvedValueOnce(PARENT_TENANT) // AccessContext construction
      .mockResolvedValueOnce(null); // deriveOrganizationScope re-read

    await expect(
      resolveOrganizationsAdminScope(makeAccess(), db),
    ).rejects.toBeInstanceOf(OrganizationsAdminScopeInvariantError);
  });

  it('active organization with no parent tenant throws an invariant error (not a 404)', async () => {
    mocks.readParentTenantId.mockResolvedValue(null);

    await expect(
      resolveOrganizationsAdminScope(makeAccess(), db),
    ).rejects.toBeInstanceOf(OrganizationsAdminScopeInvariantError);
  });

  it('a non-UUID trusted id (access.user.id) is a construction invariant, not an authorization outcome', async () => {
    await expect(
      resolveOrganizationsAdminScope(
        makeAccess({
          user: {
            id: 'not-a-uuid',
            email: 'admin@example.test',
            onboardingComplete: true,
          },
        }),
        db,
      ),
    ).rejects.toBeInstanceOf(OrganizationsAdminScopeInvariantError);
  });

  it('(8) any platform-branch derivation denial throws an invariant error', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.tenantExists.mockResolvedValue(false);

    await expect(
      resolveOrganizationsAdminScope(makeAccess(), db),
    ).rejects.toBeInstanceOf(OrganizationsAdminScopeInvariantError);
  });

  it('(11) an infrastructure failure propagates as-is (never null, never a grant)', async () => {
    mocks.readParentTenantId.mockRejectedValue(new Error('db unavailable'));

    await expect(
      resolveOrganizationsAdminScope(makeAccess(), db),
    ).rejects.toThrow('db unavailable');
  });

  it('(12) this seam never produces a platform-global scope', async () => {
    const ordinary = await resolveOrganizationsAdminScope(makeAccess(), db);
    mocks.isEnvAdmin.mockReturnValue(true);
    const platform = await resolveOrganizationsAdminScope(makeAccess(), db);

    for (const scope of [ordinary, platform]) {
      expect(scope?.kind === 'organization' || scope?.kind === 'tenant').toBe(
        true,
      );
    }
  });
});
