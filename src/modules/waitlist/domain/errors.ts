export class WaitlistEntryNotFoundError extends Error {
  readonly code = 'WAITLIST_ENTRY_NOT_FOUND';
  constructor(message = 'Waitlist entry not found') {
    super(message);
    this.name = 'WaitlistEntryNotFoundError';
  }
}

export class DuplicateWaitlistEntryError extends Error {
  readonly code = 'DUPLICATE_WAITLIST_ENTRY';
  constructor(email: string) {
    super(`Email '${email}' is already on the waitlist`);
    this.name = 'DuplicateWaitlistEntryError';
  }
}

export class WaitlistEntryAlreadyProcessedError extends Error {
  readonly code = 'WAITLIST_ENTRY_ALREADY_PROCESSED';
  constructor(
    message = 'Waitlist entry has already been approved or rejected',
  ) {
    super(message);
    this.name = 'WaitlistEntryAlreadyProcessedError';
  }
}
