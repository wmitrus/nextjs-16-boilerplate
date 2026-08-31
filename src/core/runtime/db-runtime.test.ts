import { describe, expect, it } from 'vitest';

import { resolveEffectiveDbRuntime } from './db-runtime';

describe('resolveEffectiveDbRuntime', () => {
  it('defaults dbProvider to drizzle when unset', () => {
    expect(
      resolveEffectiveDbRuntime({
        databaseUrl: undefined,
        dbDriver: 'pglite',
        dbProvider: undefined,
        nodeEnv: 'development',
      }).provider,
    ).toBe('drizzle');
  });

  it('resolves an explicit prisma provider', () => {
    expect(
      resolveEffectiveDbRuntime({
        databaseUrl: 'postgresql://host/db',
        dbDriver: 'postgres',
        dbProvider: 'prisma',
        nodeEnv: 'production',
      }).provider,
    ).toBe('prisma');
  });

  it('resolves an explicit postgres driver', () => {
    expect(
      resolveEffectiveDbRuntime({
        databaseUrl: 'postgresql://host/db',
        dbDriver: 'postgres',
        dbProvider: 'drizzle',
        nodeEnv: 'development',
      }).driver,
    ).toBe('postgres');
  });

  it('resolves an explicit pglite driver', () => {
    expect(
      resolveEffectiveDbRuntime({
        databaseUrl: undefined,
        dbDriver: 'pglite',
        dbProvider: 'drizzle',
        nodeEnv: 'production',
      }).driver,
    ).toBe('pglite');
  });

  it('defaults the driver to postgres in production when unset', () => {
    expect(
      resolveEffectiveDbRuntime({
        databaseUrl: 'postgresql://host/db',
        dbDriver: undefined,
        dbProvider: 'drizzle',
        nodeEnv: 'production',
      }).driver,
    ).toBe('postgres');
  });

  it.each(['development', 'test', undefined])(
    'defaults the driver to pglite outside production when unset (nodeEnv=%s)',
    (nodeEnv) => {
      expect(
        resolveEffectiveDbRuntime({
          databaseUrl: undefined,
          dbDriver: undefined,
          dbProvider: 'drizzle',
          nodeEnv,
        }).driver,
      ).toBe('pglite');
    },
  );

  it('throws for DB_PROVIDER=prisma with DB_DRIVER=pglite', () => {
    expect(() =>
      resolveEffectiveDbRuntime({
        databaseUrl: undefined,
        dbDriver: 'pglite',
        dbProvider: 'prisma',
        nodeEnv: 'development',
      }),
    ).toThrow('DB_PROVIDER=prisma cannot be used with DB_DRIVER=pglite');
  });

  it('throws for DB_PROVIDER=prisma in production without DATABASE_URL', () => {
    expect(() =>
      resolveEffectiveDbRuntime({
        databaseUrl: undefined,
        dbDriver: undefined,
        dbProvider: 'prisma',
        nodeEnv: 'production',
      }),
    ).toThrow('DB_PROVIDER=prisma in production requires DATABASE_URL');
  });

  it('does not throw for DB_PROVIDER=prisma in production with DATABASE_URL set', () => {
    expect(() =>
      resolveEffectiveDbRuntime({
        databaseUrl: 'postgresql://host/db',
        dbDriver: undefined,
        dbProvider: 'prisma',
        nodeEnv: 'production',
      }),
    ).not.toThrow();
  });

  it('does not throw for DB_PROVIDER=prisma outside production without DATABASE_URL', () => {
    expect(() =>
      resolveEffectiveDbRuntime({
        databaseUrl: undefined,
        dbDriver: undefined,
        dbProvider: 'prisma',
        nodeEnv: 'development',
      }),
    ).not.toThrow();
  });
});
