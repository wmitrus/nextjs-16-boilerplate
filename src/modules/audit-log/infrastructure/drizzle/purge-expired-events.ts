import {
  and,
  count,
  eq,
  inArray,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  internalOrganizationIdFromOrgRow,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';
import type { DrizzleDb } from '@/core/db';
import { organizationsReferenceTable } from '@/core/db/schema/references';

import { isAuditCategory, type AuditCategory } from '../../domain/category';

import {
  resolveCanonicalEffectiveAuditSetting,
  resolveLegacyAuditRetentionCompat,
} from './effective-settings';
import { auditEventsTable, type AuditEventsOwnershipState } from './schema';

export const DEFAULT_PURGE_BATCH_SIZE = 500;

type NullOwnedRetentionState =
  | 'canonical_organization'
  | 'organization_owned_orphaned'
  | 'intentional_global';

type LegacyRetentionState = 'unresolved_legacy' | 'quarantined';

/**
 * OZI-71 AUD·D discriminated retention key.
 *
 * Every member that determines a cutoff is also rebound by COUNT / DELETE.
 * In particular, NULL organization_id does not collapse unrelated ownership
 * states or legacy tenant keys into one retention group.
 */
export type AuditRetentionKey =
  | {
      kind: 'canonical-organization';
      category: AuditCategory;
      organizationId: string;
      ownershipState: 'canonical_organization';
    }
  | {
      kind: 'null-owned';
      category: AuditCategory;
      ownershipState: NullOwnedRetentionState;
    }
  | {
      kind: 'legacy';
      category: AuditCategory;
      legacyTenantId: string | null;
      ownershipState: LegacyRetentionState;
    };

export type PurgeRetentionResult = {
  key: AuditRetentionKey;
  retentionDays: number;
  deleted: number;
};

export type PurgeOptions = {
  dryRun: boolean;
  now?: Date;
  batchSize?: number;
};

export class AuditPurgeOwnershipInvariantError extends Error {
  readonly code = 'AUDIT_PURGE_OWNERSHIP_INVARIANT';

  constructor(message = 'Audit purge ownership invariant violated') {
    super(message);
    this.name = 'AuditPurgeOwnershipInvariantError';
  }
}

type PresentAuditOwnershipRow = {
  category: string;
  tenantId: string | null;
  organizationId: string | null;
  ownershipState: AuditEventsOwnershipState;
};

function assertNullOrganizationId(row: PresentAuditOwnershipRow): void {
  if (row.organizationId !== null) {
    throw new AuditPurgeOwnershipInvariantError(
      `${row.ownershipState} audit event unexpectedly has organization_id`,
    );
  }
}

function toRetentionKey(
  row: PresentAuditOwnershipRow,
): AuditRetentionKey | null {
  if (!isAuditCategory(row.category)) return null;

  const state = row.ownershipState;

  switch (state) {
    case 'canonical_organization':
      if (row.organizationId !== null) {
        return {
          kind: 'canonical-organization',
          category: row.category,
          organizationId: row.organizationId,
          ownershipState: 'canonical_organization',
        };
      }

      return {
        kind: 'null-owned',
        category: row.category,
        ownershipState: 'canonical_organization',
      };

    case 'organization_owned_orphaned':
    case 'intentional_global':
      assertNullOrganizationId(row);

      return {
        kind: 'null-owned',
        category: row.category,
        ownershipState: state,
      };

    case 'unresolved_legacy':
    case 'quarantined':
      assertNullOrganizationId(row);

      return {
        kind: 'legacy',
        category: row.category,
        legacyTenantId: row.tenantId,
        ownershipState: state,
      };
  }
}

function retentionKeyIdentity(key: AuditRetentionKey): string {
  switch (key.kind) {
    case 'canonical-organization':
      return JSON.stringify([
        key.kind,
        key.category,
        key.organizationId,
        key.ownershipState,
      ]);

    case 'null-owned':
      return JSON.stringify([key.kind, key.category, key.ownershipState]);

    case 'legacy':
      return JSON.stringify([
        key.kind,
        key.category,
        key.legacyTenantId,
        key.ownershipState,
      ]);
  }
}

/**
 * Lists only retention groups that are actually present in audit_events.
 *
 * The initial SELECT contains all ownership columns because historical
 * shadow tenant_id values can differ even when they are irrelevant to a
 * canonical key. The final Map deduplicates on the actual discriminated
 * retention identity.
 */
export async function listPresentAuditRetentionKeys(
  db: DrizzleDb,
): Promise<AuditRetentionKey[]> {
  const rows = await db
    .selectDistinct({
      category: auditEventsTable.category,
      tenantId: auditEventsTable.tenantId,
      organizationId: auditEventsTable.organizationId,
      ownershipState: auditEventsTable.ownershipState,
    })
    .from(auditEventsTable);

  const keys = new Map<string, AuditRetentionKey>();

  for (const row of rows) {
    const key = toRetentionKey(row);
    if (key === null) continue;

    keys.set(retentionKeyIdentity(key), key);
  }

  return [...keys.values()];
}

function retentionKeyPredicates(key: AuditRetentionKey): SQL[] {
  switch (key.kind) {
    case 'canonical-organization':
      return [
        eq(auditEventsTable.category, key.category),
        eq(auditEventsTable.ownershipState, 'canonical_organization'),
        eq(auditEventsTable.organizationId, key.organizationId),
      ];

    case 'null-owned':
      return [
        eq(auditEventsTable.category, key.category),
        eq(auditEventsTable.ownershipState, key.ownershipState),
        isNull(auditEventsTable.organizationId),
      ];

    case 'legacy':
      return [
        eq(auditEventsTable.category, key.category),
        eq(auditEventsTable.ownershipState, key.ownershipState),
        sql`${auditEventsTable.tenantId}
          IS NOT DISTINCT FROM ${key.legacyTenantId}`,
      ];
  }
}

function expiredPredicate(key: AuditRetentionKey, cutoff: Date): SQL {
  const predicate = and(
    ...retentionKeyPredicates(key),
    lt(auditEventsTable.occurredAt, cutoff),
  );

  if (predicate === undefined) {
    throw new AuditPurgeOwnershipInvariantError(
      'Could not construct audit purge predicate',
    );
  }

  return predicate;
}

async function resolveRetentionDaysForKey(
  db: DrizzleDb,
  key: AuditRetentionKey,
): Promise<number | null> {
  switch (key.kind) {
    case 'canonical-organization': {
      const [organization] = await db
        .select({
          id: organizationsReferenceTable.id,
          tenantId: organizationsReferenceTable.tenantId,
        })
        .from(organizationsReferenceTable)
        .where(eq(organizationsReferenceTable.id, key.organizationId))
        .limit(1);

      if (organization === undefined) {
        const [stillPresent] = await db
          .select({ id: auditEventsTable.id })
          .from(auditEventsTable)
          .where(and(...retentionKeyPredicates(key)))
          .limit(1);

        if (stillPresent === undefined) {
          // The key was enumerated before the Organization was deleted and
          // its events were reconciled to another ownership group. Do not
          // resolve the stale key through any fallback authority.
          return null;
        }

        throw new AuditPurgeOwnershipInvariantError(
          `Canonical audit event references missing organization ${key.organizationId}`,
        );
      }

      const setting = await resolveCanonicalEffectiveAuditSetting(
        db,
        key.category,
        {
          kind: 'organization',
          organizationId: internalOrganizationIdFromOrgRow(organization.id),
          tenantId: parentTenantIdFromOrgRow(organization.tenantId),
        },
      );

      if (setting === null) {
        throw new AuditPurgeOwnershipInvariantError(
          `Canonical audit retention scope failed for organization ${key.organizationId}`,
        );
      }

      return setting.retentionDays;
    }

    case 'null-owned': {
      const setting = await resolveCanonicalEffectiveAuditSetting(
        db,
        key.category,
        { kind: 'platform-global' },
      );

      if (setting === null) {
        throw new AuditPurgeOwnershipInvariantError(
          'Platform-global audit retention resolution returned no setting',
        );
      }

      return setting.retentionDays;
    }

    case 'legacy': {
      const setting = await resolveLegacyAuditRetentionCompat(
        db,
        key.category,
        key.legacyTenantId,
      );

      return setting.retentionDays;
    }
  }
}

/**
 * Deletes expired rows for exactly one discriminated retention key.
 *
 * The DELETE intentionally re-binds the same retention key and cutoff used
 * by the preceding SELECT. Deleting only by selected ids would usually be
 * sufficient, but rebinding protects the ownership boundary if a row is
 * reconciled between SELECT and DELETE.
 */
async function deleteExpiredForKey(
  db: DrizzleDb,
  key: AuditRetentionKey,
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  let totalDeleted = 0;

  for (;;) {
    const batch = await db
      .select({ id: auditEventsTable.id })
      .from(auditEventsTable)
      .where(expiredPredicate(key, cutoff))
      .limit(batchSize);

    if (batch.length === 0) break;

    const deleted = await db
      .delete(auditEventsTable)
      .where(
        and(
          inArray(
            auditEventsTable.id,
            batch.map((row) => row.id),
          ),
          expiredPredicate(key, cutoff),
        ),
      )
      .returning();

    totalDeleted += deleted.length;

    if (batch.length < batchSize) break;
  }

  return totalDeleted;
}

/**
 * Dry-run COUNT for exactly the same discriminated retention key used by
 * the real DELETE path.
 */
async function countExpiredForKey(
  db: DrizzleDb,
  key: AuditRetentionKey,
  cutoff: Date,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(auditEventsTable)
    .where(expiredPredicate(key, cutoff));

  return row?.total ?? 0;
}

/**
 * OZI-71 AUD·D canonical audit retention cutover.
 *
 * Retention resolution:
 * - canonical organization + live organization_id:
 *   canonical organization setting -> intentional-global -> taxonomy;
 * - canonical organization with NULL organization_id, orphaned organization,
 *   and intentional_global:
 *   intentional-global setting -> taxonomy;
 * - unresolved_legacy / quarantined:
 *   bounded resolveLegacyAuditRetentionCompat() path only.
 *
 * Each COUNT / DELETE re-binds the exact discriminated key that determined
 * its cutoff.
 */
export async function purgeExpiredAuditRetentionKeys(
  db: DrizzleDb,
  keys: AuditRetentionKey[],
  options: PurgeOptions = { dryRun: false },
): Promise<PurgeRetentionResult[]> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? DEFAULT_PURGE_BATCH_SIZE;
  const results: PurgeRetentionResult[] = [];

  for (const key of keys) {
    const retentionDays = await resolveRetentionDaysForKey(db, key);

    if (retentionDays === null) {
      continue;
    }

    const cutoff = new Date(
      now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
    );

    const deleted = options.dryRun
      ? await countExpiredForKey(db, key, cutoff)
      : await deleteExpiredForKey(db, key, cutoff, batchSize);

    results.push({
      key,
      retentionDays,
      deleted,
    });
  }

  return results;
}

export async function purgeExpiredAuditEvents(
  db: DrizzleDb,
  options: PurgeOptions = { dryRun: false },
): Promise<PurgeRetentionResult[]> {
  const keys = await listPresentAuditRetentionKeys(db);

  return purgeExpiredAuditRetentionKeys(db, keys, options);
}
