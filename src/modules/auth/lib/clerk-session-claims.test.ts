import { describe, it, expect } from 'vitest';

import { extractClerkEmailClaim } from './clerk-session-claims';

describe('extractClerkEmailClaim', () => {
  it('reads the default `email` claim when present', () => {
    expect(extractClerkEmailClaim({ email: 'owner@example.com' })).toBe(
      'owner@example.com',
    );
  });

  it('falls back to the `primaryEmail` custom claim when `email` is absent', () => {
    expect(extractClerkEmailClaim({ primaryEmail: 'owner@example.com' })).toBe(
      'owner@example.com',
    );
  });

  it('prefers `email` over `primaryEmail` when both are present', () => {
    expect(
      extractClerkEmailClaim({
        email: 'from-email@example.com',
        primaryEmail: 'from-primary@example.com',
      }),
    ).toBe('from-email@example.com');
  });

  it('ignores empty-string claims and falls through', () => {
    expect(
      extractClerkEmailClaim({ email: '', primaryEmail: 'owner@example.com' }),
    ).toBe('owner@example.com');
  });

  it('returns undefined when neither claim is present', () => {
    expect(extractClerkEmailClaim({ sub: 'user_123' })).toBeUndefined();
  });

  it('returns undefined for null/undefined sessionClaims', () => {
    expect(extractClerkEmailClaim(null)).toBeUndefined();
    expect(extractClerkEmailClaim(undefined)).toBeUndefined();
  });
});
