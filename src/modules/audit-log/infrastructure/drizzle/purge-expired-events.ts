import { and, eq, inArray, isNull, lt } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db';

import { isAuditCategory, type AuditCategory } from '../../domain/category';

import { resolveEffectiveAuditSetting } from './effective-settings';
import { auditEventsTable } from './schema';

/**
 * Rows deleted per DELETE statement when purging. Kept small and looped
 * rather than one unbounded `DELETE ... WHERE occurred_at < cutoff` -- a
 * single giant delete on a high-volume append-only table would hold row
 * locks for too long and risks stalling concurrent writers. See plan A.4
 * item 6. Exposed as a parameter (not just a module constant) so tests can
 * exercise the batching loop without inserting thousands of rows.
 */
export const DEFAULT_PURGE_BATCH_SIZE = 500;

export type CategoryTenantPair = {
  category: AuditCategory;
  tenantId: string | null;
};

export type PurgePairResult = {
  pair: CategoryTenantPair;
  retentionDays: number;
  deleted: number;
};

export type PurgeOptions = {
  dryRun: boolean;
  now?: Date;
  batchSize?: number;
};

/**
 * Distinct (category, tenantId) pairs actually present in `audit_events`.
 * Iterating only the pairs that have rows (not the full taxonomy x every
 * tenant ever seen) keeps this cheap even as the tenant count grows.
 */
export async function listPresentCategoryTenantPairs(
  db: DrizzleDb,
): Promise<CategoryTenantPair[]> {
  const rows = await db
    .selectDistinct({
      category: auditEventsTable.category,
      tenantId: auditEventsTable.tenantId,
    })
    .from(auditEventsTable);

  const pairs: CategoryTenantPair[] = [];
  for (const row of rows) {
    if (!isAuditCategory(row.category)) continue;
    pairs.push({ category: row.category, tenantId: row.tenantId });
  }
  return pairs;
}

/**
 * Deletes rows older than `cutoff` for a single (category, tenantId) pair,
 * one `batchSize` batch at a time, until nothing older than the cutoff
 * remains. Returns the total number of rows deleted (or, in dry-run mode,
 * that would have been deleted) for this pair.
 */
async function purgePair(
  db: DrizzleDb,
  pair: CategoryTenantPair,
  cutoff: Date,
  dryRun: boolean,
  batchSize: number,
): Promise<number> {
  const scopePredicate =
    pair.tenantId === null
      ? isNull(auditEventsTable.tenantId)
      : eq(auditEventsTable.tenantId, pair.tenantId);

  let totalDeleted = 0;

  for (;;) {
    const batch = await db
      .select({ id: auditEventsTable.id })
      .from(auditEventsTable)
      .where(
        and(
          eq(auditEventsTable.category, pair.category),
          scopePredicate,
          lt(auditEventsTable.occurredAt, cutoff),
        ),
      )
      .limit(batchSize);

    if (batch.length === 0) break;

    if (!dryRun) {
      await db.delete(auditEventsTable).where(
        inArray(
          auditEventsTable.id,
          batch.map((row) => row.id),
        ),
      );
    }

    totalDeleted += batch.length;

    // In dry-run mode nothing was actually deleted, so re-selecting the
    // same predicate would loop forever; a batch that filled up to
    // batchSize just means "there may be more", which the reported count
    // already communicates without needing to enumerate every row.
    if (dryRun || batch.length < batchSize) break;
  }

  return totalDeleted;
}

/**
 * Deletes every `audit_events` row older than its currently-effective
 * per-(category, tenantId) retention -- reuses `resolveEffectiveAuditSetting`
 * so the purge job and the write path (`DrizzleAuditLogService`) can never
 * drift apart on what "expired" means. Used by both
 * `scripts/audit-log/purge-expired.ts` (the CLI/CI entry point) and its
 * real-DB test suite.
 */
export async function purgeExpiredAuditEvents(
  db: DrizzleDb,
  options: PurgeOptions = { dryRun: false },
): Promise<PurgePairResult[]> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? DEFAULT_PURGE_BATCH_SIZE;
  const pairs = await listPresentCategoryTenantPairs(db);
  const results: PurgePairResult[] = [];

  for (const pair of pairs) {
    const setting = await resolveEffectiveAuditSetting(
      db,
      pair.category,
      pair.tenantId,
    );
    const cutoff = new Date(
      now.getTime() - setting.retentionDays * 24 * 60 * 60 * 1000,
    );
    const deleted = await purgePair(
      db,
      pair,
      cutoff,
      options.dryRun,
      batchSize,
    );
    results.push({ pair, retentionDays: setting.retentionDays, deleted });
  }

  return results;
}
