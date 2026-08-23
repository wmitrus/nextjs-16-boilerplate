import { describe, expect, it } from 'vitest';

import { isSessionRevoked } from './session-revocation';

const AT = (iso: string) => new Date(iso);
const SECONDS = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

describe('isSessionRevoked (SEC-36)', () => {
  it('never revokes when the user has no revocation marker', () => {
    expect(isSessionRevoked(null, SECONDS('2020-01-01T00:00:00Z'))).toBe(false);
    expect(isSessionRevoked(undefined, SECONDS('2020-01-01T00:00:00Z'))).toBe(
      false,
    );
  });

  it('revokes a session issued before the marker', () => {
    expect(
      isSessionRevoked(
        AT('2026-08-22T12:00:00Z'),
        SECONDS('2026-08-22T11:59:59Z'),
      ),
    ).toBe(true);
  });

  it('keeps a session issued after the marker', () => {
    expect(
      isSessionRevoked(
        AT('2026-08-22T12:00:00Z'),
        SECONDS('2026-08-22T12:00:01Z'),
      ),
    ).toBe(false);
  });

  // `iat` is stamped in whole seconds, so the session the resetting user
  // receives can share a second with the marker. Treating equal as valid is
  // the benign direction -- the alternative logs out the very person who
  // just reset their password.
  it('keeps a session issued in the same second as the marker', () => {
    expect(
      isSessionRevoked(
        AT('2026-08-22T12:00:00.750Z'),
        SECONDS('2026-08-22T12:00:00Z'),
      ),
    ).toBe(false);
  });

  // Fail closed: a marker exists, so this user's sessions are age-checked.
  // A session that cannot be aged cannot be shown to be current.
  it('revokes when a marker exists but the session has no issue time', () => {
    expect(isSessionRevoked(AT('2026-08-22T12:00:00Z'), undefined)).toBe(true);
  });

  it('stays inert for a provider with no issue time and no marker', () => {
    expect(isSessionRevoked(null, undefined)).toBe(false);
  });
});
