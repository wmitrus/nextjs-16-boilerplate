import { and, eq } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db';

import type { InvitationRepository } from '../../domain/InvitationRepository';
import type { CreateInvitationData, Invitation } from '../../domain/types';

import { invitationsTable } from '@/modules/provisioning/infrastructure/drizzle/schema';

function rowToInvitation(
  row: typeof invitationsTable.$inferSelect,
): Invitation {
  return {
    id: row.id,
    organizationId: row.organizationId,
    invitedByUserId: row.invitedByUserId ?? null,
    email: row.email,
    roleId: row.roleId,
    token: row.token,
    status: row.status as Invitation['status'],
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt ?? null,
    createdAt: row.createdAt,
  };
}

export class DrizzleInvitationRepository implements InvitationRepository {
  constructor(private readonly db: DrizzleDb) {}

  async create(data: CreateInvitationData): Promise<Invitation> {
    const rows = await this.db
      .insert(invitationsTable)
      .values({
        organizationId: data.organizationId,
        invitedByUserId: data.invitedByUserId ?? undefined,
        email: data.email,
        roleId: data.roleId,
        token: data.token,
        expiresAt: data.expiresAt,
      })
      .returning();

    const row = rows[0];
    if (!row)
      throw new Error('[DrizzleInvitationRepository] Insert returned no rows');
    return rowToInvitation(row);
  }

  async findByToken(token: string): Promise<Invitation | null> {
    const rows = await this.db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.token, token))
      .limit(1);
    return rows[0] ? rowToInvitation(rows[0]) : null;
  }

  async findPendingByEmailAndOrg(
    email: string,
    organizationId: string,
  ): Promise<Invitation | null> {
    const rows = await this.db
      .select()
      .from(invitationsTable)
      .where(
        and(
          eq(invitationsTable.email, email),
          eq(invitationsTable.organizationId, organizationId),
          eq(invitationsTable.status, 'pending'),
        ),
      )
      .limit(1);
    return rows[0] ? rowToInvitation(rows[0]) : null;
  }

  async listByOrganization(organizationId: string): Promise<Invitation[]> {
    const rows = await this.db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.organizationId, organizationId));
    return rows.map(rowToInvitation);
  }

  async markAccepted(id: string, acceptedAt: Date): Promise<void> {
    await this.db
      .update(invitationsTable)
      .set({ status: 'accepted', acceptedAt })
      .where(eq(invitationsTable.id, id));
  }

  async markRevoked(id: string): Promise<void> {
    await this.db
      .update(invitationsTable)
      .set({ status: 'revoked' })
      .where(eq(invitationsTable.id, id));
  }

  async markExpired(id: string): Promise<void> {
    await this.db
      .update(invitationsTable)
      .set({ status: 'expired' })
      .where(eq(invitationsTable.id, id));
  }
}
