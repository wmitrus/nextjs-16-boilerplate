import { and, eq } from 'drizzle-orm';

import type {
  RoleId,
  RoleRepository,
  SubjectId,
  TenantId,
} from '@/core/contracts/repositories';
import type { DrizzleDb } from '@/core/db';

import { membershipsTable, rolesTable } from './schema';

export class DrizzleRoleRepository implements RoleRepository {
  constructor(private readonly db: DrizzleDb) {}

  async getRoles(subjectId: SubjectId, tenantId: TenantId): Promise<RoleId[]> {
    const rows = await this.db
      .select({ name: rolesTable.name })
      .from(membershipsTable)
      .innerJoin(rolesTable, eq(rolesTable.id, membershipsTable.roleId))
      .where(
        and(
          eq(membershipsTable.userId, subjectId),
          eq(membershipsTable.tenantId, tenantId),
        ),
      );

    return rows.map((row) => row.name);
  }
}
