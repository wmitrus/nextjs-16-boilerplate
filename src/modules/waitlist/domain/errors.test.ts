import { describe, expect, it } from 'vitest';

import {
  DuplicateWaitlistEntryError,
  WaitlistEntryAlreadyProcessedError,
  WaitlistEntryNotFoundError,
} from './errors';

describe('waitlist domain errors', () => {
  it('creates a not-found error with a stable code and default message', () => {
    const error = new WaitlistEntryNotFoundError();

    expect(error.name).toBe('WaitlistEntryNotFoundError');
    expect(error.code).toBe('WAITLIST_ENTRY_NOT_FOUND');
    expect(error.message).toBe('Waitlist entry not found');
  });

  it('creates a duplicate-entry error without losing the submitted email context', () => {
    const error = new DuplicateWaitlistEntryError('person@example.com');

    expect(error.name).toBe('DuplicateWaitlistEntryError');
    expect(error.code).toBe('DUPLICATE_WAITLIST_ENTRY');
    expect(error.message).toBe(
      "Email 'person@example.com' is already on the waitlist",
    );
  });

  it('creates an already-processed error with a stable code and custom message', () => {
    const error = new WaitlistEntryAlreadyProcessedError('Already approved');

    expect(error.name).toBe('WaitlistEntryAlreadyProcessedError');
    expect(error.code).toBe('WAITLIST_ENTRY_ALREADY_PROCESSED');
    expect(error.message).toBe('Already approved');
  });
});
