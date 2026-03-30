import { describe, expect, it } from 'vitest';

import { normalizeClerkPostAuthRedirect } from './clerk-redirects';

describe('normalizeClerkPostAuthRedirect', () => {
  it('returns undefined when target is not configured', () => {
    expect(
      normalizeClerkPostAuthRedirect(undefined, 'https://example.com'),
    ).toBeUndefined();
  });

  it('normalizes internal redirect paths against NEXT_PUBLIC_APP_URL', () => {
    expect(
      normalizeClerkPostAuthRedirect('/users', 'https://example.com'),
    ).toBe('https://example.com/users');
    expect(
      normalizeClerkPostAuthRedirect(
        '/users?tab=settings',
        'https://example.com',
      ),
    ).toBe('https://example.com/users?tab=settings');
  });

  it('preserves same-origin absolute redirect URLs', () => {
    expect(
      normalizeClerkPostAuthRedirect(
        'https://example.com/users',
        'https://example.com',
      ),
    ).toBe('https://example.com/users');
  });

  it('fails when NEXT_PUBLIC_APP_URL is missing for a configured target', () => {
    expect(() => normalizeClerkPostAuthRedirect('/users', undefined)).toThrow(
      'NEXT_PUBLIC_APP_URL is required when Clerk post-auth redirect URLs are configured.',
    );
  });

  it('fails for invalid internal redirect targets', () => {
    expect(() =>
      normalizeClerkPostAuthRedirect('users', 'https://example.com'),
    ).toThrow(
      'Clerk post-auth redirect URLs must be internal paths or same-origin absolute URLs.',
    );
  });

  it('fails for cross-origin absolute redirect targets', () => {
    expect(() =>
      normalizeClerkPostAuthRedirect(
        'https://evil.example/users',
        'https://example.com',
      ),
    ).toThrow(
      'Clerk post-auth redirect URLs must stay on NEXT_PUBLIC_APP_URL origin.',
    );
  });
});
