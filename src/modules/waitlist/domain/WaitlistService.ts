import type { WaitlistEntry } from './types';

export interface JoinWaitlistInput {
  readonly email: string;
  readonly name?: string;
  readonly organizationId?: string;
}

export interface WaitlistService {
  joinWaitlist(input: JoinWaitlistInput): Promise<WaitlistEntry>;

  approveEntry(id: string): Promise<WaitlistEntry>;

  rejectEntry(id: string): Promise<WaitlistEntry>;

  listPending(): Promise<WaitlistEntry[]>;
}
