import { and, eq } from 'drizzle-orm';

import type {
  MembershipRepository,
  SubjectId,
  TenantId,
} from '@/core/contracts/repositories';
import type { DrizzleDb } from '@/core/db';

import { membershipsTable } from './schema';

export class DrizzleMembershipRepository implements MembershipRepository {
  constructor(private readonly db: DrizzleDb) {}

  async isMember(subjectId: SubjectId, tenantId: TenantId): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.userId, subjectId),
          eq(membershipsTable.tenantId, tenantId),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }
}
