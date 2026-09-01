import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '@/core/contracts/access-context';
import type {
  OrganizationScopeAuthority,
  TenantExistenceReader,
} from '@/core/contracts/access-scope-authority';

import { buildAccessContext } from './build-access-context';
import {
  derivePlatformGlobalScope,
  deriveOrganizationScope,
  deriveTenantScopeAsPlatformAdmin,
} from './derive-data-scope';

/**
 * OZI-71 Slice 2 — security-negative proofs for per-operation `DataScope`
 * derivation. Evidence is read through injected authority ports, each keyed
 * on the SAME requested id — never a detached caller-supplied fact.
 */

const USER = '25000000-0000-4000-8000-000000000001';
const OTHER_USER = '25000000-0000-4000-8000-000000000009';
const ORG_A = '15000000-0000-4000-8000-000000000001';
const TENANT_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '15000000-0000-4000-8000-000000000002';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

function ordinaryActorInOrgA(): AccessContext {
  return buildAccessContext({
    internalUserId: USER,
    activeOrganization: {
      internalOrganizationId: ORG_A,
      parentTenantId: TENANT_A,
    },
    isPlatformAdmin: false,
  });
}

function platformAdmin(): AccessContext {
  return buildAccessContext({
    internalUserId: USER,
    activeOrganization: null,
    isPlatformAdmin: true,
  });
}

/**
 * A fake authority whose data is keyed by organization id. It CANNOT be
 * mis-pointed by the caller: `deriveOrganizationScope` decides which id every
 * read uses.
 */
function fakeOrgAuthority(data: {
  parentTenantByOrg: Record<string, string>;
  membersByOrg: Record<string, string[]>;
}): OrganizationScopeAuthority & {
  readParentTenantId: ReturnType<typeof vi.fn>;
  isMember: ReturnType<typeof vi.fn>;
} {
  const parents = new Map(Object.entries(data.parentTenantByOrg));
  const members = new Map(Object.entries(data.membersByOrg));
  return {
    readParentTenantId: vi.fn((organizationId: string) =>
      Promise.resolve(parents.get(organizationId) ?? null),
    ),
    isMember: vi.fn((userId: string, organizationId: string) =>
      Promise.resolve((members.get(organizationId) ?? []).includes(userId)),
    ),
  };
}

function fakeTenantExistence(
  existingTenantIds: string[],
): TenantExistenceReader & { exists: ReturnType<typeof vi.fn> } {
  return {
    exists: vi.fn((tenantId: string) =>
      Promise.resolve(existingTenantIds.includes(tenantId)),
    ),
  };
}

describe('deriveOrganizationScope', () => {
  it('(1) grants organization scope only for the organization the caller is verified in', async () => {
    const authority = fakeOrgAuthority({
      parentTenantByOrg: { [ORG_A]: TENANT_A },
      membersByOrg: { [ORG_A]: [USER] },
    });

    const result = await deriveOrganizationScope({
      accessContext: ordinaryActorInOrgA(),
      requestedOrganizationId: ORG_A,
      authority,
    });

    expect(result).toEqual({
      outcome: 'granted',
      scope: {
        kind: 'organization',
        organizationId: ORG_A,
        tenantId: TENANT_A,
      },
    });
  });

  it('(2) denies organization scope for a sibling organization the caller is NOT a member of', async () => {
    const authority = fakeOrgAuthority({
      parentTenantByOrg: { [ORG_A]: TENANT_A, [ORG_B]: TENANT_B },
      membersByOrg: { [ORG_A]: [USER], [ORG_B]: [OTHER_USER] },
    });

    const result = await deriveOrganizationScope({
      accessContext: ordinaryActorInOrgA(),
      requestedOrganizationId: ORG_B,
      authority,
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'organization-membership-required',
    });
  });

  it('binds BOTH authoritative reads to the requested id — membership for ORG_A cannot be reused for ORG_B', async () => {
    const authority = fakeOrgAuthority({
      parentTenantByOrg: { [ORG_A]: TENANT_A, [ORG_B]: TENANT_B },
      // Caller is a member of ORG_A only. The actor's activeOrganization is
      // ORG_A. The requested id is ORG_B.
      membersByOrg: { [ORG_A]: [USER] },
    });

    const result = await deriveOrganizationScope({
      accessContext: ordinaryActorInOrgA(),
      requestedOrganizationId: ORG_B,
      authority,
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'organization-membership-required',
    });
    // Every read used ORG_B — never ORG_A from the context.
    expect(authority.readParentTenantId).toHaveBeenCalledWith(ORG_B);
    expect(authority.readParentTenantId).not.toHaveBeenCalledWith(ORG_A);
    expect(authority.isMember).toHaveBeenCalledWith(USER, ORG_B);
    expect(authority.isMember).not.toHaveBeenCalledWith(USER, ORG_A);
  });

  it('a granted scope carries the parent tenant read for the REQUESTED org, not a caller-chosen pairing', async () => {
    const authority = fakeOrgAuthority({
      parentTenantByOrg: { [ORG_A]: TENANT_A, [ORG_B]: TENANT_B },
      membersByOrg: { [ORG_B]: [USER] },
    });

    const result = await deriveOrganizationScope({
      accessContext: ordinaryActorInOrgA(), // activeOrganization is ORG_A / TENANT_A
      requestedOrganizationId: ORG_B,
      authority,
    });

    expect(result).toEqual({
      outcome: 'granted',
      scope: {
        kind: 'organization',
        organizationId: ORG_B,
        tenantId: TENANT_B,
      },
    });
  });

  it('(7) a syntactically valid requested id that resolves to no organization row is denied', async () => {
    const authority = fakeOrgAuthority({
      parentTenantByOrg: {},
      membersByOrg: {},
    });

    const result = await deriveOrganizationScope({
      accessContext: ordinaryActorInOrgA(),
      requestedOrganizationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      authority,
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'not-an-internal-organization',
    });
    // Membership is never consulted once the org fails to resolve.
    expect(authority.isMember).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID requested id before any read', async () => {
    const authority = fakeOrgAuthority({
      parentTenantByOrg: {},
      membersByOrg: {},
    });

    const result = await deriveOrganizationScope({
      accessContext: ordinaryActorInOrgA(),
      requestedOrganizationId: 'org_clerk_123',
      authority,
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'not-an-internal-organization',
    });
    expect(authority.readParentTenantId).not.toHaveBeenCalled();
    expect(authority.isMember).not.toHaveBeenCalled();
  });

  it('does not grant scope for the active organization when membership is not independently verified', async () => {
    const authority = fakeOrgAuthority({
      parentTenantByOrg: { [ORG_A]: TENANT_A },
      membersByOrg: {}, // no membership rows at all
    });

    const result = await deriveOrganizationScope({
      accessContext: ordinaryActorInOrgA(),
      requestedOrganizationId: ORG_A,
      authority,
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'organization-membership-required',
    });
  });
});

describe('tenant scope is unreachable for ordinary organization membership', () => {
  it('(3) organization membership under TENANT_A does not produce tenant scope for TENANT_A', async () => {
    const tenants = fakeTenantExistence([TENANT_A, TENANT_B]);

    const result = await deriveTenantScopeAsPlatformAdmin({
      accessContext: ordinaryActorInOrgA(),
      requestedTenantId: TENANT_A,
      operation: { kind: 'tenant-administration' },
      tenants,
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'platform-admin-capability-required',
    });
    // Existence is never even checked for a non-platform-admin.
    expect(tenants.exists).not.toHaveBeenCalled();
  });

  it('(4) organization membership under TENANT_A does not produce tenant scope for another tenant', async () => {
    const tenants = fakeTenantExistence([TENANT_A, TENANT_B]);

    const result = await deriveTenantScopeAsPlatformAdmin({
      accessContext: ordinaryActorInOrgA(),
      requestedTenantId: TENANT_B,
      operation: { kind: 'tenant-administration' },
      tenants,
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'platform-admin-capability-required',
    });
  });

  it('a platform admin still needs the explicit tenant-administration classification', async () => {
    const tenants = fakeTenantExistence([TENANT_A]);

    const result = await deriveTenantScopeAsPlatformAdmin({
      accessContext: platformAdmin(),
      requestedTenantId: TENANT_A,
      // @ts-expect-error - only 'tenant-administration' is accepted
      operation: { kind: 'read-something-else' },
      tenants,
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'explicit-tenant-administration-classification-required',
    });
    expect(tenants.exists).not.toHaveBeenCalled();
  });

  it('a platform admin targeting a UUID with no tenants row is denied `not-an-internal-tenant`', async () => {
    const tenants = fakeTenantExistence([TENANT_A]); // TENANT_B does not exist

    const result = await deriveTenantScopeAsPlatformAdmin({
      accessContext: platformAdmin(),
      requestedTenantId: TENANT_B,
      operation: { kind: 'tenant-administration' },
      tenants,
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'not-an-internal-tenant',
    });
    expect(tenants.exists).toHaveBeenCalledWith(TENANT_B);
  });

  it('grants tenant scope only for an explicitly-classified platform-admin operation targeting an existing tenant', async () => {
    const tenants = fakeTenantExistence([TENANT_A]);

    const result = await deriveTenantScopeAsPlatformAdmin({
      accessContext: platformAdmin(),
      requestedTenantId: TENANT_A,
      operation: { kind: 'tenant-administration' },
      tenants,
    });

    expect(result).toEqual({
      outcome: 'granted',
      scope: { kind: 'tenant', tenantId: TENANT_A },
    });
    expect(tenants.exists).toHaveBeenCalledWith(TENANT_A);
  });
});

describe('derivePlatformGlobalScope', () => {
  it('(5) an ordinary user can never produce platform-global scope', () => {
    const result = derivePlatformGlobalScope({
      accessContext: ordinaryActorInOrgA(),
      operation: { kind: 'platform-global' },
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'platform-admin-capability-required',
    });
  });

  it('(6) platform-admin capability alone does not produce platform-global scope without an explicit classification', () => {
    const result = derivePlatformGlobalScope({
      accessContext: platformAdmin(),
      // @ts-expect-error - only 'platform-global' is accepted
      operation: { kind: 'organization-read' },
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'explicit-platform-global-classification-required',
    });
  });

  it('grants platform-global scope only for an explicitly-classified platform-admin operation', () => {
    const result = derivePlatformGlobalScope({
      accessContext: platformAdmin(),
      operation: { kind: 'platform-global' },
    });

    expect(result).toEqual({
      outcome: 'granted',
      scope: { kind: 'platform-global' },
    });
  });
});
