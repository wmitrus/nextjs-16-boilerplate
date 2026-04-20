import { and, eq } from 'drizzle-orm';

import type {
  MembershipRepository,
  OrganizationId,
  SubjectId,
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

  async isMember(
    subjectId: SubjectId,
    organizationId: OrganizationId,
  ): Promise<boolean> {
    if (!isUuid(subjectId) || !isUuid(organizationId)) {
      return false;
    }

    const rows = await this.db
      .select()
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.userId, subjectId),
          eq(membershipsTable.organizationId, organizationId),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }
}
