import fs from 'node:fs';
import path from 'node:path';

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
    NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL:
      '/auth/bootstrap/start?redirect_url=/users',
    NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL:
      '/auth/bootstrap/start?redirect_url=/users',
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
      '/auth/bootstrap/start?redirect_url=/users',
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL:
      '/auth/bootstrap/start?redirect_url=/users',
  };

  it('returns no warnings when all 4 vars use the bootstrap start landing target', () => {
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

describe('rollback assessment operator trust-anchor template', () => {
  const exampleEnv = fs.readFileSync(
    path.resolve(process.cwd(), '.env.example'),
    'utf8',
  );

  const requiredRollbackTrustAnchors = [
    'PRODUCTION_AUTH_PROVIDER',
    'PRODUCTION_TENANCY_MODE',
    'PRODUCTION_TENANT_CONTEXT_SOURCE',
    'PRODUCTION_DB_PROVIDER',
    'PRODUCTION_DB_DRIVER',
    'PRODUCTION_RUNTIME_DATABASE_HOST',
    'PRODUCTION_DATABASE_HOST',
    'PRODUCTION_DATABASE_NAME',
    'PRODUCTION_DEFAULT_TENANT_ID',
  ] as const;

  it('documents every rollback assessment Production trust anchor', () => {
    const lines = exampleEnv.split(/\r?\n/);

    for (const key of requiredRollbackTrustAnchors) {
      expect(lines.some((line) => line.startsWith(`${key}=`))).toBe(true);
    }
  });

  it('documents the only currently supported Production DB runtime', () => {
    expect(exampleEnv).toMatch(/^PRODUCTION_DB_PROVIDER=drizzle$/m);
    expect(exampleEnv).toMatch(/^PRODUCTION_DB_DRIVER=postgres$/m);
  });

  it('documents the explicit none sentinel for tenant-context source', () => {
    expect(exampleEnv).toContain('none | provider | db');
    expect(exampleEnv).toContain(
      '`none` is the explicit sentinel representing a null tenant-context source.',
    );
  });

  it('documents the conditional single-tenant ID requirement', () => {
    expect(exampleEnv).toContain(
      'Required only when PRODUCTION_TENANCY_MODE=single.',
    );
    expect(exampleEnv).toContain(
      'Leave empty/unset for org and personal tenancy modes.',
    );
  });

  it('documents the separate runtime and schema database host pins', () => {
    expect(exampleEnv).toContain('PRODUCTION_RUNTIME_DATABASE_HOST=');
    expect(exampleEnv).toContain('PRODUCTION_DATABASE_HOST=');

    expect(exampleEnv).toContain(
      'This is deliberately independent from PRODUCTION_DATABASE_HOST below.',
    );
  });
});
