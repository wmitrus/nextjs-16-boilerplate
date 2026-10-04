import type { DataScope } from '@/core/contracts/access-context';
import type { DrizzleDb } from '@/core/db/types';

import {
  DrizzleAuditLogSettingsAdminService,
  type AuditLogSettingsAdminScope,
} from './DrizzleAuditLogSettingsAdminService';

type ListScope = Parameters<DrizzleAuditLogSettingsAdminService['list']>[0];

function _auditSettingsScopeContract(
  db: DrizzleDb,
  organization: Extract<DataScope, { kind: 'organization' }>,
  tenant: Extract<DataScope, { kind: 'tenant' }>,
  platform: Extract<DataScope, { kind: 'platform-global' }>,
  wide: DataScope,
): void {
  const service = new DrizzleAuditLogSettingsAdminService(db);

  void service.list(organization);
  void service.list(platform);

  const orgAlias: AuditLogSettingsAdminScope = organization;
  const globalAlias: AuditLogSettingsAdminScope = platform;
  void orgAlias;
  void globalAlias;

  // @ts-expect-error - tenant scope is forbidden
  const _tenant: ListScope = tenant;
  void _tenant;

  // @ts-expect-error - narrowed scope excludes tenant
  const _tenantAlias: AuditLogSettingsAdminScope = tenant;
  void _tenantAlias;

  // @ts-expect-error - callers must narrow DataScope
  const _wide: ListScope = wide;
  void _wide;

  // @ts-expect-error - raw legacy tenant ids are not scope
  void service.list('legacy-tenant-id');

  // @ts-expect-error - null is not scope
  void service.list(null);
}

void _auditSettingsScopeContract;
