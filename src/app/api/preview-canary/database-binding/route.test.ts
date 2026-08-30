import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});

import { GET } from './route';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Preview canary database binding route', () => {
  it('returns only the runtime database hostname in Preview', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.DATABASE_URL =
      'postgresql://user:password@ep-test-pooler.us-east-2.aws.neon.tech/database?sslmode=require';

    const response = await GET();

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      databaseHost: 'ep-test-pooler.us-east-2.aws.neon.tech',
    });
  });

  it.each(['production', undefined])(
    'returns 404 outside Preview: %s',
    async (environment) => {
      process.env.VERCEL_ENV = environment;
      process.env.DATABASE_URL =
        'postgresql://user:password@ep-test.neon.tech/database';
      expect((await GET()).status).toBe(404);
    },
  );

  it.each([
    undefined,
    'not a URL',
    'https://user:password@example.test/database',
  ])('fails safely for invalid database configuration', async (databaseUrl) => {
    process.env.VERCEL_ENV = 'preview';
    if (databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = databaseUrl;
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('password');
  });
});
