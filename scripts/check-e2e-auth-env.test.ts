import { describe, expect, it } from 'vitest';

import {
  findMissingClerkFixtureAccounts,
  requiresClerkFixtures,
  validateClerkRedirectEnv,
} from './check-e2e-auth-env.mjs';

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

describe('findMissingClerkFixtureAccounts', () => {
  it('returns no errors when all required fixture accounts exist', async () => {
    const result = await findMissingClerkFixtureAccounts(
      [
        {
          label: 'personal new user',
          identifierKey: 'E2E_CLERK_PERSONAL_NEW_USER_USERNAME',
          identifierValue: 'personal@example.com',
        },
      ],
      async () => true,
    );

    expect(result).toEqual({ missing: [], warnings: [] });
  });

  it('returns an explicit error when a configured fixture account is missing in Clerk', async () => {
    const result = await findMissingClerkFixtureAccounts(
      [
        {
          label: 'personal new user',
          identifierKey: 'E2E_CLERK_PERSONAL_NEW_USER_USERNAME',
          identifierValue: 'personal@example.com',
        },
      ],
      async () => false,
    );

    expect(result.missing).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    expect(result.missing[0]).toContain('personal new user');
    expect(result.missing[0]).toContain('E2E_CLERK_PERSONAL_NEW_USER_USERNAME');
    expect(result.missing[0]).toContain('personal@example.com');
    expect(result.missing[0]).toContain('no Clerk user with that email exists');
  });

  it('downgrades missing mutable fixtures to warnings', async () => {
    const result = await findMissingClerkFixtureAccounts(
      [
        {
          label: 'personal new user',
          identifierKey: 'E2E_CLERK_PERSONAL_NEW_USER_USERNAME',
          identifierValue: 'personal@example.com',
          autoReconciled: true,
        },
      ],
      async () => false,
    );

    expect(result.missing).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(
      'create or repair this mutable fixture automatically',
    );
  });

  it('skips lookup for non-email identifiers', async () => {
    let lookupCount = 0;

    const result = await findMissingClerkFixtureAccounts(
      [
        {
          label: 'provider owner user',
          identifierKey: 'E2E_CLERK_ORG_PROVIDER_OWNER_USERNAME',
          identifierValue: 'non-email-identifier',
        },
      ],
      async () => {
        lookupCount += 1;
        return false;
      },
    );

    expect(result).toEqual({ missing: [], warnings: [] });
    expect(lookupCount).toBe(0);
  });
});

describe('requiresClerkFixtures', () => {
  it('requires Clerk fixtures when the app runs on Clerk', () => {
    expect(requiresClerkFixtures('clerk')).toBe(true);
  });

  it('treats an unset provider as Clerk, matching the app default', () => {
    expect(requiresClerkFixtures(undefined)).toBe(true);
    expect(requiresClerkFixtures('  clerk  ')).toBe(true);
  });

  it.each([['authjs'], ['supabase'], ['neon']])(
    'does not require Clerk identities for AUTH_PROVIDER=%s',
    (provider) => {
      // Every Clerk-specific spec gates itself on the runtime profile's
      // provider, so demanding live Clerk test accounts for these runs is a
      // false requirement -- and it made every AuthJS suite unrunnable in CI.
      expect(requiresClerkFixtures(provider)).toBe(false);
    },
  );
});
