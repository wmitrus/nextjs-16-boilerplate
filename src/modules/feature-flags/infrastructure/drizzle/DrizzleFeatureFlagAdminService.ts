import { and, eq, isNull } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db';

import {
  DuplicateFeatureFlagError,
  FeatureFlagNotFoundError,
} from '../../domain/errors';

import { featureFlagsTable } from './schema';

export type FeatureFlagDto = {
  id: string;
  key: string;
  tenantId: string | null;
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateFeatureFlagInput = {
  key: string;
  tenantId: string | null;
  enabled: boolean;
  description?: string | null;
};

export type UpdateFeatureFlagInput = {
  enabled?: boolean;
  description?: string | null;
};

function mapFlagRow(row: {
  id: string;
  key: string;
  tenantId: string | null;
  enabled: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FeatureFlagDto {
  return {
    id: row.id,
    key: row.key,
    tenantId: row.tenantId,
    enabled: row.enabled,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function tenantScopePredicate(tenantId: string | null) {
  return tenantId === null
    ? isNull(featureFlagsTable.tenantId)
    : eq(featureFlagsTable.tenantId, tenantId);
}

/**
 * Admin-only CRUD service for `feature_flags` rows.
 *
 * Deliberately NOT an implementation of `FeatureFlagService` (the runtime
 * evaluation contract) and NOT registered in the DI container. Admin CRUD
 * only makes sense against the `db` provider, is operator-only, low-frequency,
 * and directly instantiated at the route-handler call site -- mirrors
 * `DrizzleAdminOrganizationsMutationService`, not `UserRepository`. See
 * `.copilot/tasks/2026-08-20-admin-feature-flags-gui/01 - Architecture Guard - Summary.md`.
 */
export class DrizzleFeatureFlagAdminService {
  constructor(private readonly db: DrizzleDb) {}

  async listAll(): Promise<FeatureFlagDto[]> {
    const rows = await this.db
      .select()
      .from(featureFlagsTable)
      .orderBy(featureFlagsTable.key, featureFlagsTable.tenantId);

    return rows.map(mapFlagRow);
  }

  async create(input: CreateFeatureFlagInput): Promise<FeatureFlagDto> {
    const existing = await this.db
      .select({ id: featureFlagsTable.id })
      .from(featureFlagsTable)
      .where(
        and(
          eq(featureFlagsTable.key, input.key),
          tenantScopePredicate(input.tenantId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new DuplicateFeatureFlagError();
    }

    const [row] = await this.db
      .insert(featureFlagsTable)
      .values({
        key: input.key,
        tenantId: input.tenantId,
        enabled: input.enabled,
        description: input.description ?? null,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create feature flag');
    }

    return mapFlagRow(row);
  }

  async update(
    id: string,
    input: UpdateFeatureFlagInput,
  ): Promise<FeatureFlagDto> {
    const [row] = await this.db
      .update(featureFlagsTable)
      .set({
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(featureFlagsTable.id, id))
      .returning();

    if (!row) {
      throw new FeatureFlagNotFoundError();
    }

    return mapFlagRow(row);
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.db
      .delete(featureFlagsTable)
      .where(eq(featureFlagsTable.id, id))
      .returning();

    if (deleted.length === 0) {
      throw new FeatureFlagNotFoundError();
    }
  }
}
