import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    AUTH_PROVIDER: 'authjs' as 'authjs' | 'clerk',
    CLERK_SECRET_KEY: undefined as string | undefined,
    DATABASE_URL: undefined as string | undefined,
    DB_DRIVER: undefined as 'pglite' | 'postgres' | undefined,
    DB_PROVIDER: undefined as 'drizzle' | 'prisma' | undefined,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined as string | undefined,
    NODE_ENV: 'production' as string | undefined,
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
  mocks.env.DB_DRIVER = 'postgres';
  mocks.env.DB_PROVIDER = 'drizzle';
  mocks.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = undefined;
  mocks.env.NODE_ENV = 'production';
  mocks.env.VERCEL_ENV = 'preview';
  mocks.env.DATABASE_URL =
    'postgresql://user:password@ep-test.us-east-2.aws.neon.tech/database?sslmode=require';
});

describe('Preview canary database binding route', () => {
  it('returns the runtime database hostname, database name, and resolved DB provider/driver in Preview', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      authProvider: 'authjs',
      clerkKeysTest: null,
      databaseHost: 'ep-test.us-east-2.aws.neon.tech',
      databaseName: 'database',
      dbDriver: 'postgres',
      dbProvider: 'drizzle',
    });
  });

  it('resolves dbDriver via the same defaulting bootstrap uses, not a raw env read', async () => {
    // DB_DRIVER unset + production -> postgres (bootstrap's default rule),
    // proving this route uses the shared resolver rather than reading
    // DB_DRIVER directly (which would be undefined here).
    mocks.env.DB_DRIVER = undefined;
    expect(await (await GET()).json()).toMatchObject({
      dbDriver: 'postgres',
    });
  });

  it('resolves dbDriver to pglite outside production when unset', async () => {
    mocks.env.DB_DRIVER = undefined;
    mocks.env.NODE_ENV = 'development';
    expect(await (await GET()).json()).toMatchObject({
      dbDriver: 'pglite',
    });
  });

  it('reports an explicit prisma provider', async () => {
    mocks.env.DB_PROVIDER = 'prisma';
    expect(await (await GET()).json()).toMatchObject({
      dbProvider: 'prisma',
    });
  });

  it('fails closed for an invalid provider/driver combination (prisma + pglite)', async () => {
    mocks.env.DB_PROVIDER = 'prisma';
    mocks.env.DB_DRIVER = 'pglite';
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"Unavailable"}');
  });

  it('correctly decodes a percent-encoded database name', async () => {
    mocks.env.DATABASE_URL =
      'postgresql://user:password@ep-test.us-east-2.aws.neon.tech/preview%2Fozi-78';
    expect(await (await GET()).json()).toMatchObject({
      databaseName: 'preview/ozi-78',
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
      databaseName: 'database',
      dbDriver: 'postgres',
      dbProvider: 'drizzle',
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
      databaseName: 'database',
      dbDriver: 'postgres',
      dbProvider: 'drizzle',
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
    'postgresql:///db',
    'postgres:///db',
    'postgresql://ep-test.us-east-2.aws.neon.tech/',
    'postgresql://ep-test.us-east-2.aws.neon.tech',
    'postgresql://ep-test.us-east-2.aws.neon.tech/%',
    `postgresql://ep-test.us-east-2.aws.neon.tech/${'a'.repeat(64)}`,
    // 32 * 'ą' (2 UTF-8 bytes each) = 32 JS characters but 64 UTF-8 bytes --
    // must fail closed on byte length, not JS .length.
    `postgresql://ep-test.us-east-2.aws.neon.tech/${'ą'.repeat(32)}`,
  ])('fails safely for invalid database configuration', async (databaseUrl) => {
    mocks.env.DATABASE_URL = databaseUrl;
    const response = await GET();
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(body).toBe('{"error":"Unavailable"}');
    expect(body).not.toContain('password');
    expect(body).not.toContain('database');
  });
});
