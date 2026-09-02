import { describe, expect, it } from 'vitest';

import type { DataScope } from '@/core/contracts/access-context';
import type { DrizzleDb } from '@/core/db/types';

import { DrizzleAdminOrganizationsMutationService } from './DrizzleAdminOrganizationsMutationService';
import {
  DrizzleAdminOrganizationsReadService,
  organizationsAdminScopeFilter,
  type OrganizationsAdminDataScope,
} from './DrizzleAdminOrganizationsReadService';

/**
 * OZI-71 Slice 3 — COMPILE-TIME proof that the organizations admin
 * repository/service boundary accepts ONLY the canonical narrowed
 * `organization` / `tenant` `DataScope`, and that a `platform-global`
 * `DataScope` (or the full `DataScope` union, which contains it) is an
 * invalid argument.
 *
 * This function is intentionally NEVER called: `tsc` (`pnpm typecheck`) still
 * fully type-checks its body, so every `@ts-expect-error` is a genuine
 * negative assertion. If the narrowing regresses, the suppressed error
 * disappears and `tsc` reports the now-unused directive (TS2578).
 */
type ReadDetailScopeParam = Parameters<
  DrizzleAdminOrganizationsReadService['getDetailInActiveScope']
>[0]['scope'];
type ListScopeParam = Parameters<
  DrizzleAdminOrganizationsReadService['listInActiveScope']
>[0]['scope'];
type MutateScopeParam = Parameters<
  DrizzleAdminOrganizationsMutationService['updateOrganizationStatus']
>[0]['scope'];
type ScopeFilterParam = Parameters<typeof organizationsAdminScopeFilter>[0];

function _organizationsAdminScopeTypeContract(
  db: DrizzleDb,
  organizationScope: Extract<DataScope, { readonly kind: 'organization' }>,
  tenantScope: Extract<DataScope, { readonly kind: 'tenant' }>,
  platformGlobalScope: Extract<DataScope, { readonly kind: 'platform-global' }>,
  wideScope: DataScope,
): void {
  const read = new DrizzleAdminOrganizationsReadService(db);
  const mutation = new DrizzleAdminOrganizationsMutationService(db);

  // Positive: organization + tenant scope are accepted everywhere.
  void read.getDetailInActiveScope({
    scope: organizationScope,
    organizationId: 'x',
  });
  void read.listInActiveScope({
    scope: tenantScope,
    activeOrganizationId: 'x',
    limit: 1,
    offset: 0,
  });
  void mutation.updateOrganizationStatus({
    scope: organizationScope,
    organizationId: 'x',
    status: 'active',
  });
  void organizationsAdminScopeFilter(tenantScope);
  const narrowed: OrganizationsAdminDataScope = organizationScope;
  void narrowed;

  // Negative: `platform-global` is not a legal argument for the scope
  // parameter of ANY organizations service method (nor the shared filter).
  // @ts-expect-error - read.getDetailInActiveScope scope param excludes platform-global
  const _r1: ReadDetailScopeParam = platformGlobalScope;
  void _r1;
  // @ts-expect-error - read.listInActiveScope scope param excludes platform-global
  const _r2: ListScopeParam = platformGlobalScope;
  void _r2;
  // @ts-expect-error - mutation.updateOrganizationStatus scope param excludes platform-global
  const _m1: MutateScopeParam = platformGlobalScope;
  void _m1;
  // @ts-expect-error - organizationsAdminScopeFilter excludes platform-global
  const _f1: ScopeFilterParam = platformGlobalScope;
  void _f1;

  // Negative: the full DataScope union (which contains platform-global) is
  // also rejected — the boundary requires the narrowed alias.
  // @ts-expect-error - the wide DataScope union is not the narrowed organizations-admin scope
  const _w1: MutateScopeParam = wideScope;
  void _w1;
  // @ts-expect-error - the wide DataScope union is not the narrowed organizations-admin scope
  const _w2: OrganizationsAdminDataScope = wideScope;
  void _w2;
}
void _organizationsAdminScopeTypeContract;

describe('OrganizationsAdminDataScope', () => {
  it('excludes platform-global at the service boundary (compile-time — see _organizationsAdminScopeTypeContract)', () => {
    expect(true).toBe(true);
  });
});
