import { and, eq } from 'drizzle-orm';

import type {
  MembershipRepository,
  SubjectId,
  TenantId,
} from '@/core/contracts/repositories';
import type { DrizzleDb } from '@/core/db';

import { membershipsTable } from './schema';

const UUID_GENERIC_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_GENERIC_REGEX.test(value);
}

export class DrizzleMembershipRepository implements MembershipRepository {
  constructor(private readonly db: DrizzleDb) {}

  async isMember(subjectId: SubjectId, tenantId: TenantId): Promise<boolean> {
    // External identity providers (e.g. Clerk) may emit non-UUID identifiers.
    // This repository is backed by UUID columns, so invalid identifiers cannot
    // be members of the persisted authorization graph.
    if (!isUuid(subjectId) || !isUuid(tenantId)) {
      return false;
    }

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
