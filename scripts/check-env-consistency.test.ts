import {
  checkClerkRedirectUrls,
  getMissingKeys,
} from './check-env-consistency.mjs';

describe('check-env-consistency', () => {
  it('should return empty array when all keys are present', () => {
    const envTs = `
      export const env = createEnv({
        server: {
          NODE_ENV: z.string(),
          API_KEY: z.string(),
        },
        client: {
          NEXT_PUBLIC_URL: z.string(),
        }
      });
    `;
    const exampleEnv =
      'NODE_ENV=dev\nAPI_KEY=secret\nNEXT_PUBLIC_URL=http://localhost:3000';

    const missing = getMissingKeys(envTs, exampleEnv);
    expect(missing).toEqual([]);
  });

  it('should detect missing keys', () => {
    const envTs = `
      export const env = createEnv({
        server: {
          REQUIRED_VAR: z.string(),
        }
      });
    `;
    const exampleEnv = 'NODE_ENV=dev';

    const missing = getMissingKeys(envTs, exampleEnv);
    expect(missing).toEqual(['REQUIRED_VAR']);
  });

  it('should ignore keys in comments or other blocks', () => {
    const envTs = `
      export const env = createEnv({
        server: {
          // IGNORE_ME: z.string(),
          REAL_VAR: z.string(),
        }
      });
    `;
    const exampleEnv = 'REAL_VAR=value';

    const missing = getMissingKeys(envTs, exampleEnv);
    expect(missing).toEqual([]);
  });
});

describe('checkClerkRedirectUrls', () => {
  const CORRECT_ENV = {
    NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: '/auth/bootstrap',
    NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: '/auth/bootstrap',
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: '/auth/bootstrap',
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: '/auth/bootstrap',
  };

  it('returns no warnings when all 4 vars are /auth/bootstrap', () => {
    const { warnings } = checkClerkRedirectUrls(CORRECT_ENV, 'development');
    expect(warnings).toEqual([]);
  });

  it('returns one warning when a single var is drifted', () => {
    const env = {
      ...CORRECT_ENV,
      NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: '/onboarding',
    };
    const { warnings } = checkClerkRedirectUrls(env, 'development');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(
      'NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL',
    );
    expect(warnings[0]).toContain('/onboarding');
  });

  it('returns 4 warnings when all vars are drifted', () => {
    const env = {
      NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: '/',
      NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: '/',
      NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: '/onboarding',
      NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: '/onboarding',
    };
    const { warnings } = checkClerkRedirectUrls(env, 'development');
    expect(warnings).toHaveLength(4);
  });

  it('returns no warnings in production regardless of values', () => {
    const env = {
      NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: '/wrong',
      NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: '/wrong',
      NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: '/wrong',
      NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: '/wrong',
    };
    const { warnings } = checkClerkRedirectUrls(env, 'production');
    expect(warnings).toEqual([]);
  });

  it('does not warn for absent variables (they rely on env.ts defaults)', () => {
    const { warnings } = checkClerkRedirectUrls({}, 'development');
    expect(warnings).toEqual([]);
  });

  it('does not warn for variables explicitly set to undefined', () => {
    const env: Record<string, string | undefined> = {
      NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: undefined,
    };
    const { warnings } = checkClerkRedirectUrls(env, 'development');
    expect(warnings).toEqual([]);
  });
});
