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
  FeatureFlagsScopeInvariantError,
  resolveFeatureFlagsAdminScope,
} from './feature-flags-admin-scope';

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

describe('resolveFeatureFlagsAdminScope (shared server-only seam)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readParentTenantId.mockResolvedValue(PARENT_TENANT);
    mocks.isMember.mockResolvedValue(true);
    mocks.isEnvAdmin.mockReturnValue(false);
  });

  it('ordinary actor derives organization scope for the SERVER-RESOLVED active organization', async () => {
    const scope = await resolveFeatureFlagsAdminScope(makeAccess(), db);

    expect(scope).toEqual({
      kind: 'organization',
      organizationId: ACTIVE_ORG,
      tenantId: PARENT_TENANT,
    });
    expect(mocks.isMember).toHaveBeenCalledWith(USER, ACTIVE_ORG);
  });

  it('resulting tenantId comes from authoritative organizations.tenant_id, not the collapsed access.tenant.tenantId', async () => {
    const scope = await resolveFeatureFlagsAdminScope(
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

  it('ordinary membership evidence uses the SAME requested organization for both authoritative reads', async () => {
    await resolveFeatureFlagsAdminScope(makeAccess(), db);

    expect(mocks.readParentTenantId).toHaveBeenNthCalledWith(1, ACTIVE_ORG);
    expect(mocks.readParentTenantId).toHaveBeenNthCalledWith(2, ACTIVE_ORG);
    expect(mocks.isMember).toHaveBeenCalledWith(USER, ACTIVE_ORG);
  });

  it('an ordinary membership denial returns null — never a legacy scope fallback', async () => {
    mocks.isMember.mockResolvedValue(false);

    const scope = await resolveFeatureFlagsAdminScope(makeAccess(), db);

    expect(scope).toBeNull();
  });

  it('platform admin derives explicit platform-global scope without any organization lookup', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);

    const scope = await resolveFeatureFlagsAdminScope(makeAccess(), db);

    expect(scope).toEqual({ kind: 'platform-global' });
    expect(mocks.isEnvAdmin).toHaveBeenCalledWith('admin@example.test');
    // Feature Flags' `platform-global` has a literal DB meaning
    // (intentional_global rows only), unlike Admin Users -- no active
    // organization is needed to grant it.
    expect(mocks.isMember).not.toHaveBeenCalled();
    expect(mocks.readParentTenantId).not.toHaveBeenCalled();
  });

  it('platform admin does NOT receive null even if membership would otherwise be denied', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.isMember.mockResolvedValue(false); // irrelevant on the platform path

    const scope = await resolveFeatureFlagsAdminScope(makeAccess(), db);

    expect(scope).not.toBeNull();
    expect(scope).toEqual({ kind: 'platform-global' });
  });

  it('readParentTenantId null (ordinary path) -> invariant error (not a 404)', async () => {
    mocks.readParentTenantId.mockResolvedValue(null);

    await expect(
      resolveFeatureFlagsAdminScope(makeAccess(), db),
    ).rejects.toBeInstanceOf(FeatureFlagsScopeInvariantError);
  });

  it('a contradictory "not an internal organization" on the second authoritative read throws an invariant error', async () => {
    mocks.readParentTenantId
      .mockResolvedValueOnce(PARENT_TENANT) // AccessContext construction
      .mockResolvedValueOnce(null); // deriveOrganizationScope re-read

    await expect(
      resolveFeatureFlagsAdminScope(makeAccess(), db),
    ).rejects.toBeInstanceOf(FeatureFlagsScopeInvariantError);
  });

  it('a non-UUID trusted id (access.user.id) is a construction invariant, not an authorization outcome', async () => {
    await expect(
      resolveFeatureFlagsAdminScope(
        makeAccess({
          user: {
            id: 'not-a-uuid',
            email: 'admin@example.test',
            onboardingComplete: true,
          },
        }),
        db,
      ),
    ).rejects.toBeInstanceOf(FeatureFlagsScopeInvariantError);
  });

  it('an infrastructure failure propagates as-is (never null, never a grant)', async () => {
    mocks.readParentTenantId.mockRejectedValue(new Error('db unavailable'));

    await expect(
      resolveFeatureFlagsAdminScope(makeAccess(), db),
    ).rejects.toThrow('db unavailable');
  });

  it('this seam only ever yields organization or platform-global scope', async () => {
    const ordinary = await resolveFeatureFlagsAdminScope(makeAccess(), db);
    mocks.isEnvAdmin.mockReturnValue(true);
    const platform = await resolveFeatureFlagsAdminScope(makeAccess(), db);

    for (const scope of [ordinary, platform]) {
      expect(
        scope?.kind === 'organization' || scope?.kind === 'platform-global',
      ).toBe(true);
    }
  });
});
