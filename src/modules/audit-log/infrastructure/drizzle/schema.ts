import {
  bigserial,
  boolean,
  index,
  jsonb,
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

/**
 * The append-only audit trail. Phase 2 only: a plain table, no native
 * Postgres partitioning yet (that is a hand-authored follow-up migration —
 * Drizzle has no first-class partition DDL — deferred to Phase 4 per
 * `.copilot/tasks/2026-08-20-audit-logs-design-plan/plan.md` Part A.4/B.3),
 * and no scheduled purge job yet either. Retention configured in
 * `auditLogSettingsTable` is not yet enforced by anything that deletes
 * rows -- this table grows unbounded until Phase 4 ships the purge job.
 *
 * `id` is a `bigserial`, not a `uuid`: cheaper index/storage for a
 * high-volume append-only log where no external caller needs to guess the
 * id ahead of time (unlike `auditLogSettingsTable`, which is a small,
 * admin-managed table where `uuid` matches the rest of the repo's
 * convention).
 *
 * `tenantId` is `text`, not `uuid`+FK, matching `featureFlagsTable` and
 * `auditLogSettingsTable` (not the internal `tenants`/`organizations`
 * tables): `RequestScopedTenantResolver` can populate `SecurityContext`'s
 * `tenantId` with a raw external provider org ID (e.g. a Clerk org id)
 * rather than an internal `tenants.id` UUID, depending on
 * `TENANT_CONTEXT_SOURCE` -- a `uuid` FK column would hard-fail on insert
 * for exactly that (common) configuration. No `organizationId` column yet
 * either, for the same reason: nothing in Phase 2 populates one, and
 * `RequestScopedTenantResolver` shows `organizationId` has the identical
 * internal-UUID-vs-external-provider-ID ambiguity -- add it once a real
 * caller (a later phase) settles which one it needs.
 *
 * `actorUserId` uses `onDelete: 'set null'`, not `cascade` like every
 * other FK in this repo's schemas: deleting a user must never delete the
 * history of what they did -- an audit trail is the opposite of a normal
 * owned-row relationship. (`actorUserId` is safe as a `uuid` FK to
 * `users.id`: `SecurityContext.user.id` is always the internal app user
 * id, never an external provider id.)
 */
export const auditEventsTable = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    category: auditCategoryEnum('category').notNull(),
    action: text('action').notNull(),
    outcome: text('outcome', {
      enum: ['success', 'failure', 'denied'],
    }).notNull(),
    tenantId: text('tenant_id'),
    actorUserId: uuid('actor_user_id').references(
      () => usersReferenceTable.id,
      { onDelete: 'set null' },
    ),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    correlationId: text('correlation_id'),
    requestId: text('request_id'),
    /** Caller-redacted, size-capped by the writer before insert. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_audit_events_tenant_occurred').on(t.tenantId, t.occurredAt),
    index('idx_audit_events_category_occurred').on(t.category, t.occurredAt),
    index('idx_audit_events_actor_occurred').on(t.actorUserId, t.occurredAt),
    index('idx_audit_events_target').on(t.targetType, t.targetId),
  ],
);
