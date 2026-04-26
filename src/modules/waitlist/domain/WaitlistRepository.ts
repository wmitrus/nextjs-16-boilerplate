import type { CreateWaitlistEntryData, WaitlistEntry } from './types';

export interface WaitlistRepository {
  add(data: CreateWaitlistEntryData): Promise<WaitlistEntry>;

  findByEmail(email: string): Promise<WaitlistEntry | null>;

  findById(id: string): Promise<WaitlistEntry | null>;

  listPending(): Promise<WaitlistEntry[]>;

  approve(id: string, approvedAt?: Date): Promise<WaitlistEntry>;

  reject(id: string): Promise<WaitlistEntry>;
}
