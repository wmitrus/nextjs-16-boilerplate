import { describe, expect, it } from 'vitest';

import { extractApiErrorMessage } from './extract-error-message';

describe('extractApiErrorMessage', () => {
  it('reads a server_error message', () => {
    expect(
      extractApiErrorMessage({ status: 'server_error', error: 'Forbidden' }),
    ).toBe('Forbidden');
  });

  // The case a client that only reads `.error` gets wrong: a 422 envelope has
  // no `error` field at all, so it would fall back to a generic message and
  // hide what the user actually needs to fix.
  it('reads the first field message from form_errors', () => {
    expect(
      extractApiErrorMessage({
        status: 'form_errors',
        errors: { password: ['Password must be at least 8 characters'] },
      }),
    ).toBe('Password must be at least 8 characters');
  });

  it('skips empty field arrays and finds a later message', () => {
    expect(
      extractApiErrorMessage({
        status: 'form_errors',
        errors: { token: [], password: ['Too short'] },
      }),
    ).toBe('Too short');
  });

  it('returns undefined when there is no message, leaving the fallback to the caller', () => {
    expect(extractApiErrorMessage({ status: 'ok', data: {} })).toBeUndefined();
    expect(
      extractApiErrorMessage({ status: 'form_errors', errors: {} }),
    ).toBeUndefined();
    expect(
      extractApiErrorMessage({ status: 'server_error', error: '' }),
    ).toBeUndefined();
    expect(extractApiErrorMessage(null)).toBeUndefined();
    expect(extractApiErrorMessage('nope')).toBeUndefined();
  });
});
