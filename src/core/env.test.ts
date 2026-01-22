// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

const loadEnv = async () => {
  const mod = await import('./env');
  return mod.env;
};

const setEnv = (vars: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
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
