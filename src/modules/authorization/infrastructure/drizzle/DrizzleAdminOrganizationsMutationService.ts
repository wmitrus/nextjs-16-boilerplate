import { and, eq } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db/types';

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
    activeOrganizationId: string;
    organizationId: string;
    status: OrganizationStatus;
  }): Promise<OrganizationStatusDto> {
    const tenantId = await this.resolveParentTenantId(
      input.activeOrganizationId,
    );

    if (!tenantId) {
      throw new OrganizationNotFoundError();
    }

    const rows = await this.db
      .update(organizationsTable)
      .set({ status: input.status })
      .where(
        and(
          eq(organizationsTable.id, input.organizationId),
          eq(organizationsTable.tenantId, tenantId),
        ),
      )
      .returning();

    const row = rows[0];

    if (!row) {
      throw new OrganizationNotFoundError();
    }

    return mapOrganizationRow(row);
  }

  private async resolveParentTenantId(
    organizationId: string,
  ): Promise<string | null> {
    const rows = await this.db
      .select({ tenantId: organizationsTable.tenantId })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId))
      .limit(1);

    return rows[0]?.tenantId ?? null;
  }
}
