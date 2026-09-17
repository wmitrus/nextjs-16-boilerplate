import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  lookup: { findInternalOrganizationId: vi.fn() },
  authority: { readParentTenantId: vi.fn() },
}));

vi.mock('@/core/env', () => ({
  env: { AUTH_PROVIDER: 'clerk' },
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({ resolve: mocks.resolve }),
}));

import { AUTH, AUTHORIZATION } from '@/core/contracts';

import { resolveCanonicalOrganizationAuditWriteScope } from './resolve-canonical-organization-audit-write-scope';

const ORG_A = '15000000-0000-4000-8000-000000000001';
const ORG_B = '25000000-0000-4000-8000-000000000001';
const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '20000000-0000-4000-8000-000000000001';

describe('resolveCanonicalOrganizationAuditWriteScope', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    const registry = new Map<symbol, unknown>([
      [AUTH.INTERNAL_IDENTITY_LOOKUP, mocks.lookup],
      [AUTHORIZATION.ORGANIZATION_SCOPE_AUTHORITY, mocks.authority],
    ]);

    mocks.resolve.mockImplementation((token: symbol) => registry.get(token));
    mocks.lookup.findInternalOrganizationId.mockResolvedValue(null);
    mocks.authority.readParentTenantId.mockResolvedValue(null);
  });

  it('resolves a verified internal organization with its parent tenant', async () => {
    mocks.authority.readParentTenantId.mockImplementation(async (id: string) =>
      id === ORG_A ? TENANT_A : null,
    );

    await expect(
      resolveCanonicalOrganizationAuditWriteScope(ORG_A),
    ).resolves.toEqual({
      kind: 'organization',
      organizationId: ORG_A,
      tenantId: TENANT_A,
    });
  });

  it('returns null when organization evidence cannot be resolved', async () => {
    await expect(
      resolveCanonicalOrganizationAuditWriteScope('org_unmapped'),
    ).resolves.toBeNull();
  });

  it('returns null for a stale provider mapping', async () => {
    mocks.lookup.findInternalOrganizationId.mockResolvedValue(ORG_A);
    mocks.authority.readParentTenantId.mockResolvedValue(null);

    await expect(
      resolveCanonicalOrganizationAuditWriteScope('org_external'),
    ).resolves.toBeNull();
  });

  it('returns null when internal and provider evidence disagree', async () => {
    mocks.lookup.findInternalOrganizationId.mockResolvedValue(ORG_B);
    mocks.authority.readParentTenantId.mockImplementation(
      async (id: string) => {
        if (id === ORG_A) return TENANT_A;
        if (id === ORG_B) return TENANT_B;
        return null;
      },
    );

    await expect(
      resolveCanonicalOrganizationAuditWriteScope(ORG_A),
    ).resolves.toBeNull();
  });
});
