import { describe, expect, it } from 'vitest';

import { CanonicalIdRepresentationError } from '@/core/contracts/canonical-ids.provenance';

import { buildAccessContext } from './build-access-context';

/**
 * OZI-71 Slice 2 — pure, in-memory canonical `AccessContext` assembly.
 */

const USER = '25000000-0000-4000-8000-000000000001';
const ORG_A = '15000000-0000-4000-8000-000000000001';
const TENANT_A = '10000000-0000-4000-8000-000000000001';

describe('buildAccessContext', () => {
  it('assembles a context with an active organization carrying BOTH canonical ids', () => {
    const ctx = buildAccessContext({
      internalUserId: USER,
      activeOrganization: {
        internalOrganizationId: ORG_A,
        parentTenantId: TENANT_A,
      },
      isPlatformAdmin: false,
    });

    expect(ctx.userId).toBe(USER);
    expect(ctx.activeOrganization).toEqual({
      organizationId: ORG_A,
      tenantId: TENANT_A,
    });
    expect(ctx.isPlatformAdmin).toBe(false);
  });

  it('supports a null active organization (no working-context selection)', () => {
    const ctx = buildAccessContext({
      internalUserId: USER,
      activeOrganization: null,
      isPlatformAdmin: true,
    });

    expect(ctx.activeOrganization).toBeNull();
    expect(ctx.isPlatformAdmin).toBe(true);
  });

  it('carries the server-verified platform-admin capability verbatim', () => {
    expect(
      buildAccessContext({
        internalUserId: USER,
        activeOrganization: null,
        isPlatformAdmin: true,
      }).isPlatformAdmin,
    ).toBe(true);
  });

  it('never carries a `scope` or `membershipOrganizationIds` field', () => {
    const ctx = buildAccessContext({
      internalUserId: USER,
      activeOrganization: {
        internalOrganizationId: ORG_A,
        parentTenantId: TENANT_A,
      },
      isPlatformAdmin: false,
    });

    expect(Object.keys(ctx).sort()).toEqual([
      'activeOrganization',
      'isPlatformAdmin',
      'userId',
    ]);
  });

  it('surfaces a construction contradiction rather than branding a non-internal id', () => {
    expect(() =>
      buildAccessContext({
        internalUserId: 'external-provider-user-id',
        activeOrganization: null,
        isPlatformAdmin: false,
      }),
    ).toThrow(CanonicalIdRepresentationError);

    expect(() =>
      buildAccessContext({
        internalUserId: USER,
        activeOrganization: {
          internalOrganizationId: 'org_clerk_123',
          parentTenantId: TENANT_A,
        },
        isPlatformAdmin: false,
      }),
    ).toThrow(CanonicalIdRepresentationError);
  });
});
