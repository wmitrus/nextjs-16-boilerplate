// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

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

  it('validates logger env variables', async () => {
    setEnv({
      LOG_LEVEL: 'debug',
      LOG_DIR: 'custom-logs',
      LOG_TO_FILE_DEV: 'true',
      NEXT_PUBLIC_LOGFLARE_INTEGRATION_ENABLED: 'true',
    });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.LOG_DIR).toBe('custom-logs');
    expect(env.LOG_TO_FILE_DEV).toBe(true);
    expect(env.NEXT_PUBLIC_LOGFLARE_INTEGRATION_ENABLED).toBe(true);
  });

  it('uses default logger env variables', async () => {
    setEnv({
      LOG_LEVEL: undefined,
      LOG_DIR: undefined,
      LOG_TO_FILE_DEV: undefined,
      NEXT_PUBLIC_LOGFLARE_INTEGRATION_ENABLED: undefined,
    });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.LOG_LEVEL).toBe('info');
    expect(env.LOG_DIR).toBe('logs');
    expect(env.LOG_TO_FILE_DEV).toBe(false);
    expect(env.NEXT_PUBLIC_LOGFLARE_INTEGRATION_ENABLED).toBe(false);
  });

  it('handles boolean strings in logger env variables', async () => {
    setEnv({
      LOG_TO_FILE_DEV: 'false',
      LOG_TO_FILE_PROD: 'true',
      NEXT_PUBLIC_LOGFLARE_INTEGRATION_ENABLED: 'true',
    });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.LOG_TO_FILE_DEV).toBe(false);
    expect(env.LOG_TO_FILE_PROD).toBe(true);
    expect(env.NEXT_PUBLIC_LOGFLARE_INTEGRATION_ENABLED).toBe(true);
  });

  it('handles boolean values in logger env variables', async () => {
    setEnv({
      LOG_TO_FILE_DEV: true,
      LOG_TO_FILE_PROD: false,
      NEXT_PUBLIC_LOGFLARE_INTEGRATION_ENABLED: true,
    });
    vi.resetModules();

    const env = await loadEnv();

    expect(env.LOG_TO_FILE_DEV).toBe(true);
    expect(env.LOG_TO_FILE_PROD).toBe(false);
    expect(env.NEXT_PUBLIC_LOGFLARE_INTEGRATION_ENABLED).toBe(true);
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
});
