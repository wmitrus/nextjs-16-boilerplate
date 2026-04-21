import {
  DuplicateWaitlistEntryError,
  WaitlistEntryNotFoundError,
  WaitlistEntryAlreadyProcessedError,
} from '../domain/errors';
import type { WaitlistEntry } from '../domain/types';
import type { WaitlistRepository } from '../domain/WaitlistRepository';
import type {
  WaitlistService,
  JoinWaitlistInput,
} from '../domain/WaitlistService';

export class DefaultWaitlistService implements WaitlistService {
  constructor(private readonly repository: WaitlistRepository) {}

  async joinWaitlist(input: JoinWaitlistInput): Promise<WaitlistEntry> {
    const existing = await this.repository.findByEmail(input.email);
    if (existing) {
      throw new DuplicateWaitlistEntryError(input.email);
    }

    return this.repository.add({
      email: input.email,
      name: input.name,
      organizationId: input.organizationId,
    });
  }

  async approveEntry(id: string): Promise<WaitlistEntry> {
    const entry = await this.repository.findById(id);
    if (!entry) throw new WaitlistEntryNotFoundError();
    if (entry.status !== 'pending') {
      throw new WaitlistEntryAlreadyProcessedError();
    }
    return this.repository.approve(id);
  }

  async rejectEntry(id: string): Promise<WaitlistEntry> {
    const entry = await this.repository.findById(id);
    if (!entry) throw new WaitlistEntryNotFoundError();
    if (entry.status !== 'pending') {
      throw new WaitlistEntryAlreadyProcessedError();
    }
    return this.repository.reject(id);
  }

  async listPending(): Promise<WaitlistEntry[]> {
    return this.repository.listPending();
  }
}
