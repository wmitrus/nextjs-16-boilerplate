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

import type { DrizzleDb } from '@/core/db';

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
 * viewer (`/admin/security/audit-logs`). Deliberately NOT DI-registered,
 * same rationale as `DrizzleAuditLogSettingsAdminService`: admin-only,
 * low-frequency, directly instantiated at the route-handler call site.
 *
 * `listForTenant` scopes strictly to `tenantId = callerTenantId` -- unlike
 * the settings global/override model, an audit trail has no "overlay"
 * semantic: a tenant-scoped viewer sees only their own tenant's events,
 * never `tenantId: null` (platform-level) rows and never another tenant's
 * rows (SEC-26).
 */
export class DrizzleAuditLogReadService {
  constructor(private readonly db: DrizzleDb) {}

  async listGlobal(
    filters: AuditEventFilters,
    pagination: AuditEventPagination,
  ): Promise<{ events: AuditEventDto[]; total: number }> {
    return this.query(filterPredicates(filters), pagination);
  }

  async listForTenant(
    tenantId: string,
    filters: AuditEventFilters,
    pagination: AuditEventPagination,
  ): Promise<{ events: AuditEventDto[]; total: number }> {
    const predicates = [
      eq(auditEventsTable.tenantId, tenantId),
      ...filterPredicates(filters),
    ];
    return this.query(predicates, pagination);
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
