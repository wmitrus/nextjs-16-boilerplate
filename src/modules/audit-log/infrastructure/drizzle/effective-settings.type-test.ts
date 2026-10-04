import type { DataScope } from '@/core/contracts/access-context';
import type { DrizzleDb } from '@/core/db/types';

import {
  resolveCanonicalEffectiveAuditSetting,
  type AuditEffectiveSettingScope,
} from './effective-settings';

type ScopeParam = Parameters<typeof resolveCanonicalEffectiveAuditSetting>[2];

function _canonicalEffectiveSettingScopeContract(
  db: DrizzleDb,
  organizationScope: Extract<DataScope, { readonly kind: 'organization' }>,
  tenantScope: Extract<DataScope, { readonly kind: 'tenant' }>,
  platformGlobalScope: Extract<DataScope, { readonly kind: 'platform-global' }>,
  wideScope: DataScope,
): void {
  void resolveCanonicalEffectiveAuditSetting(db, 'auth', organizationScope);
  void resolveCanonicalEffectiveAuditSetting(db, 'auth', platformGlobalScope);

  const org: AuditEffectiveSettingScope = organizationScope;
  const global: AuditEffectiveSettingScope = platformGlobalScope;
  void org;
  void global;

  // @ts-expect-error - tenant scope is not valid for audit effective settings
  const _tenant: ScopeParam = tenantScope;
  void _tenant;

  // @ts-expect-error - narrowed scope excludes tenant
  const _tenantAlias: AuditEffectiveSettingScope = tenantScope;
  void _tenantAlias;

  // @ts-expect-error - callers must narrow the full DataScope union
  const _wide: ScopeParam = wideScope;
  void _wide;

  // @ts-expect-error - raw legacy tenant id is never canonical authority
  void resolveCanonicalEffectiveAuditSetting(db, 'auth', 'legacy-tenant-id');

  // @ts-expect-error - null is not a DataScope
  void resolveCanonicalEffectiveAuditSetting(db, 'auth', null);
}

void _canonicalEffectiveSettingScopeContract;
