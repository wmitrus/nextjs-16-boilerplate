import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

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

export type AuditEventFilters = {
  category?: AuditCategory;
  outcome?: 'success' | 'failure' | 'denied';
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  occurredAfter?: Date;
  occurredBefore?: Date;
};

export type AuditEventPagination = {
  limit: number;
  offset: number;
};

function filterPredicates(filters: AuditEventFilters): SQL[] {
  const predicates: SQL[] = [];
  if (filters.category) {
    predicates.push(eq(auditEventsTable.category, filters.category));
  }
  if (filters.outcome) {
    predicates.push(eq(auditEventsTable.outcome, filters.outcome));
  }
  if (filters.actorUserId) {
    predicates.push(eq(auditEventsTable.actorUserId, filters.actorUserId));
  }
  if (filters.targetType) {
    predicates.push(eq(auditEventsTable.targetType, filters.targetType));
  }
  if (filters.targetId) {
    predicates.push(eq(auditEventsTable.targetId, filters.targetId));
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
