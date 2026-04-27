import { resolveServerLogger } from '@/core/logger/di';

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

import type { EmailService } from '@/modules/invitations/domain/EmailService';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'waitlist',
  module: 'default-waitlist-service',
});

export class DefaultWaitlistService implements WaitlistService {
  constructor(
    private readonly repository: WaitlistRepository,
    private readonly emailService: EmailService,
  ) {}

  async joinWaitlist(input: JoinWaitlistInput): Promise<WaitlistEntry> {
    const existing = await this.repository.findByEmail(input.email);
    if (existing) {
      throw new DuplicateWaitlistEntryError(input.email);
    }

    const entry = await this.repository.add({
      email: input.email,
      name: input.name,
      organizationId: input.organizationId,
    });

    try {
      await this.emailService.sendWaitlistConfirmationEmail({
        to: entry.email,
        name: entry.name,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(
        {
          event: 'waitlist:confirmation_email_failed',
          errorMessage: error.message,
          errorName: error.name,
        },
        'Failed to send waitlist confirmation email',
      );
    }

    return entry;
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
