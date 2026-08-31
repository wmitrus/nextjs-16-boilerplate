import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    AUTH_PROVIDER: 'authjs' as 'authjs' | 'clerk',
    CLERK_SECRET_KEY: undefined as string | undefined,
    DATABASE_URL: undefined as string | undefined,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined as string | undefined,
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
  mocks.env.CLERK_SECRET_KEY = undefined;
  mocks.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = undefined;
  mocks.env.VERCEL_ENV = 'preview';
  mocks.env.DATABASE_URL =
    'postgresql://user:password@ep-test.us-east-2.aws.neon.tech/database?sslmode=require';
});

describe('Preview canary database binding route', () => {
  it('returns only the runtime database hostname in Preview', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      authProvider: 'authjs',
      clerkKeysTest: null,
      databaseHost: 'ep-test.us-east-2.aws.neon.tech',
    });
  });

  it('returns 404 outside Preview', async () => {
    mocks.env.VERCEL_ENV = 'production';
    expect((await GET()).status).toBe(404);
  });

  it.each(['development', undefined, 'other'])(
    'returns 404 for non-Preview environment',
    async (environment) => {
      mocks.env.VERCEL_ENV = environment;
      expect((await GET()).status).toBe(404);
    },
  );

  it('preserves the pooled hostname', async () => {
    mocks.env.DATABASE_URL =
      'postgres://user:password@ep-test-pooler.us-east-2.aws.neon.tech/database';
    expect(await (await GET()).json()).toEqual({
      authProvider: 'authjs',
      clerkKeysTest: null,
      databaseHost: 'ep-test-pooler.us-east-2.aws.neon.tech',
    });
  });

  it('returns only Clerk test-key status, never key material', async () => {
    mocks.env.AUTH_PROVIDER = 'clerk';
    mocks.env.CLERK_SECRET_KEY = 'sk_test_runtime-secret';
    mocks.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_runtime-public';

    const body = await (await GET()).text();
    expect(JSON.parse(body)).toEqual({
      authProvider: 'clerk',
      clerkKeysTest: true,
      databaseHost: 'ep-test.us-east-2.aws.neon.tech',
    });
    expect(body).not.toContain('sk_test_runtime-secret');
    expect(body).not.toContain('pk_test_runtime-public');
    expect(body).not.toContain('postgresql://');
  });

  it('reports false for missing or non-test Clerk keys', async () => {
    mocks.env.AUTH_PROVIDER = 'clerk';
    mocks.env.CLERK_SECRET_KEY = 'sk_live_runtime-secret';
    mocks.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = undefined;

    expect(await (await GET()).json()).toMatchObject({
      authProvider: 'clerk',
      clerkKeysTest: false,
    });
  });

  it.each([
    undefined,
    ' ',
    'not a URL',
    'http://user:password@example.test/database',
    'https://user:password@example.test/database',
  ])('fails safely for invalid database configuration', async (databaseUrl) => {
    mocks.env.DATABASE_URL = databaseUrl;
    const body = await (await GET()).text();
    expect(body).toBe('{"error":"Unavailable"}');
    expect(body).not.toContain('password');
    expect(body).not.toContain('database');
  });
});
