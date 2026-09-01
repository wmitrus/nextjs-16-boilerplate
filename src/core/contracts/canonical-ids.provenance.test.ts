import { describe, expect, it } from 'vitest';

import type { OrganizationId, TenantId, UserId } from './canonical-ids';
import {
  CanonicalIdRepresentationError,
  internalOrganizationIdFromOrgRow,
  internalUserIdFromUsersRow,
  isCanonicalIdRepresentation,
  parentTenantIdFromOrgRow,
  tenantIdFromTenantsRow,
} from './canonical-ids.provenance';

/**
 * OZI-71 Slice 2 — the audited canonical-id trust boundary.
 *
 * These prove REPRESENTATION handling only. Authority (membership,
 * ownership, authorization) is never asserted here — that lives in
 * `DataScope` derivation.
 */

const UUID_A = '15000000-0000-4000-8000-000000000001';
const UUID_B = '10000000-0000-4000-8000-000000000002';

describe('canonical-ids provenance constructors', () => {
  it('brand a UUID-shaped value read from the documented source row', () => {
    const userId: UserId = internalUserIdFromUsersRow(UUID_A);
    const orgId: OrganizationId = internalOrganizationIdFromOrgRow(UUID_A);
    const parentTenantId: TenantId = parentTenantIdFromOrgRow(UUID_B);
    const tenantId: TenantId = tenantIdFromTenantsRow(UUID_B);

    // Branding is compile-time only: the runtime value is the string itself.
    expect(userId).toBe(UUID_A);
    expect(orgId).toBe(UUID_A);
    expect(parentTenantId).toBe(UUID_B);
    expect(tenantId).toBe(UUID_B);
  });

  it('reject a non-UUID value as a representation contradiction', () => {
    for (const bad of [
      '',
      'org_2abc',
      'not-a-uuid',
      'clerk-org-id',
      '15000000-0000-4000-8000',
      '  15000000-0000-4000-8000-000000000001  ',
    ]) {
      expect(() => internalUserIdFromUsersRow(bad)).toThrow(
        CanonicalIdRepresentationError,
      );
      expect(() => internalOrganizationIdFromOrgRow(bad)).toThrow(
        CanonicalIdRepresentationError,
      );
      expect(() => parentTenantIdFromOrgRow(bad)).toThrow(
        CanonicalIdRepresentationError,
      );
      expect(() => tenantIdFromTenantsRow(bad)).toThrow(
        CanonicalIdRepresentationError,
      );
    }
  });

  it('isCanonicalIdRepresentation is a pure UUID-shape predicate', () => {
    expect(isCanonicalIdRepresentation(UUID_A)).toBe(true);
    expect(isCanonicalIdRepresentation('org_live_2x')).toBe(false);
  });

  it('representation validity is NOT authority — a syntactically valid id still proves nothing', () => {
    // A well-formed UUID the caller never proved is an internal row still
    // brands without error: representation != authority. Membership /
    // ownership checks are the caller's separate responsibility.
    const attackerSuppliedButWellFormed =
      'ffffffff-ffff-4fff-8fff-ffffffffffff';
    expect(() =>
      internalOrganizationIdFromOrgRow(attackerSuppliedButWellFormed),
    ).not.toThrow();
  });
});
