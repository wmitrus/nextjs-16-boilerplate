import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    AUTH_PROVIDER: 'authjs' as string,
    TENANCY_MODE: 'single' as 'org' | 'personal' | 'single',
    TENANT_CONTEXT_SOURCE: undefined as 'db' | 'provider' | undefined,
    VERCEL_ENV: undefined as string | undefined,
  },
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('@/core/env', () => ({ env: mocks.env }));

import { GET } from './route';

beforeEach(() => {
  mocks.env.AUTH_PROVIDER = 'authjs';
  mocks.env.TENANCY_MODE = 'single';
  mocks.env.TENANT_CONTEXT_SOURCE = undefined;
  mocks.env.VERCEL_ENV = 'production';
});

describe('Rollback candidate environment-contract route', () => {
  it('returns bounded evidence in Production', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'authProvider',
      'contractVersion',
      'fingerprint',
    ]);
    expect(body).toMatchObject({
      authProvider: 'authjs',
      contractVersion: 'v1',
    });
    expect(body.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(['preview', 'development', undefined, 'other'])(
    'returns 404 outside Production',
    async (vercelEnv) => {
      mocks.env.VERCEL_ENV = vercelEnv;
      expect((await GET()).status).toBe(404);
    },
  );

  it('fails closed for an unmodeled AUTH_PROVIDER rather than fingerprinting it', async () => {
    mocks.env.AUTH_PROVIDER = 'supabase';
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"Unavailable"}');
  });

  it('never contains raw env keys, secrets, or database identifiers', async () => {
    const body = await (await GET()).text();
    expect(body).not.toMatch(/database|secret|token|key|url/i);
  });
});
