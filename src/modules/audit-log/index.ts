export {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_DEFAULTS,
  AUDIT_RETENTION_DAYS_MAX,
  AUDIT_RETENTION_DAYS_MIN,
  AUDIT_SAMPLE_RATE_MAX,
  AUDIT_SAMPLE_RATE_MIN,
  type AuditCategory,
  type AuditCategoryDefault,
  getAuditCategoryDefault,
  isAuditCategory,
} from './domain/category';

// `DrizzleAuditLogSettingsAdminService` is deliberately not re-exported here
// — like `DrizzleFeatureFlagAdminService`, it is admin-only, not
// DI-registered, and imported by its full infrastructure path directly at
// the route-handler call site (see
// `src/app/api/admin/audit-log-settings/route.ts`).
