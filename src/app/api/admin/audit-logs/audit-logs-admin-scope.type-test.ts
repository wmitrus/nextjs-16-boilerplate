import type { DataScope } from '@/core/contracts/access-context';
import type { DrizzleDb } from '@/core/db/types';

import {
  DrizzleAuditLogReadService,
  type AuditLogsDataScope,
} from '@/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogReadService';

type ListScopeParam = Parameters<DrizzleAuditLogReadService['list']>[0];

function _auditLogsDataScopeTypeContract(
  db: DrizzleDb,
  organizationScope: Extract<DataScope, { readonly kind: 'organization' }>,
  tenantScope: Extract<DataScope, { readonly kind: 'tenant' }>,
  platformGlobalScope: Extract<DataScope, { readonly kind: 'platform-global' }>,
  wideScope: DataScope,
): void {
  const service = new DrizzleAuditLogReadService(db);

  // Canonical viewer accepts exactly organization or platform-global.
  void service.list(organizationScope, {}, { limit: 50, offset: 0 });
  void service.list(platformGlobalScope, {}, { limit: 50, offset: 0 });

  const narrowedOrganization: AuditLogsDataScope = organizationScope;
  const narrowedPlatform: AuditLogsDataScope = platformGlobalScope;
  void narrowedOrganization;
  void narrowedPlatform;

  // @ts-expect-error - tenant scope is not legal for audit-event browsing
  const _tenantParam: ListScopeParam = tenantScope;
  void _tenantParam;

  // @ts-expect-error - narrowed audit viewer scope excludes tenant
  const _tenantAlias: AuditLogsDataScope = tenantScope;
  void _tenantAlias;

  // @ts-expect-error - callers must narrow the full DataScope union
  const _wideParam: ListScopeParam = wideScope;
  void _wideParam;

  // @ts-expect-error - null is never an authorization scope
  const _nullParam: ListScopeParam = null;
  void _nullParam;

  // @ts-expect-error - raw legacy tenant ids are not a scope
  void service.list('legacy-tenant-id', {}, { limit: 50, offset: 0 });
}

void _auditLogsDataScopeTypeContract;
