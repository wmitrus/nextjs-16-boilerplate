/**
 * OZI-71 FF·D — COMPILE-TIME proof that the Feature Flags admin
 * list/update/delete boundary accepts ONLY the canonical narrowed
 * `organization` / `platform-global` scope, and rejects `tenant` scope, the
 * full un-narrowed `DataScope` union, and `null`.
 *
 * This file is checked by `tsc` (`pnpm typecheck`). The contract function is
 * intentionally NEVER called; its body is still fully type-checked, so every
 * `@ts-expect-error` is a genuine negative assertion. If the narrowing
 * regresses, the suppressed error disappears and `tsc` reports the now-unused
 * directive (TS2578) — the suite fails either way. Mirrors
 * `src/app/api/admin/users/users-admin-scope.type-test.ts`.
 */

import type { DataScope } from '@/core/contracts/access-context';
import type { DrizzleDb } from '@/core/db/types';

import {
  DrizzleFeatureFlagAdminService,
  type FeatureFlagAdminScope,
} from './DrizzleFeatureFlagAdminService';

type ListScopeParam = Parameters<DrizzleFeatureFlagAdminService['list']>[0];
type UpdateScopeParam = Parameters<DrizzleFeatureFlagAdminService['update']>[2];
type DeleteScopeParam = Parameters<DrizzleFeatureFlagAdminService['delete']>[1];

function _featureFlagAdminScopeTypeContract(
  db: DrizzleDb,
  organizationScope: Extract<DataScope, { readonly kind: 'organization' }>,
  tenantScope: Extract<DataScope, { readonly kind: 'tenant' }>,
  platformGlobalScope: Extract<DataScope, { readonly kind: 'platform-global' }>,
  wideScope: DataScope,
): void {
  const service = new DrizzleFeatureFlagAdminService(db);

  // Positive: organization + platform-global are accepted by every method.
  const pagination = { limit: 50, offset: 0 };
  void service.list(organizationScope, pagination);
  void service.list(platformGlobalScope, pagination);
  void service.update('x', {}, organizationScope);
  void service.update('x', {}, platformGlobalScope);
  void service.delete('x', organizationScope);
  void service.delete('x', platformGlobalScope);

  const narrowedOrg: FeatureFlagAdminScope = organizationScope;
  const narrowedGlobal: FeatureFlagAdminScope = platformGlobalScope;
  void narrowedOrg;
  void narrowedGlobal;

  // Negative: `tenant` scope is not a legal argument for ANY method.
  // @ts-expect-error - list scope param excludes tenant
  const _l1: ListScopeParam = tenantScope;
  void _l1;
  // @ts-expect-error - update scope param excludes tenant
  const _u1: UpdateScopeParam = tenantScope;
  void _u1;
  // @ts-expect-error - delete scope param excludes tenant
  const _d1: DeleteScopeParam = tenantScope;
  void _d1;
  // @ts-expect-error - the narrowed alias excludes tenant
  const _n1: FeatureFlagAdminScope = tenantScope;
  void _n1;

  // Negative: the full DataScope union (which contains tenant) is rejected —
  // the boundary requires the narrowed alias. Full 3-method matrix, per the
  // review requirement (list/update/delete all share one narrowed type, but
  // each is asserted independently so the contract can't silently regress
  // for just one of them).
  // @ts-expect-error - list scope param is not the narrowed FeatureFlagAdminScope
  const _w0: ListScopeParam = wideScope;
  void _w0;
  // @ts-expect-error - the wide DataScope union is not the narrowed FeatureFlagAdminScope
  const _w1: UpdateScopeParam = wideScope;
  void _w1;
  // @ts-expect-error - delete scope param is not the narrowed FeatureFlagAdminScope
  const _w3: DeleteScopeParam = wideScope;
  void _w3;
  // @ts-expect-error - the wide DataScope union is not the narrowed FeatureFlagAdminScope
  const _w2: FeatureFlagAdminScope = wideScope;
  void _w2;

  // Negative: `null` is not a member of the scope parameter — full 3-method
  // matrix, same reasoning as above.
  // @ts-expect-error - list scope param is not nullable
  const _z1: ListScopeParam = null;
  void _z1;
  // @ts-expect-error - update scope param is not nullable
  const _z3: UpdateScopeParam = null;
  void _z3;
  // @ts-expect-error - delete scope param is not nullable
  const _z2: DeleteScopeParam = null;
  void _z2;
}
void _featureFlagAdminScopeTypeContract;
