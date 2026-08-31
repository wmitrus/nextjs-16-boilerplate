import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    AUTH_PROVIDER: 'authjs' as string,
    DATABASE_URL: undefined as string | undefined,
    DEFAULT_TENANT_ID: undefined as string | undefined,
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

const validTenantId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  mocks.env.AUTH_PROVIDER = 'authjs';
  mocks.env.DATABASE_URL =
    'postgresql://user:password@ep-prod.us-east-2.aws.neon.tech/app_production';
  mocks.env.DEFAULT_TENANT_ID = validTenantId;
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
      contractVersion: 'v2',
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

  it.each([
    ['missing DATABASE_URL', undefined],
    ['malformed DATABASE_URL', 'not a url'],
    ['non-Postgres protocol', 'mysql://host/db'],
    ['empty database name', 'postgresql://host/'],
  ])('fails closed for %s', async (_label, databaseUrl) => {
    mocks.env.DATABASE_URL = databaseUrl;
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"Unavailable"}');
  });

  it.each([
    ['missing DEFAULT_TENANT_ID', undefined],
    ['malformed DEFAULT_TENANT_ID', 'not-a-uuid'],
  ])('fails closed in single-tenant mode for %s', async (_label, tenantId) => {
    mocks.env.TENANCY_MODE = 'single';
    mocks.env.DEFAULT_TENANT_ID = tenantId;
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"Unavailable"}');
  });

  it('returns bounded evidence in org mode even without DEFAULT_TENANT_ID', async () => {
    mocks.env.TENANCY_MODE = 'org';
    mocks.env.TENANT_CONTEXT_SOURCE = 'provider';
    mocks.env.DEFAULT_TENANT_ID = undefined;
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('never contains raw env keys, secrets, or database identifiers', async () => {
    const body = await (await GET()).text();
    expect(body).not.toMatch(/database|secret|token|key|url/i);
  });

  it('never exposes databaseHost/databaseName/defaultTenantId/DATABASE_URL', async () => {
    const body = await (await GET()).text();
    expect(body).not.toContain('ep-prod.us-east-2.aws.neon.tech');
    expect(body).not.toContain('app_production');
    expect(body).not.toContain(validTenantId);
  });
});
