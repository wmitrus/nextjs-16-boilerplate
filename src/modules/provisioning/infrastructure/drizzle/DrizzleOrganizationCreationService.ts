import { eq, sql } from 'drizzle-orm';

import { internalOrganizationIdFromOrgRow } from '@/core/contracts/canonical-ids.provenance';
import type { DrizzleDb } from '@/core/db';

import {
  TenantOrganizationLimitReachedError,
  TenantOrganizationQuotaNotConfiguredError,
} from '../../domain/errors';
import type {
  OrganizationCreationInput,
  OrganizationCreationResult,
  OrganizationCreationService,
} from '../../domain/OrganizationCreationService';

import { organizationsTable, tenantAttributesTable } from './schema';

export class DrizzleOrganizationCreationService implements OrganizationCreationService {
  constructor(private readonly db: DrizzleDb) {}

  async create(
    input: OrganizationCreationInput,
  ): Promise<OrganizationCreationResult> {
    return this.runInTransaction((tx) => this.createInTransaction(tx, input));
  }

  private async createInTransaction(
    db: DrizzleDb,
    input: OrganizationCreationInput,
  ): Promise<OrganizationCreationResult> {
    await db.execute(
      sql`
        SELECT tenant_id
        FROM tenant_attributes
        WHERE tenant_id = ${input.tenantId}
        FOR UPDATE
      `,
    );

    const quotaRows = await db
      .select({
        maxOrganizations: tenantAttributesTable.maxOrganizations,
      })
      .from(tenantAttributesTable)
      .where(eq(tenantAttributesTable.tenantId, input.tenantId))
      .limit(1);

    const quota = quotaRows[0]?.maxOrganizations;
    if (quota === undefined || quota < 1) {
      throw new TenantOrganizationQuotaNotConfiguredError();
    }

    const existingRows = await db
      .select({
        id: organizationsTable.id,
        tenantId: organizationsTable.tenantId,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, input.organizationId))
      .limit(1);

    const existing = existingRows[0];
    if (existing) {
      if (existing.tenantId !== input.tenantId) {
        throw new Error(
          '[provisioning] Organization ID is already bound to another tenant.',
        );
      }

      return {
        organizationId: internalOrganizationIdFromOrgRow(existing.id),
        createdNow: false,
      };
    }

    const countRows = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.tenantId, input.tenantId));

    const organizationCount = countRows[0]?.count ?? 0;
    if (organizationCount >= quota) {
      throw new TenantOrganizationLimitReachedError();
    }

    const insertedRows = await db
      .insert(organizationsTable)
      .values({
        id: input.organizationId,
        tenantId: input.tenantId,
        name: input.name,
        ...(input.slug === undefined ? {} : { slug: input.slug }),
      })
      .returning();

    const inserted = insertedRows[0];
    if (!inserted) {
      throw new Error('[provisioning] Organization insert returned no row.');
    }

    return {
      organizationId: internalOrganizationIdFromOrgRow(inserted.id),
      createdNow: true,
    };
  }

  private async runInTransaction<T>(
    fn: (tx: DrizzleDb) => Promise<T>,
  ): Promise<T> {
    return (
      this.db as unknown as {
        transaction: (fn: (tx: DrizzleDb) => Promise<T>) => Promise<T>;
      }
    ).transaction(fn);
  }
}
