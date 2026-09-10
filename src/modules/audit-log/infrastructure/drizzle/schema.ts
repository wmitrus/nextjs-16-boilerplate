import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  organizationsReferenceTable,
  usersReferenceTable,
} from '@/core/db/schema/references';

import { AUDIT_CATEGORIES } from '../../domain/category';

/**
 * Adding a category here is a deliberate migration, not a runtime
 * free-for-all — keep in sync with `../../domain/category.ts`'s
 * `AUDIT_CATEGORIES` (the single source of truth for the taxonomy).
 */
export const auditCategoryEnum = pgEnum('audit_category', AUDIT_CATEGORIES);

/**
 * OZI-71 AUD·A — canonical ownership discriminator for `audit_log_settings`.
 *
 * Additive only in AUD·A: no runtime reader or writer consumes it yet
 * (AUD·B owns canonical dual-write, AUD·C the evidence-based historical
 * backfill, AUD·D the cutover). Same four-value shape as
 * `feature_flags.ownership_state` (`FEATURE_FLAG_OWNERSHIP_STATES`).
 *
 * `canonical_organization` — a resolved organization override.
 * `intentional_global` — a genuine platform/global default.
 * `unresolved_legacy` — the fail-closed initial state for every pre-existing
 * row and every legacy-writer row that omits the column; excluded from all
 * canonical evaluation, never read as global.
 * `quarantined` — a legacy row a controlled disposition set aside.
 *
 * See `.copilot/tasks/2026-09-01-ozi-71-tenant-organization-architecture/plan.md`
 * §14a.2 / §14a.8 / §14a.9.
 */
export const AUDIT_LOG_SETTINGS_OWNERSHIP_STATES = [
  'canonical_organization',
  'intentional_global',
  'unresolved_legacy',
  'quarantined',
] as const;

export type AuditLogSettingsOwnershipState =
  (typeof AUDIT_LOG_SETTINGS_OWNERSHIP_STATES)[number];

/**
 * OZI-71 AUD·A — canonical ownership discriminator for `audit_events`.
 *
 * Additive only in AUD·A. The append-only trail carries ONE extra state over
 * the settings table: `organization_owned_orphaned`, the label lazy
 * reconciliation applies once an organization-owned historical event has had
 * its `organization_id` `SET NULL` by the FK (`audit_events` keeps history,
 * it never `CASCADE`-deletes it — plan §14a.3). An organization-owned event
 * must NEVER be relabelled `intentional_global` merely because its FK was
 * `SET NULL` (plan §14a.2).
 *
 * See `.copilot/tasks/2026-09-01-ozi-71-tenant-organization-architecture/plan.md`
 * §14a.2 / §14a.3 / §14a.9 / §14a.12.
 */
export const AUDIT_EVENTS_OWNERSHIP_STATES = [
  'canonical_organization',
  'organization_owned_orphaned',
  'intentional_global',
  'unresolved_legacy',
  'quarantined',
] as const;

export type AuditEventsOwnershipState =
  (typeof AUDIT_EVENTS_OWNERSHIP_STATES)[number];

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
    /**
     * OZI-71 AUD·A — canonical organization ownership key. Nullable and
     * unpopulated in AUD·A (AUD·B owns canonical dual-write, AUD·C the
     * evidence-based historical backfill). `ON DELETE CASCADE` because a
     * deleted organization's category override is dead configuration —
     * effective resolution then falls back to the global DB row, else the
     * taxonomy default; `SET NULL` would instead promote the override to a
     * global setting and collide with the global row (plan §14a.3).
     * `ON UPDATE NO ACTION` (drizzle default — organization ids are
     * immutable, invariant #10).
     *
     * The FK is installed `NOT VALID` by the AUD·A expand migration (`0023`)
     * and `VALIDATE`d by the post-migrate step
     * (`src/core/db/post-migrate-steps.ts`), which runs AFTER that migration's
     * transaction has committed — drizzle wraps every pending migration in
     * one transaction, so a `VALIDATE CONSTRAINT` in a separate `.sql` file
     * would still share it and hold the `ADD CONSTRAINT` lock for the whole
     * scan (plan §16 AUD·A "Foreign-key rollout"). drizzle-kit does not encode
     * that staged state — `0023`'s SQL carries `NOT VALID` by hand.
     */
    organizationId: uuid('organization_id').references(
      () => organizationsReferenceTable.id,
      { onDelete: 'cascade' },
    ),
    /**
     * OZI-71 AUD·A — persisted textual ownership discriminator. Fail-closed
     * constant default `unresolved_legacy` for every pre-existing row (PG 11+
     * applies a constant column default as a metadata-only change — §14a.9
     * Strategy 1) and any legacy-writer row that omits it. The cross-column
     * `CHECK` below also bounds the four-value domain.
     */
    ownershipState: text('ownership_state', {
      enum: AUDIT_LOG_SETTINGS_OWNERSHIP_STATES,
    })
      .notNull()
      .default('unresolved_legacy'),
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
    /**
     * Legacy uniqueness. Remains authoritative through AUD·A/AUD·B/AUD·C/AUD·D;
     * the upsert conflict target stays `(category, tenant_id)` until AUD·D
     * (plan §14a.8). Not modified by AUD·A.
     */
    unique('uq_audit_log_settings_category_tenant')
      .on(t.category, t.tenantId)
      .nullsNotDistinct(),
    index('idx_audit_log_settings_category').on(t.category),
    /** OZI-71 AUD·A — non-unique canonical lookup index. */
    index('idx_audit_log_settings_category_organization').on(
      t.category,
      t.organizationId,
    ),
    /**
     * OZI-71 AUD·A — canonical scoped uniqueness: at most one
     * `canonical_organization` override per `(category, organization_id)`.
     * Partial, so it constrains only resolved canonical rows and never
     * collides on the NULL-`organization_id` legacy population. This is NOT
     * the global semantic unique (AUD·D) and NOT the compact
     * `NULLS NOT DISTINCT` canonical unique (R4a-1).
     */
    uniqueIndex('uq_audit_log_settings_category_organization_canonical')
      .on(t.category, t.organizationId)
      .where(
        sql`${t.organizationId} is not null and ${t.ownershipState} = 'canonical_organization'`,
      ),
    /**
     * OZI-71 AUD·A — DB-enforced `ownership_state` ↔ `organization_id`
     * consistency (defense in depth; plan §14a.9). Valid:
     * `canonical_organization` + non-NULL id, or one of the other three
     * states + NULL id. Also bounds the `ownership_state` domain. Not a
     * licence to weaken any later SQL containment rule.
     *
     * The AUD·A expand migration installs this `NOT VALID` (enforced for
     * every new/changed row immediately; the historical back-scan deferred
     * to `VALIDATE CONSTRAINT` at the later plan gate after AUD·C / the
     * Quarantine Disposition Gate). drizzle-kit does not encode that staged
     * state — the generated SQL carries `NOT VALID` by hand. AUD·A does NOT
     * validate it.
     */
    check(
      'ck_audit_log_settings_ownership_state_org',
      sql`(${t.ownershipState} = 'canonical_organization' and ${t.organizationId} is not null) or (${t.ownershipState} in ('intentional_global', 'unresolved_legacy', 'quarantined') and ${t.organizationId} is null)`,
    ),
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
 * for exactly that (common) configuration. It stays untouched through
 * AUD·A: the canonical ownership key is the additive `organizationId`
 * column below, never a reinterpretation of `tenantId` (plan §3.6 / §14a.1).
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
    /**
     * OZI-71 AUD·A — canonical organization ownership key. Nullable and
     * unpopulated in AUD·A. `ON DELETE SET NULL` (NOT `CASCADE`): an
     * append-only historical event must survive organization deletion — the
     * row then becomes `organization_owned_orphaned` via lazy reconciliation
     * (a later slice), never `intentional_global` (plan §14a.2 / §14a.3).
     * `ON UPDATE NO ACTION` (drizzle default — organization ids are
     * immutable, invariant #10).
     *
     * The FK is installed `NOT VALID` by the AUD·A expand migration (`0023`)
     * and `VALIDATE`d by the post-migrate step
     * (`src/core/db/post-migrate-steps.ts`), which runs AFTER that migration's
     * transaction commits (plan §16 AUD·A "Foreign-key rollout"). drizzle-kit
     * does not encode that staged state — `0023`'s SQL carries `NOT VALID` by
     * hand.
     */
    organizationId: uuid('organization_id').references(
      () => organizationsReferenceTable.id,
      { onDelete: 'set null' },
    ),
    /**
     * OZI-71 AUD·A — persisted textual ownership discriminator. Fail-closed
     * constant default `unresolved_legacy` for every pre-existing row
     * (§14a.9 Strategy 1 — constant default is metadata-only on PG 11+, no
     * table rewrite on this high-volume table) and any legacy-writer row
     * that omits it. NEVER `intentional_global` by default (plan §14a.9 —
     * that would silently grant global ownership/retention to historical
     * rows, invariant #12).
     */
    ownershipState: text('ownership_state', {
      enum: AUDIT_EVENTS_OWNERSHIP_STATES,
    })
      .notNull()
      .default('unresolved_legacy'),
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
    /**
     * OZI-71 AUD·A — canonical organization lookup index. Declared here so
     * the schema / drizzle snapshot know the desired end state, but it is
     * created ONLY by the AUD·A post-migrate step
     * (`src/core/db/post-migrate-steps.ts`) — never by a journaled `.sql`
     * migration. A plain `CREATE INDEX` holds a `SHARE` lock that blocks
     * writes (not reads) for the whole build of a large production
     * `audit_events`; `CREATE INDEX CONCURRENTLY` avoids that but cannot run
     * inside a transaction, and drizzle wraps every migration in one. The
     * post-migrate step builds it CONCURRENTLY on a fresh connection after
     * the expand migration commits (plain `CREATE INDEX` for PGlite, which is
     * single-connection). Idempotent; fails closed on an INVALID or
     * wrong-definition same-name index (plan §16 AUD·A "Production index
     * safety"). On Production this step is not automatic: it runs behind the
     * operator gate `pnpm db:aud-a:converge --apply --production-approved`
     * (`scripts/db-aud-a-converge.ts`); Preview / CI / local run it
     * automatically via `run-migrations.ts`.
     */
    index('idx_audit_events_organization_occurred').on(
      t.organizationId,
      t.occurredAt,
    ),
    // Trigram GIN indexes back the admin audit-log "contains" filter
    // (OZI-54): a plain btree on these columns only helps an exact match or
    // a leading-wildcard `ILIKE 'x%'` prefix search -- a real `ILIKE '%x%'`
    // contains query degrades to a full scan without one. Requires the
    // pg_trgm extension (see the 0020 migration and
    // src/core/db/drivers/create-pglite.ts for local/PGlite registration).
    // actorUserId is a native uuid column; pg_trgm/gin_trgm_ops only apply
    // to text, hence the cast in the index expression.
    index('idx_audit_events_target_type_trgm').using(
      'gin',
      sql`${t.targetType} gin_trgm_ops`,
    ),
    index('idx_audit_events_target_id_trgm').using(
      'gin',
      sql`${t.targetId} gin_trgm_ops`,
    ),
    index('idx_audit_events_actor_user_id_trgm').using(
      'gin',
      sql`(${t.actorUserId}::text) gin_trgm_ops`,
    ),
    /**
     * OZI-71 AUD·A — DB-enforced `ownership_state` ↔ `organization_id`
     * consistency (defense in depth; plan §14a.9). The `audit_events` shape
     * differs from `feature_flags` / `audit_log_settings`:
     * `canonical_organization` MAY carry `organization_id` non-NULL OR
     * transiently NULL (the FK `ON DELETE SET NULL` must stay legal until
     * lazy reconciliation relabels the row `organization_owned_orphaned`);
     * every other state REQUIRES `organization_id IS NULL`.
     *
     * Installed `NOT VALID` by the AUD·A expand migration and NOT validated
     * in AUD·A (historical back-scan deferred to `VALIDATE CONSTRAINT` after
     * AUD·C). drizzle-kit does not encode that — the generated SQL carries
     * `NOT VALID` by hand.
     */
    check(
      'ck_audit_events_ownership_state_org',
      sql`(${t.ownershipState} = 'canonical_organization') or (${t.ownershipState} in ('organization_owned_orphaned', 'intentional_global', 'unresolved_legacy', 'quarantined') and ${t.organizationId} is null)`,
    ),
  ],
);
