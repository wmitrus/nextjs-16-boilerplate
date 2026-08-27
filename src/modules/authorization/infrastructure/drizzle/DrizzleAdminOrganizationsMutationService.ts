import { and, eq } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db/types';

import type { AdminOrganizationsScope } from '../../domain/AdminOrganizationsScope';
import { OrganizationNotFoundError } from '../../domain/errors';

import { organizationsTable } from './schema';

export type OrganizationStatus = 'active' | 'archived';

export type OrganizationStatusDto = {
  id: string;
  tenantId: string;
  name: string;
  slug: string | null;
  status: string;
  createdAt: string;
};

function mapOrganizationRow(row: {
  id: string;
  tenantId: string;
  name: string;
  slug: string | null;
  status: string;
  createdAt: Date;
}): OrganizationStatusDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleAdminOrganizationsMutationService {
  constructor(private readonly db: DrizzleDb) {}

  async updateOrganizationStatus(input: {
    scope: AdminOrganizationsScope;
    organizationId: string;
    status: OrganizationStatus;
  }): Promise<OrganizationStatusDto> {
    const scopeFilter = await this.resolveScopeFilter(input.scope);

    if (!scopeFilter) {
      throw new OrganizationNotFoundError();
    }

    const rows = await this.db
      .update(organizationsTable)
      .set({ status: input.status })
      .where(and(eq(organizationsTable.id, input.organizationId), scopeFilter))
      .returning();

    const row = rows[0];

    if (!row) {
      throw new OrganizationNotFoundError();
    }

    return mapOrganizationRow(row);
  }

  private async resolveScopeFilter(scope: AdminOrganizationsScope) {
    if (scope.kind === 'organization') {
      return eq(organizationsTable.id, scope.organizationId);
    }

    const rows = await this.db
      .select({ tenantId: organizationsTable.tenantId })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, scope.activeOrganizationId))
      .limit(1);

    const tenantId = rows[0]?.tenantId;
    return tenantId ? eq(organizationsTable.tenantId, tenantId) : null;
  }
}
