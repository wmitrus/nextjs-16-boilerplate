import { describe, expect, it } from 'vitest';

import { isPublicError, PublicError } from './public-error';

describe('PublicError (SEC-37)', () => {
  it('carries the author-written message and a code', () => {
    const error = new PublicError('Your export is still processing.', 'BUSY');

    expect(error.message).toBe('Your export is still processing.');
    expect(error.code).toBe('BUSY');
    expect(error.exposeToClient).toBe(true);
  });

  it('defaults the code', () => {
    expect(new PublicError('nope').code).toBe('PUBLIC_ERROR');
  });

  it('recognises its own instances', () => {
    expect(isPublicError(new PublicError('x'))).toBe(true);
  });

  // The whole point of the type: anything else is internal by default, so a
  // message nobody thought about cannot reach a client.
  it('does not recognise ordinary errors', () => {
    expect(isPublicError(new Error('Failed query: select * from users'))).toBe(
      false,
    );
    expect(isPublicError(new TypeError('fetch failed'))).toBe(false);
    expect(isPublicError('a string')).toBe(false);
    expect(isPublicError(null)).toBe(false);
    expect(isPublicError(undefined)).toBe(false);
  });

  // instanceof can fail across realms or duplicated module instances; the
  // discriminant keeps the guard honest there.
  it('recognises a structurally-compatible error from another realm', () => {
    const crossRealm = Object.assign(new Error('safe to show'), {
      exposeToClient: true,
    });

    expect(isPublicError(crossRealm)).toBe(true);
  });

  it('is not fooled by a falsy or non-boolean discriminant', () => {
    expect(
      isPublicError(Object.assign(new Error('x'), { exposeToClient: false })),
    ).toBe(false);
    expect(
      isPublicError(Object.assign(new Error('x'), { exposeToClient: 'yes' })),
    ).toBe(false);
  });
});
