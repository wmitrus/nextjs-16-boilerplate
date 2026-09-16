import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Codex P2 follow-up — `runMigrate` previously invoked bare `drizzle-kit
 * migrate`, so `pnpm db:dev:migrate` / `db:test:migrate` / `db:dev:reset` /
 * `db:test:reset` could report success after migration 0023 while
 * `idx_audit_events_organization_occurred` stayed absent and both deferred
 * FKs stayed NOT VALID. These tests pin that `runMigrate` now routes
 * through the SAME convergence-aware executor as `pnpm db:pglite:migrate`
 * (`src/core/db/migrate-cli.ts` -> `runMigrations`) — one implementation,
 * reused, not a second executor — and that the already-guarded local
 * container URL cannot be overridden by a stale/inherited remote
 * `DATABASE_URL_UNPOOLED`. `dev` and `test` share this exact same code
 * path (only the resolved+guarded URL differs), so one set of assertions on
 * `runMigrate` covers both `db:dev:migrate` and `db:test:migrate`, and
 * both reset paths (which call `runSchemaReset` -> `runMigrate` -> `runSeed`
 * in that order, per `scripts/db-ops.mjs`) converge before seeding.
 */

const mockSpawnSync = vi.hoisted(() =>
  vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: { env: Record<string, string> },
    ) => ({ status: 0, error: null }),
  ),
);

vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  return {
    ...actual,
    spawnSync: mockSpawnSync,
    default: { ...actual.default, spawnSync: mockSpawnSync },
  };
});

import { runMigrate } from './db-ops.mjs';

const DEV_URL = 'postgres://postgres:postgres@127.0.0.1:5432/app_dev';
const TEST_URL = 'postgres://postgres:postgres@127.0.0.1:5433/app_test';

describe('db-ops runMigrate', () => {
  afterEach(() => {
    mockSpawnSync.mockClear();
    vi.unstubAllEnvs();
  });

  it('routes through migrate-cli.ts (convergence-aware), never bare drizzle-kit migrate', () => {
    runMigrate(DEV_URL);

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawnSync.mock.calls[0]!;
    expect(cmd).toBe('pnpm');
    expect(args).toEqual(['exec', 'tsx', 'src/core/db/migrate-cli.ts']);
    expect(args.join(' ')).not.toContain('drizzle-kit');
  });

  it('works identically for the test target — db:test:migrate reaches the same convergence-aware path', () => {
    runMigrate(TEST_URL);

    const [, args] = mockSpawnSync.mock.calls[0]!;
    expect(args).toEqual(['exec', 'tsx', 'src/core/db/migrate-cli.ts']);
  });

  it('pins DATABASE_URL_UNPOOLED to the SAME guarded local URL: a stale/inherited remote UNPOOLED can never win', () => {
    vi.stubEnv(
      'DATABASE_URL_UNPOOLED',
      'postgresql://prod:pw@ep-prod-pooler.us-east-1.aws.neon.tech/app',
    );

    runMigrate(DEV_URL);

    const [, , opts] = mockSpawnSync.mock.calls[0]!;
    expect(opts.env.DATABASE_URL).toBe(DEV_URL);
    expect(opts.env.DATABASE_URL_UNPOOLED).toBe(DEV_URL);
  });

  it('sets DB_DRIVER=postgres / DB_PROVIDER=drizzle so migrate-cli.ts runs the postgres + AUD·A convergence path', () => {
    runMigrate(DEV_URL);

    const [, , opts] = mockSpawnSync.mock.calls[0]!;
    expect(opts.env.DB_DRIVER).toBe('postgres');
    expect(opts.env.DB_PROVIDER).toBe('drizzle');
  });
});
