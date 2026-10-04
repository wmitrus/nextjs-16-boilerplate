import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';

import type { DataScope } from '@/core/contracts/access-context';
import type { DrizzleDb } from '@/core/db';
import { organizationsReferenceTable } from '@/core/db/schema/references';

import type { AuditCategory } from '../../domain/category';

import { auditEventsTable } from './schema';

export type AuditEventDto = {
  id: number;
  occurredAt: string;
  category: string;
  action: string;
  outcome: string;
  tenantId: string | null;
  actorUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  correlationId: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * How a free-text filter value is matched against its column (OZI-54).
 * `contains`/`startsWith` are `ILIKE`, backed by the trigram/btree-friendly
 * GIN indexes added alongside this type -- see `schema.ts`'s
 * `idx_audit_events_*_trgm` indexes and their doc comment.
 */
export type TextMatchOperator = 'exact' | 'startsWith' | 'contains';

export type AuditEventFilters = {
  category?: AuditCategory;
  outcome?: 'success' | 'failure' | 'denied';
  actorUserId?: string;
  actorUserIdOp?: TextMatchOperator;
  targetType?: string;
  targetTypeOp?: TextMatchOperator;
  targetId?: string;
  targetIdOp?: TextMatchOperator;
  occurredAfter?: Date;
  occurredBefore?: Date;
};

export type AuditEventPagination = {
  limit: number;
  offset: number;
};

export type AuditLogsDataScope = Extract<
  DataScope,
  { kind: 'organization' | 'platform-global' }
>;

/**
 * OZI-71 AUD·D canonical audit-event containment.
 *
 * Platform-global is an explicitly classified unrestricted viewer operation.
 * Organization scope binds BOTH canonical ids: the event's organization and
 * that organization's authoritative parent tenant.
 */
function auditEventScopePredicates(scope: AuditLogsDataScope): SQL[] {
  switch (scope.kind) {
    case 'platform-global':
      return [];

    case 'organization':
      return [
        eq(auditEventsTable.organizationId, scope.organizationId),
        sql`exists (
          select 1
          from ${organizationsReferenceTable}
          where ${organizationsReferenceTable.id} = ${auditEventsTable.organizationId}
            and ${organizationsReferenceTable.id} = ${scope.organizationId}
            and ${organizationsReferenceTable.tenantId} = ${scope.tenantId}
        )`,
      ];
  }
}

/**
 * Escapes ILIKE metacharacters in caller-supplied text so a literal `%`,
 * `_`, or `\` the user typed is matched literally rather than treated as
 * our own wildcard/escape syntax. Postgres's default ILIKE escape
 * character is `\`, which this relies on.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function likePattern(value: string, op: 'startsWith' | 'contains'): string {
  const escaped = escapeLikePattern(value);
  return op === 'startsWith' ? `${escaped}%` : `%${escaped}%`;
}

function filterPredicates(filters: AuditEventFilters): SQL[] {
  const predicates: SQL[] = [];
  if (filters.category) {
    predicates.push(eq(auditEventsTable.category, filters.category));
  }
  if (filters.outcome) {
    predicates.push(eq(auditEventsTable.outcome, filters.outcome));
  }
  if (filters.actorUserId) {
    const op = filters.actorUserIdOp ?? 'exact';
    predicates.push(
      op === 'exact'
        ? eq(auditEventsTable.actorUserId, filters.actorUserId)
        : // actorUserId is a native `uuid` column; ILIKE needs text, hence
          // the explicit cast (matches the migration's expression index).
          sql`(${auditEventsTable.actorUserId}::text) ILIKE ${likePattern(filters.actorUserId, op)}`,
    );
  }
  if (filters.targetType) {
    const op = filters.targetTypeOp ?? 'exact';
    predicates.push(
      op === 'exact'
        ? eq(auditEventsTable.targetType, filters.targetType)
        : ilike(
            auditEventsTable.targetType,
            likePattern(filters.targetType, op),
          ),
    );
  }
  if (filters.targetId) {
    const op = filters.targetIdOp ?? 'exact';
    predicates.push(
      op === 'exact'
        ? eq(auditEventsTable.targetId, filters.targetId)
        : ilike(auditEventsTable.targetId, likePattern(filters.targetId, op)),
    );
  }
  if (filters.occurredAfter) {
    predicates.push(gte(auditEventsTable.occurredAt, filters.occurredAfter));
  }
  if (filters.occurredBefore) {
    predicates.push(lte(auditEventsTable.occurredAt, filters.occurredBefore));
  }
  return predicates;
}

function mapEventRow(row: {
  id: number;
  occurredAt: Date;
  category: string;
  action: string;
  outcome: string;
  tenantId: string | null;
  actorUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  correlationId: string | null;
  requestId: string | null;
  metadata: unknown;
}): AuditEventDto {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    category: row.category,
    action: row.action,
    outcome: row.outcome,
    tenantId: row.tenantId,
    actorUserId: row.actorUserId,
    targetType: row.targetType,
    targetId: row.targetId,
    ip: row.ip,
    userAgent: row.userAgent,
    correlationId: row.correlationId,
    requestId: row.requestId,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

/**
 * Read-only browsing service for `audit_events` -- the admin-facing trail
 * viewer (`/admin/security/audit-logs`).
 *
 * OZI-71 AUD·D: the service boundary accepts only canonical
 * `organization | platform-global` DataScope. A raw legacy `tenant_id` is
 * never accepted as authorization input.
 *
 * Organization reads bind both members of the canonical tuple in SQL.
 * Platform-global is an explicitly classified unrestricted viewer operation.
 */
export class DrizzleAuditLogReadService {
  constructor(private readonly db: DrizzleDb) {}

  /**
   * AUD·D canonical viewer boundary.
   *
   * This becomes the sole public listing path once the route cutover removes
   * the transitional legacy methods below.
   */
  async list(
    scope: AuditLogsDataScope,
    filters: AuditEventFilters,
    pagination: AuditEventPagination,
  ): Promise<{ events: AuditEventDto[]; total: number }> {
    return this.query(
      [...auditEventScopePredicates(scope), ...filterPredicates(filters)],
      pagination,
    );
  }

  private async query(
    predicates: SQL[],
    pagination: AuditEventPagination,
  ): Promise<{ events: AuditEventDto[]; total: number }> {
    const where = predicates.length > 0 ? and(...predicates) : undefined;

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(auditEventsTable)
        .where(where)
        .orderBy(desc(auditEventsTable.occurredAt), desc(auditEventsTable.id))
        .limit(pagination.limit)
        .offset(pagination.offset),
      this.db.select({ total: count() }).from(auditEventsTable).where(where),
    ]);

    return {
      events: rows.map(mapEventRow),
      total: totalRows[0]?.total ?? 0,
    };
  }
}
