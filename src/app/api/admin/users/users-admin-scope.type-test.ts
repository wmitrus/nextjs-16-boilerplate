/**
 * OZI-71 Slice 4B — COMPILE-TIME proof that the Admin Users
 * repository/service boundary accepts ONLY the canonical narrowed
 * `organization` / `platform-global` `DataScope`, and rejects `tenant` scope,
 * the full un-narrowed `DataScope` union, and `null`.
 *
 * This file is checked by `tsc` (`pnpm typecheck`). The contract function is
 * intentionally NEVER called; its body is still fully type-checked, so every
 * `@ts-expect-error` is a genuine negative assertion. If the narrowing
 * regresses, the suppressed error disappears and `tsc` reports the now-unused
 * directive (TS2578) — the suite fails either way.
 */

import type { DataScope } from '@/core/contracts/access-context';
import type { DrizzleDb } from '@/core/db/types';

import {
  DrizzleAdminUsersService,
  type AdminUsersDataScope,
} from '@/modules/user/infrastructure/drizzle/DrizzleAdminUsersService';

type ListScopeParam = Parameters<DrizzleAdminUsersService['listAll']>[1];
type FindScopeParam = Parameters<DrizzleAdminUsersService['findById']>[1];
type UpdateScopeParam = Parameters<
  DrizzleAdminUsersService['updateProfile']
>[2];
type DeactivateScopeParam = Parameters<
  DrizzleAdminUsersService['deactivate']
>[2];

function _adminUsersDataScopeTypeContract(
  db: DrizzleDb,
  organizationScope: Extract<DataScope, { readonly kind: 'organization' }>,
  tenantScope: Extract<DataScope, { readonly kind: 'tenant' }>,
  platformGlobalScope: Extract<DataScope, { readonly kind: 'platform-global' }>,
  wideScope: DataScope,
): void {
  const service = new DrizzleAdminUsersService(db);

  // Positive: organization + platform-global are accepted by every method.
  void service.listAll({}, organizationScope);
  void service.listAll({}, platformGlobalScope);
  void service.findById('x', organizationScope);
  void service.findById('x', platformGlobalScope);
  void service.updateProfile('x', {}, organizationScope);
  void service.updateProfile('x', {}, platformGlobalScope);
  void service.deactivate('x', new Date(), organizationScope);
  void service.deactivate('x', new Date(), platformGlobalScope);

  const narrowedOrg: AdminUsersDataScope = organizationScope;
  const narrowedGlobal: AdminUsersDataScope = platformGlobalScope;
  void narrowedOrg;
  void narrowedGlobal;

  // Negative: `tenant` scope is not a legal argument for ANY method.
  // @ts-expect-error - listAll scope param excludes tenant
  const _l1: ListScopeParam = tenantScope;
  void _l1;
  // @ts-expect-error - findById scope param excludes tenant
  const _f1: FindScopeParam = tenantScope;
  void _f1;
  // @ts-expect-error - updateProfile scope param excludes tenant
  const _u1: UpdateScopeParam = tenantScope;
  void _u1;
  // @ts-expect-error - deactivate scope param excludes tenant
  const _d1: DeactivateScopeParam = tenantScope;
  void _d1;
  // @ts-expect-error - the narrowed alias excludes tenant
  const _n1: AdminUsersDataScope = tenantScope;
  void _n1;

  // Negative: the full DataScope union (which contains tenant) is rejected —
  // the boundary requires the narrowed alias.
  // @ts-expect-error - the wide DataScope union is not the narrowed AdminUsersDataScope
  const _w1: UpdateScopeParam = wideScope;
  void _w1;
  // @ts-expect-error - the wide DataScope union is not the narrowed AdminUsersDataScope
  const _w2: AdminUsersDataScope = wideScope;
  void _w2;

  // Negative: `null` is not a member of the scope parameter.
  // @ts-expect-error - listAll scope param is not nullable
  const _z1: ListScopeParam = null;
  void _z1;
  // @ts-expect-error - deactivate scope param is not nullable
  const _z2: DeactivateScopeParam = null;
  void _z2;
}
void _adminUsersDataScopeTypeContract;
