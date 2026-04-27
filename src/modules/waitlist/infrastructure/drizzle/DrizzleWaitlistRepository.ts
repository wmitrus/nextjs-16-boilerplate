import { eq } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db/types';

import { WaitlistEntryNotFoundError } from '../../domain/errors';
import type {
  CreateWaitlistEntryData,
  WaitlistEntry,
} from '../../domain/types';
import type { WaitlistRepository } from '../../domain/WaitlistRepository';

import { waitlistEntriesTable } from '@/modules/authorization/infrastructure/drizzle/schema';

type WaitlistRow = typeof waitlistEntriesTable.$inferSelect;

function rowToEntry(row: WaitlistRow): WaitlistEntry {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    organizationId: row.organizationId,
    status: row.status as WaitlistEntry['status'],
    approvedAt: row.approvedAt,
    notifiedAt: row.notifiedAt,
    createdAt: row.createdAt,
  };
}

export class DrizzleWaitlistRepository implements WaitlistRepository {
  constructor(private readonly db: DrizzleDb) {}

  async add(data: CreateWaitlistEntryData): Promise<WaitlistEntry> {
    const [row] = await this.db
      .insert(waitlistEntriesTable)
      .values({
        email: data.email,
        name: data.name ?? null,
        organizationId: data.organizationId ?? null,
        status: 'pending',
      })
      .returning();
    if (!row) throw new Error('Failed to insert waitlist entry');
    return rowToEntry(row);
  }

  async findByEmail(email: string): Promise<WaitlistEntry | null> {
    const [row] = await this.db
      .select()
      .from(waitlistEntriesTable)
      .where(eq(waitlistEntriesTable.email, email))
      .limit(1);
    return row ? rowToEntry(row) : null;
  }

  async findById(id: string): Promise<WaitlistEntry | null> {
    const [row] = await this.db
      .select()
      .from(waitlistEntriesTable)
      .where(eq(waitlistEntriesTable.id, id))
      .limit(1);
    return row ? rowToEntry(row) : null;
  }

  async listPending(): Promise<WaitlistEntry[]> {
    const rows = await this.db
      .select()
      .from(waitlistEntriesTable)
      .where(eq(waitlistEntriesTable.status, 'pending'));
    return rows.map(rowToEntry);
  }

  async approve(
    id: string,
    approvedAt: Date = new Date(),
  ): Promise<WaitlistEntry> {
    const [row] = await this.db
      .update(waitlistEntriesTable)
      .set({ status: 'approved', approvedAt })
      .where(eq(waitlistEntriesTable.id, id))
      .returning();
    if (!row) throw new WaitlistEntryNotFoundError();
    return rowToEntry(row);
  }

  async reject(id: string): Promise<WaitlistEntry> {
    const [row] = await this.db
      .update(waitlistEntriesTable)
      .set({ status: 'rejected' })
      .where(eq(waitlistEntriesTable.id, id))
      .returning();
    if (!row) throw new WaitlistEntryNotFoundError();
    return rowToEntry(row);
  }
}
