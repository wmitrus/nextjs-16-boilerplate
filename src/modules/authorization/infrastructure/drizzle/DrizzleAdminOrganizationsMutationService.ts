import { and, eq } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db/types';

import { OrganizationNotFoundError } from '../../domain/errors';

import {
  organizationsAdminScopeFilter,
  type OrganizationsAdminDataScope,
} from './DrizzleAdminOrganizationsReadService';
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
    scope: OrganizationsAdminDataScope;
    organizationId: string;
    status: OrganizationStatus;
  }): Promise<OrganizationStatusDto> {
    // Canonical scope AND requested id meet in the SAME statement — no
    // authorization pre-check followed by an unscoped write.
    const rows = await this.db
      .update(organizationsTable)
      .set({ status: input.status })
      .where(
        and(
          eq(organizationsTable.id, input.organizationId),
          organizationsAdminScopeFilter(input.scope),
        ),
      )
      .returning();

    const row = rows[0];

    if (!row) {
      throw new OrganizationNotFoundError();
    }

    return mapOrganizationRow(row);
  }
}
