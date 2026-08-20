import {
  boolean,
  index,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { usersReferenceTable } from '@/core/db/schema/references';

import { AUDIT_CATEGORIES } from '../../domain/category';

/**
 * Adding a category here is a deliberate migration, not a runtime
 * free-for-all — keep in sync with `../../domain/category.ts`'s
 * `AUDIT_CATEGORIES` (the single source of truth for the taxonomy).
 */
export const auditCategoryEnum = pgEnum('audit_category', AUDIT_CATEGORIES);

/**
 * Admin-managed audit category settings. One row per (category, tenantId)
 * pair: `tenantId: null` is the global default, a tenant row is an
 * override — same global/tenant-override convention as `featureFlagsTable`
 * in `src/modules/feature-flags/infrastructure/drizzle/schema.ts`.
 *
 * A missing row for a given (category, tenantId) is not an error — it
 * means "use the hardcoded taxonomy default" (see
 * `../../domain/category.ts`'s `AUDIT_CATEGORY_DEFAULTS`). This table only
 * ever stores an *override* of that default.
 *
 * Phase 1 only: this is the settings table. The append-only `audit_events`
 * trail table is a later phase (see
 * `.copilot/tasks/2026-08-20-audit-logs-design-plan/plan.md` Part A.3/B.3).
 */
export const auditLogSettingsTable = pgTable(
  'audit_log_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    category: auditCategoryEnum('category').notNull(),
    tenantId: text('tenant_id'),
    enabled: boolean('enabled').notNull(),
    retentionDays: smallint('retention_days').notNull(),
    sampleRate: real('sample_rate'),
    captureInputOnSuccess: boolean('capture_input_on_success')
      .notNull()
      .default(false),
    // `set null`, not `cascade`: unlike most FKs in this repo, losing the
    // admin who last changed a setting must not delete the setting row
    // itself — the row (and the audit trail it governs) must outlive the
    // admin account.
    updatedByUserId: uuid('updated_by_user_id').references(
      () => usersReferenceTable.id,
      { onDelete: 'set null' },
    ),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_audit_log_settings_category_tenant')
      .on(t.category, t.tenantId)
      .nullsNotDistinct(),
    index('idx_audit_log_settings_category').on(t.category),
  ],
);
