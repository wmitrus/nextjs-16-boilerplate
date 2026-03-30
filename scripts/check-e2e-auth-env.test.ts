import { describe, expect, it } from 'vitest';

import { validateClerkRedirectEnv } from './check-e2e-auth-env.mjs';

describe('validateClerkRedirectEnv', () => {
  const CORRECT_ENV = {
    NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL:
      '/auth/bootstrap/start?redirect_url=/users',
    NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL:
      '/auth/bootstrap/start?redirect_url=/users',
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
      '/auth/bootstrap/start?redirect_url=/users',
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL:
      '/auth/bootstrap/start?redirect_url=/users',
  };

  it('returns no errors when redirect vars match the expected bootstrap route', () => {
    expect(validateClerkRedirectEnv(CORRECT_ENV, 'development')).toEqual([]);
  });

  it('returns explicit errors when redirect vars drift in development', () => {
    const errors = validateClerkRedirectEnv(
      {
        ...CORRECT_ENV,
        NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: '/onboarding',
      },
      'development',
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(
      'NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/onboarding',
    );
    expect(errors[0]).toContain('/auth/bootstrap/start?redirect_url=/users');
  });

  it('returns no errors in production', () => {
    const errors = validateClerkRedirectEnv(
      {
        NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: '/wrong',
      },
      'production',
    );

    expect(errors).toEqual([]);
  });
});
