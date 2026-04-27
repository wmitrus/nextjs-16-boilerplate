export type WaitlistEntryStatus = 'pending' | 'approved' | 'rejected';

export interface WaitlistEntry {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly organizationId: string | null;
  readonly status: WaitlistEntryStatus;
  readonly approvedAt: Date | null;
  readonly notifiedAt: Date | null;
  readonly createdAt: Date;
}

export interface CreateWaitlistEntryData {
  readonly email: string;
  readonly name?: string;
  readonly organizationId?: string;
}
