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
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
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
    expect(env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL).toBe('/');
    expect(env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL).toBe('/');
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
      DEFAULT_TENANT_ID: '550e8400-e29b-41d4-a716-446655440000',
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
        '550e8400-e29b-41d4-a716-446655440000',
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
  it('passes for authjs without Clerk keys', async () => {
    vi.resetModules();
    const { validateAuthProviderConfigValues } = await import('./env');

    expect(() =>
      validateAuthProviderConfigValues('authjs', undefined, undefined),
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
