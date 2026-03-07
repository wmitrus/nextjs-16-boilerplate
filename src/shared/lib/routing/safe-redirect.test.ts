import { describe, expect, it } from 'vitest';

import { isValidInternalRedirect, sanitizeRedirectUrl } from './safe-redirect';

describe('isValidInternalRedirect', () => {
  it('accepts valid internal paths', () => {
    expect(isValidInternalRedirect('/users')).toBe(true);
    expect(isValidInternalRedirect('/app/dashboard')).toBe(true);
    expect(isValidInternalRedirect('/onboarding')).toBe(true);
    expect(isValidInternalRedirect('/auth/bootstrap')).toBe(true);
    expect(isValidInternalRedirect('/users?tab=settings')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidInternalRedirect('')).toBe(false);
  });

  it('rejects protocol-relative URLs', () => {
    expect(isValidInternalRedirect('//evil.com')).toBe(false);
    expect(isValidInternalRedirect('//evil.com/path')).toBe(false);
  });

  it('rejects absolute URLs with scheme', () => {
    expect(isValidInternalRedirect('https://evil.com')).toBe(false);
    expect(isValidInternalRedirect('http://evil.com')).toBe(false);
    expect(isValidInternalRedirect('ftp://evil.com')).toBe(false);
  });

  it('rejects javascript: scheme', () => {
    expect(isValidInternalRedirect('javascript:alert(1)')).toBe(false);
  });

  it('rejects relative paths without leading slash', () => {
    expect(isValidInternalRedirect('users')).toBe(false);
    expect(isValidInternalRedirect('evil.com')).toBe(false);
  });
});

describe('sanitizeRedirectUrl', () => {
  it('returns the url when valid', () => {
    expect(sanitizeRedirectUrl('/users', '/fallback')).toBe('/users');
    expect(sanitizeRedirectUrl('/app/dashboard', '/users')).toBe(
      '/app/dashboard',
    );
    expect(sanitizeRedirectUrl('/users?tab=settings', '/users')).toBe(
      '/users?tab=settings',
    );
  });

  it('returns fallback when url is invalid', () => {
    expect(sanitizeRedirectUrl('https://evil.com', '/users')).toBe('/users');
    expect(sanitizeRedirectUrl('//evil.com', '/users')).toBe('/users');
    expect(sanitizeRedirectUrl('', '/users')).toBe('/users');
    expect(sanitizeRedirectUrl('javascript:alert(1)', '/users')).toBe('/users');
    expect(sanitizeRedirectUrl('users', '/users')).toBe('/users');
  });
});
