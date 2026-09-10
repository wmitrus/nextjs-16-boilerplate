import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PooledConnectionRejectedError } from '@/core/db/post-migrate-steps';
import type { DbConfig, DrizzleDb } from '@/core/db/types';

import {
  resolveMigrationTarget,
  runMigrateCli,
  type MigrateCliDeps,
} from './migrate-cli';

/**
 * OZI-71 AUD·A — Codex P2: one database target for migration AND convergence.
 *
 * `migrate-cli.ts` previously resolved the migrator URL (`DATABASE_URL`) and
 * the AUD·A convergence URL (`DATABASE_URL_UNPOOLED || DATABASE_URL`)
 * independently, so with the two env vars pointing at different branches the
 * journaled migration 0023 could commit on database A while the deferred
 * `CREATE INDEX CONCURRENTLY` / FK `VALIDATE` ran on database B. These tests
 * pin the single-canonical-target contract and prove the orchestration hands
 * the SAME resolved URL to `createDb` and `runMigrations`.
 */

const DIRECT_A = 'postgresql://u:p@ep-a.us-east-1.aws.neon.tech/db_a';
const DIRECT_B = 'postgresql://u:p@ep-b.us-east-1.aws.neon.tech/db_b';
const POOLED = 'postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/app';

let savedUrl: string | undefined;
let savedUnpooled: string | undefined;
let savedDriver: string | undefined;
let savedProvider: string | undefined;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  savedUrl = process.env.DATABASE_URL;
  savedUnpooled = process.env.DATABASE_URL_UNPOOLED;
  savedDriver = process.env.DB_DRIVER;
  savedProvider = process.env.DB_PROVIDER;
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_UNPOOLED;
  delete process.env.DB_DRIVER;
  delete process.env.DB_PROVIDER;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  if (savedUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedUrl;
  if (savedUnpooled === undefined) delete process.env.DATABASE_URL_UNPOOLED;
  else process.env.DATABASE_URL_UNPOOLED = savedUnpooled;
  if (savedDriver === undefined) delete process.env.DB_DRIVER;
  else process.env.DB_DRIVER = savedDriver;
  if (savedProvider === undefined) delete process.env.DB_PROVIDER;
  else process.env.DB_PROVIDER = savedProvider;
});

describe('resolveMigrationTarget (single canonical target)', () => {
  it('A: postgres with both vars set to DIFFERENT values -> DATABASE_URL_UNPOOLED wins', () => {
    process.env.DATABASE_URL = DIRECT_A;
    process.env.DATABASE_URL_UNPOOLED = DIRECT_B;
    expect(resolveMigrationTarget('postgres')).toBe(DIRECT_B);
  });

  it('B: postgres with only DATABASE_URL_UNPOOLED -> that URL', () => {
    process.env.DATABASE_URL_UNPOOLED = DIRECT_B;
    expect(resolveMigrationTarget('postgres')).toBe(DIRECT_B);
  });

  it('C: postgres with only DATABASE_URL (direct) -> that URL', () => {
    process.env.DATABASE_URL = DIRECT_A;
    expect(resolveMigrationTarget('postgres')).toBe(DIRECT_A);
  });

  it('D: postgres pooled canonical target (UNPOOLED absent, DATABASE_URL pooled) -> throws', () => {
    process.env.DATABASE_URL = POOLED;
    expect(() => resolveMigrationTarget('postgres')).toThrow(
      PooledConnectionRejectedError,
    );
    expect(() => resolveMigrationTarget('postgres')).toThrow(
      /DIRECT \(unpooled\)/i,
    );
  });

  it('D-inverse: DATABASE_URL pooled but DATABASE_URL_UNPOOLED direct -> canonical is the direct UNPOOLED', () => {
    process.env.DATABASE_URL = POOLED;
    process.env.DATABASE_URL_UNPOOLED = DIRECT_B;
    expect(resolveMigrationTarget('postgres')).toBe(DIRECT_B);
  });

  it('E: postgres with neither var -> throws before anything is created', () => {
    expect(() => resolveMigrationTarget('postgres')).toThrow(
      /DATABASE_URL_UNPOOLED or DATABASE_URL is required/i,
    );
  });

  it('F: pglite returns DATABASE_URL as-is (optional) and never asserts direct', () => {
    expect(resolveMigrationTarget('pglite')).toBeUndefined();
    // A pooler marker is irrelevant for PGlite — no assertion, returned as-is.
    process.env.DATABASE_URL = POOLED;
    expect(resolveMigrationTarget('pglite')).toBe(POOLED);
  });

  it('trims whitespace and treats a blank UNPOOLED as absent', () => {
    process.env.DATABASE_URL_UNPOOLED = '   ';
    process.env.DATABASE_URL = `  ${DIRECT_A}  `;
    expect(resolveMigrationTarget('postgres')).toBe(DIRECT_A);
  });
});

function makeDeps() {
  const close = vi.fn(async () => {});
  const db = { __db: true } as unknown as DrizzleDb;
  const createDb = vi.fn((_config: DbConfig) => ({ db, close }));
  const runMigrations = vi.fn(
    async (_db: unknown, _driver: unknown, _options?: unknown) => {},
  );
  const deps: MigrateCliDeps = {
    createDb: createDb as unknown as MigrateCliDeps['createDb'],
    runMigrations: runMigrations as unknown as MigrateCliDeps['runMigrations'],
  };
  return { close, db, createDb, runMigrations, deps };
}

describe('runMigrateCli orchestration (same URL for migration + convergence)', () => {
  it('postgres: passes the SAME resolved URL to createDb and runMigrations — migrationTarget === convergenceTarget', async () => {
    process.env.DB_DRIVER = 'postgres';
    process.env.DATABASE_URL = DIRECT_A; // database-A
    process.env.DATABASE_URL_UNPOOLED = DIRECT_B; // database-B (canonical)
    const h = makeDeps();

    await expect(runMigrateCli(h.deps)).resolves.toEqual({
      provider: 'drizzle',
      driver: 'postgres',
    });

    expect(h.createDb).toHaveBeenCalledTimes(1);
    const createdWith = h.createDb.mock.calls[0]![0];
    expect(createdWith).toEqual({
      provider: 'drizzle',
      driver: 'postgres',
      url: DIRECT_B,
    });

    expect(h.runMigrations).toHaveBeenCalledTimes(1);
    const rmCall = h.runMigrations.mock.calls[0]!;
    expect(rmCall[0]).toBe(h.db);
    expect(rmCall[1]).toBe('postgres');
    expect(rmCall[2]).toEqual({ postgresUrl: DIRECT_B });

    // The invariant, asserted directly: no migrate-A / converge-B split.
    expect(createdWith.url).toBe(
      (rmCall[2] as { postgresUrl?: string }).postgresUrl,
    );
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('postgres: only DATABASE_URL (direct) -> both migration and convergence use DATABASE_URL', async () => {
    process.env.DB_DRIVER = 'postgres';
    process.env.DATABASE_URL = DIRECT_A;
    const h = makeDeps();

    await runMigrateCli(h.deps);

    expect(h.createDb.mock.calls[0]![0].url).toBe(DIRECT_A);
    expect(h.runMigrations.mock.calls[0]![2]).toEqual({
      postgresUrl: DIRECT_A,
    });
  });

  it('postgres: pooled canonical target fails CLOSED before createDb / runMigrations', async () => {
    process.env.DB_DRIVER = 'postgres';
    process.env.DATABASE_URL = POOLED;
    const h = makeDeps();

    await expect(runMigrateCli(h.deps)).rejects.toThrow(/DIRECT \(unpooled\)/i);

    expect(h.createDb).not.toHaveBeenCalled();
    expect(h.runMigrations).not.toHaveBeenCalled();
  });

  it('postgres: missing URL fails before createDb', async () => {
    process.env.DB_DRIVER = 'postgres';
    const h = makeDeps();

    await expect(runMigrateCli(h.deps)).rejects.toThrow(
      /DATABASE_URL_UNPOOLED or DATABASE_URL is required/i,
    );

    expect(h.createDb).not.toHaveBeenCalled();
    expect(h.runMigrations).not.toHaveBeenCalled();
  });

  it('pglite: unchanged — createDb gets DATABASE_URL (optional), runMigrations gets no postgresUrl', async () => {
    process.env.DB_DRIVER = 'pglite';
    const h = makeDeps();

    await runMigrateCli(h.deps);

    expect(h.createDb.mock.calls[0]![0]).toEqual({
      provider: 'drizzle',
      driver: 'pglite',
      url: undefined,
    });
    expect(h.runMigrations.mock.calls[0]![2]).toEqual({
      postgresUrl: undefined,
    });
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('pglite: a DATABASE_URL is passed through, still no convergence postgresUrl', async () => {
    process.env.DB_DRIVER = 'pglite';
    process.env.DATABASE_URL = 'file:./pglite-data';
    const h = makeDeps();

    await runMigrateCli(h.deps);

    expect(h.createDb.mock.calls[0]![0].url).toBe('file:./pglite-data');
    expect(h.runMigrations.mock.calls[0]![2]).toEqual({
      postgresUrl: undefined,
    });
  });

  it('DB_PROVIDER=prisma throws before createDb', async () => {
    process.env.DB_PROVIDER = 'prisma';
    process.env.DB_DRIVER = 'pglite';
    const h = makeDeps();

    await expect(runMigrateCli(h.deps)).rejects.toThrow(
      /Prisma migration provider is not implemented/i,
    );
    expect(h.createDb).not.toHaveBeenCalled();
  });
});
