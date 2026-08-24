// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@/core/env');

const originalEnv = {
  ...process.env,
  CLERK_SECRET_KEY: 'sk_test_mock',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_mock',
};

const loadEnv = async () => {
  const mod = await import('./env');
  return mod.env;
};

const setEnv = (vars: Record<string, string | boolean | undefined>) => {
  const preservedEntries = Object.entries(process.env).filter(
    ([key]) => !Object.hasOwn(vars, key),
  );
  const overrideEntries = Object.entries(vars).flatMap(([key, value]) =>
    value === undefined ? [] : ([[key, String(value)]] as const),
  );

  process.env = Object.fromEntries([
    ...preservedEntries,
    ...overrideEntries,
  ]) as NodeJS.ProcessEnv;
};

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('env', () => {
  it('defaults NODE_ENV to development', async () => {
    setEnv({ NODE_ENV: undefined, NEXT_PUBLIC_APP_URL: undefined });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.NODE_ENV).toBe('development');
    expect(env.NEXT_PUBLIC_APP_URL).toBeUndefined();
  });

  it('validates auth redirect env variables', async () => {
    setEnv({
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: '/custom-sign-in',
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: '/custom-sign-up',
      NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: '/after-sign-in',
      NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: '/after-sign-up',
    });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.NEXT_PUBLIC_CLERK_SIGN_IN_URL).toBe('/custom-sign-in');
    expect(env.NEXT_PUBLIC_CLERK_SIGN_UP_URL).toBe('/custom-sign-up');
    expect(env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL).toBe(
      '/after-sign-in',
    );
    expect(env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL).toBe(
      '/after-sign-up',
    );
  });

  it('uses default auth redirect env variables', async () => {
    setEnv({
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: undefined,
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: undefined,
      NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: undefined,
      NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: undefined,
    });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.NEXT_PUBLIC_CLERK_SIGN_IN_URL).toBe('/sign-in');
    expect(env.NEXT_PUBLIC_CLERK_SIGN_UP_URL).toBe('/sign-up');
    expect(env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL).toBeUndefined();
    expect(env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL).toBeUndefined();
  });

  it('defaults REGISTRATION_MODE to invite-only', async () => {
    setEnv({ REGISTRATION_MODE: undefined });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.REGISTRATION_MODE).toBe('invite-only');
  });

  it('validates logger env variables', async () => {
    setEnv({
      LOG_LEVEL: 'debug',
      LOG_DIR: 'custom-logs',
      LOG_TO_FILE_DEV: 'true',
      NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: 'true',
      LOGFLARE_SERVER_ENABLED: 'true',
      LOGFLARE_SOURCE_NAME: 'nextjs-logs',
    });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.LOG_DIR).toBe('custom-logs');
    expect(env.LOG_TO_FILE_DEV).toBe(true);
    expect(env.NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED).toBe(true);
    expect(env.LOGFLARE_SERVER_ENABLED).toBe(true);
    expect(env.LOGFLARE_SOURCE_NAME).toBe('nextjs-logs');
  });

  it('uses default logger env variables', async () => {
    setEnv({
      LOG_LEVEL: undefined,
      LOG_DIR: undefined,
      LOG_TO_FILE_DEV: undefined,
      NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: undefined,
      LOGFLARE_SERVER_ENABLED: undefined,
      LOGFLARE_SOURCE_NAME: undefined,
    });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.LOG_LEVEL).toBe('info');
    expect(env.LOG_DIR).toBe('logs');
    expect(env.LOG_TO_FILE_DEV).toBe(false);
    expect(env.NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED).toBe(false);
    expect(env.LOGFLARE_SERVER_ENABLED).toBe(false);
    expect(env.LOGFLARE_SOURCE_NAME).toBeUndefined();
  });

  it('handles boolean strings in logger env variables', async () => {
    setEnv({
      LOG_TO_FILE_DEV: 'false',
      LOG_TO_FILE_PROD: 'true',
      NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: 'true',
      LOGFLARE_EDGE_ENABLED: 'true',
    });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.LOG_TO_FILE_DEV).toBe(false);
    expect(env.LOG_TO_FILE_PROD).toBe(true);
    expect(env.NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED).toBe(true);
    expect(env.LOGFLARE_EDGE_ENABLED).toBe(true);
  });

  it('handles boolean values in logger env variables', async () => {
    setEnv({
      LOG_TO_FILE_DEV: true,
      LOG_TO_FILE_PROD: false,
      NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: true,
      LOGFLARE_EDGE_ENABLED: false,
    });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.LOG_TO_FILE_DEV).toBe(true);
    expect(env.LOG_TO_FILE_PROD).toBe(false);
    expect(env.NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED).toBe(true);
    expect(env.LOGFLARE_EDGE_ENABLED).toBe(false);
  });

  it('fails validation for invalid LOG_LEVEL', async () => {
    setEnv({ LOG_LEVEL: 'invalid' });
    vi.resetModules();

    await expect(loadEnv()).rejects.toThrow();
  });

  it('uses explicit NODE_ENV when set', async () => {
    setEnv({ NODE_ENV: 'test' });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.NODE_ENV).toBe('test');
  });

  it('accepts a valid NEXT_PUBLIC_APP_URL', async () => {
    setEnv({ NEXT_PUBLIC_APP_URL: 'https://example.com' });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://example.com');
  });

  it('treats empty NEXT_PUBLIC_APP_URL as undefined', async () => {
    setEnv({ NEXT_PUBLIC_APP_URL: '' });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.NEXT_PUBLIC_APP_URL).toBeUndefined();
  });

  it('handles SECURITY_AUDIT_LOG_ENABLED string and boolean', async () => {
    setEnv({ SECURITY_AUDIT_LOG_ENABLED: 'true' });
    vi.resetModules();
    let env = await loadEnv();
    expect(env.SECURITY_AUDIT_LOG_ENABLED).toBe(true);

    setEnv({ SECURITY_AUDIT_LOG_ENABLED: 'false' });
    vi.resetModules();
    env = await loadEnv();
    expect(env.SECURITY_AUDIT_LOG_ENABLED).toBe(false);

    setEnv({ SECURITY_AUDIT_LOG_ENABLED: true });
    vi.resetModules();
    env = await loadEnv();
    expect(env.SECURITY_AUDIT_LOG_ENABLED).toBe(true);
  });
});

describe('UPSTASH_REDIS_REST_URL', () => {
  // The Upstash dashboard offers both a REST URL and a `rediss://`
  // connection string. Pasting the wrong one used to pass a bare z.url(),
  // deploy cleanly, and only fail at runtime as `TypeError: fetch failed` --
  // silently degrading every Redis-backed control (notably SEC-34's login
  // abuse counter) to a process-local fallback that is not durable on
  // serverless. Reject it at config time instead.
  it('rejects a rediss:// connection string', async () => {
    setEnv({
      UPSTASH_REDIS_REST_URL: 'rediss://default:pw@eu1-x.upstash.io:6379',
    });
    vi.resetModules();

    await expect(loadEnv()).rejects.toThrow();
  });

  it('accepts the https REST endpoint', async () => {
    setEnv({ UPSTASH_REDIS_REST_URL: 'https://eu1-x.upstash.io' });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.UPSTASH_REDIS_REST_URL).toBe('https://eu1-x.upstash.io');
  });
});

describe('tenancy env vars', () => {
  it('TENANCY_MODE defaults to single', async () => {
    setEnv({ TENANCY_MODE: undefined });
    vi.resetModules();
    const env = await loadEnv();
    expect(env.TENANCY_MODE).toBe('single');
  });

  it('TENANT_CONTEXT_HEADER defaults to x-tenant-id', async () => {
    setEnv({ TENANT_CONTEXT_HEADER: undefined });
    vi.resetModules();
    const env = await loadEnv();
    expect(env.TENANT_CONTEXT_HEADER).toBe('x-tenant-id');
  });

  it('TENANT_CONTEXT_COOKIE defaults to active_tenant_id', async () => {
    setEnv({ TENANT_CONTEXT_COOKIE: undefined });
    vi.resetModules();
    const env = await loadEnv();
    expect(env.TENANT_CONTEXT_COOKIE).toBe('active_tenant_id');
  });

  it('FREE_TIER_MAX_USERS defaults to 5', async () => {
    setEnv({ FREE_TIER_MAX_USERS: undefined });
    vi.resetModules();
    const env = await loadEnv();
    expect(env.FREE_TIER_MAX_USERS).toBe(5);
  });

  it('accepts personal and org as TENANCY_MODE values', async () => {
    setEnv({ TENANCY_MODE: 'personal' });
    vi.resetModules();
    let env = await loadEnv();
    expect(env.TENANCY_MODE).toBe('personal');

    setEnv({ TENANCY_MODE: 'org' });
    vi.resetModules();
    env = await loadEnv();
    expect(env.TENANCY_MODE).toBe('org');
  });

  it('accepts provider and db as TENANT_CONTEXT_SOURCE values', async () => {
    setEnv({ TENANT_CONTEXT_SOURCE: 'provider' });
    vi.resetModules();
    let env = await loadEnv();
    expect(env.TENANT_CONTEXT_SOURCE).toBe('provider');

    setEnv({ TENANT_CONTEXT_SOURCE: 'db' });
    vi.resetModules();
    env = await loadEnv();
    expect(env.TENANT_CONTEXT_SOURCE).toBe('db');
  });

  it('TENANT_CONTEXT_SOURCE is undefined when not set', async () => {
    setEnv({ TENANT_CONTEXT_SOURCE: undefined });
    vi.resetModules();
    const env = await loadEnv();
    expect(env.TENANT_CONTEXT_SOURCE).toBeUndefined();
  });

  it('CROSS_PROVIDER_EMAIL_LINKING defaults to verified-only', async () => {
    setEnv({ CROSS_PROVIDER_EMAIL_LINKING: undefined });
    vi.resetModules();
    const env = await loadEnv();
    expect(env.CROSS_PROVIDER_EMAIL_LINKING).toBe('verified-only');
  });

  it('accepts disabled as CROSS_PROVIDER_EMAIL_LINKING value', async () => {
    setEnv({ CROSS_PROVIDER_EMAIL_LINKING: 'disabled' });
    vi.resetModules();
    const env = await loadEnv();
    expect(env.CROSS_PROVIDER_EMAIL_LINKING).toBe('disabled');
  });

  it('accepts verified-only as CROSS_PROVIDER_EMAIL_LINKING value', async () => {
    setEnv({ CROSS_PROVIDER_EMAIL_LINKING: 'verified-only' });
    vi.resetModules();
    const env = await loadEnv();
    expect(env.CROSS_PROVIDER_EMAIL_LINKING).toBe('verified-only');
  });

  it('throws on invalid CROSS_PROVIDER_EMAIL_LINKING value', async () => {
    setEnv({ CROSS_PROVIDER_EMAIL_LINKING: 'always' });
    vi.resetModules();
    await expect(loadEnv()).rejects.toThrow();
  });
});

describe('validateTenancyConfig', () => {
  const loadModule = async () => {
    const mod = await import('./env');
    return { env: mod.env, validateTenancyConfig: mod.validateTenancyConfig };
  };

  it('throws when TENANCY_MODE=org without TENANT_CONTEXT_SOURCE', async () => {
    setEnv({ TENANCY_MODE: 'org', TENANT_CONTEXT_SOURCE: undefined });
    vi.resetModules();
    const { validateTenancyConfig } = await loadModule();
    expect(() => validateTenancyConfig()).toThrow(
      'TENANCY_MODE=org requires TENANT_CONTEXT_SOURCE',
    );
  });

  it('throws when TENANCY_MODE=single without DEFAULT_TENANT_ID', async () => {
    setEnv({
      TENANCY_MODE: 'single',
      DEFAULT_TENANT_ID: undefined,
      TENANT_CONTEXT_SOURCE: undefined,
    });
    vi.resetModules();
    const { validateTenancyConfig } = await loadModule();
    expect(() => validateTenancyConfig()).toThrow(
      'TENANCY_MODE=single requires DEFAULT_TENANT_ID',
    );
  });

  it('passes when TENANCY_MODE=single with DEFAULT_TENANT_ID', async () => {
    setEnv({
      TENANCY_MODE: 'single',
      DEFAULT_TENANT_ID: '10000000-0000-4000-8000-000000000001',
      TENANT_CONTEXT_SOURCE: undefined,
    });
    vi.resetModules();
    const { validateTenancyConfig } = await loadModule();
    expect(() => validateTenancyConfig()).not.toThrow();
  });

  it('passes when TENANCY_MODE=personal without TENANT_CONTEXT_SOURCE', async () => {
    setEnv({ TENANCY_MODE: 'personal', TENANT_CONTEXT_SOURCE: undefined });
    vi.resetModules();
    const { validateTenancyConfig } = await loadModule();
    expect(() => validateTenancyConfig()).not.toThrow();
  });

  it('passes when TENANCY_MODE=org with TENANT_CONTEXT_SOURCE=provider', async () => {
    setEnv({ TENANCY_MODE: 'org', TENANT_CONTEXT_SOURCE: 'provider' });
    vi.resetModules();
    const { validateTenancyConfig } = await loadModule();
    expect(() => validateTenancyConfig()).not.toThrow();
  });

  it('passes when TENANCY_MODE=org with TENANT_CONTEXT_SOURCE=db', async () => {
    setEnv({ TENANCY_MODE: 'org', TENANT_CONTEXT_SOURCE: 'db' });
    vi.resetModules();
    const { validateTenancyConfig } = await loadModule();
    expect(() => validateTenancyConfig()).not.toThrow();
  });
});

describe('validateTenancyConfigValues', () => {
  it('throws when single without defaultTenantId', async () => {
    vi.resetModules();
    const { validateTenancyConfigValues } = await import('./env');
    expect(() =>
      validateTenancyConfigValues('single', undefined, undefined),
    ).toThrow('TENANCY_MODE=single requires DEFAULT_TENANT_ID');
  });

  it('throws when org without tenantContextSource', async () => {
    vi.resetModules();
    const { validateTenancyConfigValues } = await import('./env');
    expect(() =>
      validateTenancyConfigValues('org', undefined, undefined),
    ).toThrow('TENANCY_MODE=org requires TENANT_CONTEXT_SOURCE');
  });

  it('passes for single with defaultTenantId', async () => {
    vi.resetModules();
    const { validateTenancyConfigValues } = await import('./env');
    expect(() =>
      validateTenancyConfigValues(
        'single',
        '10000000-0000-4000-8000-000000000001',
        undefined,
      ),
    ).not.toThrow();
  });

  it('passes for org with tenantContextSource=provider', async () => {
    vi.resetModules();
    const { validateTenancyConfigValues } = await import('./env');
    expect(() =>
      validateTenancyConfigValues('org', undefined, 'provider'),
    ).not.toThrow();
  });

  it('passes for personal with no defaultTenantId or source', async () => {
    vi.resetModules();
    const { validateTenancyConfigValues } = await import('./env');
    expect(() =>
      validateTenancyConfigValues('personal', undefined, undefined),
    ).not.toThrow();
  });
});

describe('validateAuthProviderConfigValues', () => {
  it('passes for authjs outside production without NEXTAUTH_SECRET', async () => {
    vi.resetModules();
    const { validateAuthProviderConfigValues } = await import('./env');

    expect(() =>
      validateAuthProviderConfigValues(
        'authjs',
        undefined,
        undefined,
        undefined,
        'development',
      ),
    ).not.toThrow();
  });

  it('throws for authjs in production when NEXTAUTH_SECRET is missing', async () => {
    vi.resetModules();
    const { validateAuthProviderConfigValues } = await import('./env');

    expect(() =>
      validateAuthProviderConfigValues(
        'authjs',
        undefined,
        undefined,
        undefined,
        'production',
      ),
    ).toThrow('AUTH_PROVIDER=authjs requires NEXTAUTH_SECRET');
  });

  it('throws for authjs production runtime when NEXTAUTH_URL is missing', async () => {
    vi.resetModules();
    const { validateAuthProviderConfigValues } = await import('./env');

    expect(() =>
      validateAuthProviderConfigValues(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'production',
      ),
    ).toThrow('AUTH_PROVIDER=authjs requires NEXTAUTH_URL');
  });

  it('throws for authjs production runtime when NEXTAUTH_URL is not http(s)', async () => {
    vi.resetModules();
    const { validateAuthProviderConfigValues } = await import('./env');

    expect(() =>
      validateAuthProviderConfigValues(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'production',
        'ftp://example.com',
      ),
    ).toThrow('NEXTAUTH_URL to be a valid absolute http(s) URL');
  });

  it('passes for authjs production runtime when NEXTAUTH_SECRET and NEXTAUTH_URL are present', async () => {
    vi.resetModules();
    const { validateAuthProviderConfigValues } = await import('./env');

    expect(() =>
      validateAuthProviderConfigValues(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'production',
        'https://example.com',
      ),
    ).not.toThrow();
  });

  it('passes for authjs Vercel Preview without NEXTAUTH_URL', async () => {
    vi.resetModules();
    const { validateAuthProviderConfigValues } = await import('./env');

    expect(() =>
      validateAuthProviderConfigValues(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'production',
        undefined,
        'preview',
      ),
    ).not.toThrow();
  });

  it('passes for supabase without Clerk keys', async () => {
    vi.resetModules();
    const { validateAuthProviderConfigValues } = await import('./env');

    expect(() =>
      validateAuthProviderConfigValues('supabase', undefined, undefined),
    ).not.toThrow();
  });

  it('throws for clerk when CLERK_SECRET_KEY is missing', async () => {
    vi.resetModules();
    const { validateAuthProviderConfigValues } = await import('./env');

    expect(() =>
      validateAuthProviderConfigValues('clerk', undefined, 'pk_test_mock'),
    ).toThrow('AUTH_PROVIDER=clerk requires CLERK_SECRET_KEY');
  });

  it('throws for clerk when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing', async () => {
    vi.resetModules();
    const { validateAuthProviderConfigValues } = await import('./env');

    expect(() =>
      validateAuthProviderConfigValues('clerk', 'sk_test_mock', undefined),
    ).toThrow('AUTH_PROVIDER=clerk requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  });

  it('passes for clerk when both Clerk keys are present', async () => {
    vi.resetModules();
    const { validateAuthProviderConfigValues } = await import('./env');

    expect(() =>
      validateAuthProviderConfigValues('clerk', 'sk_test_mock', 'pk_test_mock'),
    ).not.toThrow();
  });
});

describe('validateNewRelicConfigValues', () => {
  it('passes when New Relic is disabled', async () => {
    vi.resetModules();
    const { validateNewRelicConfigValues } = await import('./env');

    expect(() => validateNewRelicConfigValues(false, undefined)).not.toThrow();
  });

  it('throws when New Relic is enabled via string without a license key', async () => {
    vi.resetModules();
    const { validateNewRelicConfigValues } = await import('./env');

    expect(() => validateNewRelicConfigValues('true', undefined)).toThrow(
      'NEW_RELIC_ENABLED=true requires NEW_RELIC_LICENSE_KEY',
    );
  });

  it('throws when New Relic is enabled without a license key', async () => {
    vi.resetModules();
    const { validateNewRelicConfigValues } = await import('./env');

    expect(() => validateNewRelicConfigValues(true, undefined)).toThrow(
      'NEW_RELIC_ENABLED=true requires NEW_RELIC_LICENSE_KEY',
    );
  });

  it('passes when New Relic is enabled with a license key', async () => {
    vi.resetModules();
    const { validateNewRelicConfigValues } = await import('./env');

    expect(() =>
      validateNewRelicConfigValues(true, 'nr_license_key'),
    ).not.toThrow();
  });

  it('passes when enabled uses string true and a license key is present', async () => {
    vi.resetModules();
    const { validateNewRelicConfigValues } = await import('./env');

    expect(() =>
      validateNewRelicConfigValues('true', 'nr_license_key'),
    ).not.toThrow();
  });

  it('passes when New Relic license key has surrounding whitespace', async () => {
    vi.resetModules();
    const { validateNewRelicConfigValues } = await import('./env');

    expect(() =>
      validateNewRelicConfigValues(true, '  nr_license_key  '),
    ).not.toThrow();
  });

  it('throws when New Relic license key is whitespace only', async () => {
    vi.resetModules();
    const { validateNewRelicConfigValues } = await import('./env');

    expect(() => validateNewRelicConfigValues(true, '   ')).toThrow(
      'NEW_RELIC_ENABLED=true requires NEW_RELIC_LICENSE_KEY',
    );
  });

  it('throws when Vercel runtime preloads New Relic through NODE_OPTIONS', async () => {
    vi.resetModules();
    const { validateNewRelicConfigValues } = await import('./env');

    expect(() =>
      validateNewRelicConfigValues(
        true,
        'nr_license_key',
        '-r newrelic',
        'production',
        'production',
      ),
    ).toThrow('NODE_OPTIONS must not preload newrelic on Vercel');
  });

  it('throws when Vercel runtime preloads New Relic through NODE_OPTIONS equals require syntax', async () => {
    vi.resetModules();
    const { validateNewRelicConfigValues } = await import('./env');

    expect(() =>
      validateNewRelicConfigValues(
        true,
        'nr_license_key',
        '--require=newrelic',
        'production',
        'production',
      ),
    ).toThrow('NODE_OPTIONS must not preload newrelic on Vercel');
  });

  it('allows New Relic preload outside Vercel', async () => {
    vi.resetModules();
    const { validateNewRelicConfigValues } = await import('./env');

    expect(() =>
      validateNewRelicConfigValues(
        true,
        'nr_license_key',
        '-r newrelic',
        'production',
      ),
    ).not.toThrow();
  });
});

describe('validateVerificationConfigValues', () => {
  it('throws when both bypass flags are true simultaneously', async () => {
    vi.resetModules();
    const { validateVerificationConfigValues } = await import('./env');
    expect(() =>
      validateVerificationConfigValues('development', 'open', true, true),
    ).toThrow('cannot both be true');
  });

  it('throws when production has AUTH_DEV_AUTO_VERIFY=true', async () => {
    vi.resetModules();
    const { validateVerificationConfigValues } = await import('./env');
    expect(() =>
      validateVerificationConfigValues('production', 'disabled', true, false),
    ).toThrow('banned in production');
  });

  it('throws when production has AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV=true', async () => {
    vi.resetModules();
    const { validateVerificationConfigValues } = await import('./env');
    expect(() =>
      validateVerificationConfigValues('production', 'disabled', false, true),
    ).toThrow('banned in production');
  });

  it('throws when production has REGISTRATION_MODE=open', async () => {
    vi.resetModules();
    const { validateVerificationConfigValues } = await import('./env');
    expect(() =>
      validateVerificationConfigValues('production', 'open', false, false),
    ).toThrow('REGISTRATION_MODE=open is not allowed in production');
  });

  it('throws when non-production has open registration without any bypass', async () => {
    vi.resetModules();
    const { validateVerificationConfigValues } = await import('./env');
    expect(() =>
      validateVerificationConfigValues('development', 'open', false, false),
    ).toThrow('REGISTRATION_MODE=open in non-production requires');
  });

  it('passes when non-production open registration uses AUTH_DEV_AUTO_VERIFY', async () => {
    vi.resetModules();
    const { validateVerificationConfigValues } = await import('./env');
    expect(() =>
      validateVerificationConfigValues('development', 'open', true, false),
    ).not.toThrow();
  });

  it('passes when non-production open registration uses AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV', async () => {
    vi.resetModules();
    const { validateVerificationConfigValues } = await import('./env');
    expect(() =>
      validateVerificationConfigValues('development', 'open', false, true),
    ).not.toThrow();
  });

  it('passes when production has disabled registration and no bypass flags', async () => {
    vi.resetModules();
    const { validateVerificationConfigValues } = await import('./env');
    expect(() =>
      validateVerificationConfigValues('production', 'disabled', false, false),
    ).not.toThrow();
  });

  it('passes when non-production has disabled registration without bypass', async () => {
    vi.resetModules();
    const { validateVerificationConfigValues } = await import('./env');
    expect(() =>
      validateVerificationConfigValues('development', 'disabled', false, false),
    ).not.toThrow();
  });
});

describe('resolveDeploymentProxyValue (SEC-43)', () => {
  const load = async () => (await import('./env')).resolveDeploymentProxyValue;

  it('returns the declared value verbatim', async () => {
    const resolve = await load();
    for (const declared of ['vercel', 'cloudflare', 'trusted-proxy', 'none']) {
      expect(resolve(declared, 'production', undefined)).toBe(declared);
    }
  });

  it('defaults to none outside production', async () => {
    // A contributor running locally has no ingress to declare; making them
    // invent one is friction with no security value. `none` trusts nothing,
    // so the default is safe even though it is not useful.
    const resolve = await load();
    expect(resolve(undefined, 'development', undefined)).toBe('none');
    expect(resolve(undefined, 'test', undefined)).toBe('none');
  });

  it('refuses to start in production without an explicit declaration', async () => {
    const resolve = await load();
    expect(() => resolve(undefined, 'production', undefined)).toThrow(
      /DEPLOYMENT_PROXY must be set/,
    );
  });

  it('uses VERCEL_ENV only to improve the message, never to pick a model', async () => {
    // Inferring `vercel` from VERCEL_ENV would mean a deployment starts
    // trusting headers because of a variable nobody set for that purpose --
    // the same "believe the header because it is there" mistake one level up.
    const resolve = await load();
    expect(() => resolve(undefined, 'production', 'preview')).toThrow(
      /Detected a Vercel deployment/,
    );
  });

  it('treats a blank value as undeclared', async () => {
    const resolve = await load();
    expect(() => resolve('   ', 'production', undefined)).toThrow(
      /DEPLOYMENT_PROXY must be set/,
    );
  });
});

describe('validateDeploymentProxyConfigValues (SEC-43)', () => {
  const load = async () =>
    (await import('./env')).validateDeploymentProxyConfigValues;

  it('requires CIDRs for trusted-proxy', async () => {
    const validate = await load();
    expect(() =>
      validate('trusted-proxy', undefined, 'production', undefined),
    ).toThrow(/requires TRUSTED_PROXY_CIDRS/);
  });

  it('rejects a CIDR list that is only separators', async () => {
    const validate = await load();
    expect(() =>
      validate('trusted-proxy', ' , , ', 'production', undefined),
    ).toThrow(/requires TRUSTED_PROXY_CIDRS/);
  });

  it('accepts trusted-proxy with CIDRs', async () => {
    const validate = await load();
    expect(() =>
      validate(
        'trusted-proxy',
        '10.0.0.0/8, 172.16.0.0/12',
        'production',
        undefined,
      ),
    ).not.toThrow();
  });

  it('does not require CIDRs for the other models', async () => {
    const validate = await load();
    for (const model of ['vercel', 'cloudflare', 'none']) {
      expect(() =>
        validate(model, undefined, 'production', undefined),
      ).not.toThrow();
    }
  });
});

describe('validateInternalApiKeyConfigValues (SEC-44)', () => {
  const load = async () =>
    (await import('./env')).validateInternalApiKeyConfigValues;
  const strong = 'a'.repeat(32);
  const strongOther = 'b'.repeat(32);

  it('rejects a short key in production', async () => {
    // `z.string().min(1)` meant a one-character key was a valid production
    // configuration.
    const validate = await load();
    expect(() => validate('short', undefined, 'production')).toThrow(
      /at least 32 characters/,
    );
  });

  it('rejects a short previous key too', async () => {
    const validate = await load();
    expect(() => validate(strong, 'short', 'production')).toThrow(
      /INTERNAL_API_KEY_PREVIOUS must be at least/,
    );
  });

  it('accepts a strong key', async () => {
    const validate = await load();
    expect(() => validate(strong, undefined, 'production')).not.toThrow();
    expect(() => validate(strong, strongOther, 'production')).not.toThrow();
  });

  it('treats an unset key as valid — the guard then refuses everything', async () => {
    const validate = await load();
    expect(() => validate(undefined, undefined, 'production')).not.toThrow();
  });

  it('rejects a rotation where both slots hold the same value', async () => {
    // Looks like a rotation, performs none.
    const validate = await load();
    expect(() => validate(strong, strong, 'production')).toThrow(
      /must differ from INTERNAL_API_KEY/,
    );
  });

  it('does not apply the floor outside production', async () => {
    // E2E and local development use short fixtures on purpose, and those
    // deployments are not reachable from the internet.
    const validate = await load();
    for (const nodeEnv of ['development', 'test']) {
      expect(() => validate('short', 'shorter', nodeEnv)).not.toThrow();
    }
  });
});

describe('validateAppSecurityConfigValues (SEC-48)', () => {
  const load = async () =>
    (await import('./env')).validateAppSecurityConfigValues;
  const strong = 'k'.repeat(32);
  const strongOther = 'm'.repeat(32);

  it('rejects the step-up bypass in a production build', async () => {
    const validate = await load();
    expect(() =>
      validate(strong, undefined, 'bypass-local-only', 'production', undefined),
    ).toThrow(/not permitted in a deployed environment/);
  });

  it.each([['production'], ['preview']])(
    'rejects the step-up bypass on a Vercel %s deployment',
    async (vercelEnv) => {
      const validate = await load();
      expect(() =>
        validate(strong, undefined, 'bypass-local-only', 'test', vercelEnv),
      ).toThrow(/not permitted in a deployed environment/);
    },
  );

  it('allows the bypass on a developer machine and in CI', async () => {
    const validate = await load();
    expect(() =>
      validate(
        undefined,
        undefined,
        'bypass-local-only',
        'development',
        undefined,
      ),
    ).not.toThrow();
    expect(() =>
      validate(undefined, undefined, 'bypass-local-only', 'test', undefined),
    ).not.toThrow();
  });

  it('requires the master key in production', async () => {
    // Without it every admin mutation fails closed at runtime. Correct, but
    // deploy time is a much better place to find out.
    const validate = await load();
    expect(() =>
      validate(undefined, undefined, 'required', 'production', undefined),
    ).toThrow(/APP_SECURITY_MASTER_KEY is required in production/);
  });

  it('does not require the master key outside a deployed environment', async () => {
    const validate = await load();
    expect(() =>
      validate(undefined, undefined, 'required', 'development', undefined),
    ).not.toThrow();
  });

  it('rejects a short master key in production', async () => {
    const validate = await load();
    expect(() =>
      validate('short', undefined, 'required', 'production', undefined),
    ).toThrow(/at least 32 characters/);
    expect(() =>
      validate(strong, 'short', 'required', 'production', undefined),
    ).toThrow(/APP_SECURITY_MASTER_KEY_PREVIOUS must be at least/);
  });

  it('rejects a rotation where both slots hold the same value', async () => {
    const validate = await load();
    expect(() =>
      validate(strong, strong, 'required', 'production', undefined),
    ).toThrow(/must differ from APP_SECURITY_MASTER_KEY/);
  });

  it('accepts a well-formed production configuration', async () => {
    const validate = await load();
    expect(() =>
      validate(strong, undefined, 'required', 'production', 'production'),
    ).not.toThrow();
    expect(() =>
      validate(strong, strongOther, undefined, 'production', 'production'),
    ).not.toThrow();
  });
});

describe('isDeployedEnvironmentValues (SEC-48)', () => {
  const load = async () => (await import('./env')).isDeployedEnvironmentValues;

  it.each([
    ['production build', 'production', undefined, true],
    ['vercel production', 'test', 'production', true],
    ['vercel preview', 'test', 'preview', true],
    ['vercel dev', 'development', 'development', false],
    ['local dev', 'development', undefined, false],
    ['CI', 'test', undefined, false],
  ])('%s', async (_label, nodeEnv, vercelEnv, expected) => {
    const isDeployed = await load();
    expect(isDeployed(nodeEnv, vercelEnv)).toBe(expected);
  });
});
