import type { WaitlistEntry } from './types';

/**
 * Joining the waitlist is an anonymous, unauthenticated act, so nothing the
 * joiner sends can be treated as scope authority.
 *
 * `organizationId` used to be part of this input and was persisted verbatim
 * from the public request body -- which let a visitor nominate the
 * organization that approving them would create an invitation into. It is
 * gone deliberately; the destination is decided at approval time by the
 * platform, from server configuration. The nullable column itself is left
 * in place for a separate, non-security cleanup. See SEC-41.
 */
export interface JoinWaitlistInput {
  readonly email: string;
  readonly name?: string;
}

export interface WaitlistService {
  joinWaitlist(input: JoinWaitlistInput): Promise<WaitlistEntry>;

  approveEntry(id: string): Promise<WaitlistEntry>;

  rejectEntry(id: string): Promise<WaitlistEntry>;

  listPending(): Promise<WaitlistEntry[]>;
}
