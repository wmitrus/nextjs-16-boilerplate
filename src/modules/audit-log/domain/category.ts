/**
 * The curated, admin-toggleable audit category taxonomy.
 *
 * Categories are deliberately coarse (one switch per functional area, not
 * per literal action name) so the admin toggle screen stays a short,
 * legible table while still letting noisy/low-value categories be turned
 * off or retained briefly to bound DB growth. Adding a category is a
 * deliberate migration (see `auditCategoryEnum` in `../infrastructure/drizzle/schema.ts`),
 * not a runtime free-for-all — this file is the single source of truth for
 * the taxonomy and its defaults.
 *
 * See `.copilot/tasks/2026-08-20-audit-logs-design-plan/plan.md` Part A.2.
 */

export const AUDIT_CATEGORIES = [
  'auth',
  'admin_access',
  'organization',
  'membership',
  'rbac_policy',
  'feature_flag',
  'waitlist',
  'billing',
  'security_event',
  'server_action',
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export function isAuditCategory(value: string): value is AuditCategory {
  return (AUDIT_CATEGORIES as readonly string[]).includes(value);
}

/** Server-enforced retention bounds — no admin can set unbounded retention. */
export const AUDIT_RETENTION_DAYS_MIN = 7;
export const AUDIT_RETENTION_DAYS_MAX = 730;

/** Sample rate is a fraction of events captured: 1 = all, 0 = none. */
export const AUDIT_SAMPLE_RATE_MIN = 0;
export const AUDIT_SAMPLE_RATE_MAX = 1;

export interface AuditCategoryDefault {
  readonly label: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly retentionDays: number;
  /** `null` means "capture every event" (no sampling). */
  readonly sampleRate: number | null;
  readonly captureInputOnSuccess: boolean;
}

/**
 * Taxonomy defaults, applied whenever no `audit_log_settings` row exists yet
 * for a (category, tenant) pair. These are intentionally conservative on
 * DB space: low-value categories default off or short-retention, and no
 * category captures full input on a successful event unless explicitly
 * opted in by an admin.
 */
export const AUDIT_CATEGORY_DEFAULTS: Record<
  AuditCategory,
  AuditCategoryDefault
> = {
  auth: {
    label: 'Authentication',
    description:
      'Sign-in, sign-up, password reset, session revocation, MFA changes.',
    enabled: true,
    retentionDays: 180,
    sampleRate: null,
    captureInputOnSuccess: false,
  },
  admin_access: {
    label: 'Admin panel access',
    description: 'Admin panel access grants and denials.',
    enabled: true,
    retentionDays: 180,
    sampleRate: null,
    captureInputOnSuccess: false,
  },
  organization: {
    label: 'Organizations',
    description: 'Organization create, update, and status changes.',
    enabled: true,
    retentionDays: 365,
    sampleRate: null,
    captureInputOnSuccess: false,
  },
  membership: {
    label: 'Memberships',
    description: 'Invitations, acceptances, revocations, role changes.',
    enabled: true,
    retentionDays: 365,
    sampleRate: null,
    captureInputOnSuccess: false,
  },
  rbac_policy: {
    label: 'RBAC & policies',
    description: 'Role and policy create, update, and delete.',
    enabled: true,
    retentionDays: 365,
    sampleRate: null,
    captureInputOnSuccess: false,
  },
  feature_flag: {
    label: 'Feature flags',
    description: 'Feature flag create, update, and delete.',
    enabled: true,
    retentionDays: 90,
    sampleRate: null,
    captureInputOnSuccess: false,
  },
  waitlist: {
    label: 'Waitlist',
    description: 'Waitlist entry approvals and rejections.',
    enabled: false,
    retentionDays: 30,
    sampleRate: null,
    captureInputOnSuccess: false,
  },
  billing: {
    label: 'Billing',
    description: 'Plan and subscription changes.',
    enabled: true,
    retentionDays: 365,
    sampleRate: null,
    captureInputOnSuccess: false,
  },
  security_event: {
    label: 'Security events',
    description:
      'High-severity events: SSRF attempts, tenant violations, rate-limit trips. Never sampled.',
    enabled: true,
    retentionDays: 365,
    sampleRate: null,
    captureInputOnSuccess: false,
  },
  server_action: {
    label: 'Server actions (generic)',
    description:
      'Catch-all for createSecureAction mutations not covered by a more specific category.',
    enabled: true,
    retentionDays: 30,
    sampleRate: null,
    captureInputOnSuccess: false,
  },
};

export function getAuditCategoryDefault(
  category: AuditCategory,
): AuditCategoryDefault {
  return AUDIT_CATEGORY_DEFAULTS[category];
}
