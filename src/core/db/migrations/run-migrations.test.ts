import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDb } from '@/core/db/types';

import { runMigrations } from './run-migrations';

const pgliteMigrateMock = vi.hoisted(() => vi.fn());
const postgresMigrateMock = vi.hoisted(() => vi.fn());

vi.mock('drizzle-orm/pglite/migrator', () => ({
  migrate: pgliteMigrateMock,
}));

vi.mock('drizzle-orm/postgres-js/migrator', () => ({
  migrate: postgresMigrateMock,
}));

// The OZI-71 AUD·A post-migrate step introspects the DB after the migrator;
// an empty result set makes it a clean no-op (columns "absent", FKs "missing").
const emptyResultDb = () =>
  ({ execute: vi.fn().mockResolvedValue([]) }) as unknown as DrizzleDb;

describe('runMigrations', () => {
  afterEach(() => {
    delete process.env.NEXT_RUNTIME;
    pgliteMigrateMock.mockReset();
    postgresMigrateMock.mockReset();
  });

  it('runs pglite migrator for pglite driver', async () => {
    const db = emptyResultDb();

    await runMigrations(db, 'pglite');

    expect(pgliteMigrateMock).toHaveBeenCalledTimes(1);
    expect(postgresMigrateMock).not.toHaveBeenCalled();
  });

  it('runs postgres migrator for postgres driver', async () => {
    const db = emptyResultDb();

    await runMigrations(db, 'postgres');

    expect(postgresMigrateMock).toHaveBeenCalledTimes(1);
    expect(pgliteMigrateMock).not.toHaveBeenCalled();
  });

  it('throws in edge runtime before running any migrator', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    const db = {} as DrizzleDb;

    await expect(runMigrations(db, 'postgres')).rejects.toThrow(
      'Migrations are not supported in Edge runtime',
    );

    expect(postgresMigrateMock).not.toHaveBeenCalled();
    expect(pgliteMigrateMock).not.toHaveBeenCalled();
  });
});
