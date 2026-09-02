import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizationsReferenceTable } from '@/core/db/schema/references';

/**
 * OZI-71 FF·A — canonical ownership discriminator for `feature_flags`.
 *
 * Additive only in FF·A: no runtime reader or writer consumes it yet.
 * `canonical_organization` — a resolved organization override (FF·B/FF·C set
 * this once authoritative internal-org evidence exists).
 * `intentional_global` — a genuine platform/global default (FF·C only).
 * `unresolved_legacy` — the fail-closed initial state for every pre-existing
 * row and every row created by the legacy writer that does not set the column;
 * excluded from all canonical evaluation, never read as global.
 * `quarantined` — a legacy row a controlled disposition set aside.
 *
 * See `.copilot/tasks/2026-09-01-ozi-71-tenant-organization-architecture/plan.md`
 * §14a.2 / §14a.8 / §14a.9.
 */
export const FEATURE_FLAG_OWNERSHIP_STATES = [
  'canonical_organization',
  'intentional_global',
  'unresolved_legacy',
  'quarantined',
] as const;

export type FeatureFlagOwnershipState =
  (typeof FEATURE_FLAG_OWNERSHIP_STATES)[number];

export const featureFlagsTable = pgTable(
  'feature_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    tenantId: text('tenant_id'),
    /**
     * OZI-71 FF·A — canonical organization ownership key. Nullable and
     * unpopulated in FF·A (FF·B owns canonical dual-write, FF·C the
     * evidence-based historical backfill). `ON DELETE CASCADE` because an
     * organization-scoped override is dead configuration once its organization
     * is deleted and must NOT become a global row via `SET NULL` (plan §14a.3).
     * `ON UPDATE NO ACTION` (drizzle default — organization ids are immutable).
     */
    organizationId: uuid('organization_id').references(
      () => organizationsReferenceTable.id,
      { onDelete: 'cascade' },
    ),
    /**
     * OZI-71 FF·A — persisted textual ownership discriminator. Fail-closed
     * default `unresolved_legacy` for pre-existing rows and any legacy-writer
     * row that omits it. The cross-column `CHECK` below also enforces the
     * four-value domain (any other value fails both branches).
     */
    ownershipState: text('ownership_state', {
      enum: FEATURE_FLAG_OWNERSHIP_STATES,
    })
      .notNull()
      .default('unresolved_legacy'),
    enabled: boolean('enabled').notNull().default(false),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /**
     * Legacy uniqueness. Remains authoritative through FF·A/FF·B/FF·C/FF·D;
     * dropped only at R4a-1 (plan §14a.8). Not modified by FF·A.
     */
    unique('uq_feature_flags_key_tenant')
      .on(t.key, t.tenantId)
      .nullsNotDistinct(),
    index('idx_feature_flags_key').on(t.key),
    /** OZI-71 FF·A — non-unique canonical lookup index. */
    index('idx_feature_flags_key_organization').on(t.key, t.organizationId),
    /**
     * OZI-71 FF·A — canonical scoped uniqueness: at most one
     * `canonical_organization` override per `(key, organization_id)`. Partial,
     * so it constrains only resolved canonical rows and never collides on the
     * NULL-`organization_id` legacy population. This is NOT the global semantic
     * unique (FF·D) and NOT the compact `NULLS NOT DISTINCT` canonical unique
     * (R4a-1).
     */
    uniqueIndex('uq_feature_flags_key_organization_canonical')
      .on(t.key, t.organizationId)
      .where(
        sql`${t.organizationId} is not null and ${t.ownershipState} = 'canonical_organization'`,
      ),
    /**
     * OZI-71 FF·A — DB-enforced `ownership_state` ↔ `organization_id`
     * consistency (defense in depth; plan §14a.9). Valid:
     * `canonical_organization` + non-NULL id, or one of the other three states
     * + NULL id. Also bounds the `ownership_state` domain. Not a licence to
     * weaken any later SQL containment rule.
     *
     * This is the desired end-state contract. The 0021 migration installs it
     * `NOT VALID` (enforced for every new/changed row immediately; the
     * historical back-scan deferred to `VALIDATE CONSTRAINT` at the later plan
     * gate after FF·C / the Quarantine Disposition Gate). drizzle-kit does not
     * encode that staged state, so 0021's SQL carries the `NOT VALID` by hand.
     */
    check(
      'ck_feature_flags_ownership_state_org',
      sql`(${t.ownershipState} = 'canonical_organization' and ${t.organizationId} is not null) or (${t.ownershipState} in ('intentional_global', 'unresolved_legacy', 'quarantined') and ${t.organizationId} is null)`,
    ),
  ],
);
