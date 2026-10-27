/** @vitest-environment node */
import type { Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  R4A_COMPACT_INDEX_LOCK,
  R4aCompactIndexAlreadyRunningError,
  R4aCompactIndexExecutorError,
  r4aExecutorRunnerFromPostgres,
  runR4aCompactIndexExecutor,
  type R4aCompactIndexExecutorRunner,
} from './r4a-compact-index-executor';
import { inspectR4aCompactIndex } from './r4a-compact-index-inspection';

import {
  startIsolatedPostgres,
  type IsolatedPostgres,
} from '@/testing/db/isolated-postgres';

/**
 * CREATE/DROP INDEX CONCURRENTLY and VALIDATE CONSTRAINT cannot share the DB
 * CI global fixture: they persist outside a transaction. This file owns a
 * separate disposable Testcontainers database so its required DDL cannot
 * affect tests that assert migration-installed NOT VALID constraints.
 */
const compactIndexes = [
  'uq_feature_flags_key_organization_compact',
  'uq_audit_log_settings_category_organization_compact',
] as const;
const retainedIndexes = [
  'uq_feature_flags_key_tenant',
  'uq_feature_flags_key_organization_canonical',
  'uq_feature_flags_key_intentional_global',
  'uq_audit_log_settings_category_tenant',
  'uq_audit_log_settings_category_organization_canonical',
  'uq_audit_log_settings_category_intentional_global',
] as const;

let client: Sql | undefined;
let database: IsolatedPostgres | undefined;
let testUrl: string | undefined;

function runner(
  connection: Sql,
  statements: string[] = [],
  params: (readonly string[])[] = [],
): R4aCompactIndexExecutorRunner {
  // Records traffic around the production adapter the CLI uses.
  const adapter = r4aExecutorRunnerFromPostgres(connection);
  return {
    query: async <T>(statement: string) => {
      statements.push(statement);
      return adapter.query<T>(statement);
    },
    queryWithParams: async <T>(
      statement: string,
      values: readonly string[],
    ) => {
      statements.push(statement);
      params.push(values);
      return adapter.queryWithParams<T>(statement, values);
    },
  };
}

async function openClient(): Promise<Sql> {
  const { default: postgres } = await import('postgres');
  if (!testUrl)
    throw new Error('Isolated PostgreSQL test database is unavailable');
  return postgres(testUrl, { max: 1, prepare: false });
}

async function dropCompactRelations(connection: Sql): Promise<void> {
  for (const name of compactIndexes) {
    const rows = await connection.unsafe<{ relkind: string }[]>(
      `SELECT relkind FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = '${name}'`,
    );
    if (rows[0]?.relkind === 'i')
      await connection.unsafe(
        `DROP INDEX CONCURRENTLY IF EXISTS public.${name}`,
      );
    else if (rows[0]?.relkind === 'v')
      await connection.unsafe(`DROP VIEW IF EXISTS public.${name}`);
  }
}

async function settleDisposition(connection: Sql): Promise<void> {
  await connection.unsafe('DELETE FROM public.feature_flags');
  await connection.unsafe('DELETE FROM public.audit_log_settings');
  await connection.unsafe(
    'ALTER TABLE public.feature_flags VALIDATE CONSTRAINT ck_feature_flags_ownership_state_org',
  );
  await connection.unsafe(
    'ALTER TABLE public.audit_log_settings VALIDATE CONSTRAINT ck_audit_log_settings_ownership_state_org',
  );
}

async function resetFixture(connection: Sql): Promise<void> {
  await connection.unsafe('RESET lock_timeout');
  await connection.unsafe('RESET statement_timeout');
  await dropCompactRelations(connection);
  await settleDisposition(connection);
}

async function indexState(connection: Sql, name: string) {
  const rows = await connection.unsafe<
    {
      readonly valid: boolean;
      readonly ready: boolean;
      readonly live: boolean;
      readonly nullsNotDistinct: boolean;
      readonly definition: string;
    }[]
  >(
    `SELECT i.indisvalid AS valid, i.indisready AS ready, i.indislive AS live, i.indnullsnotdistinct AS "nullsNotDistinct", pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = '${name}'`,
  );
  return rows[0];
}

/** Leaves an exact-identity compact index INVALID, not ready and live. */
async function failCompactBuild(connection: Sql): Promise<void> {
  await connection.unsafe(
    "INSERT INTO public.feature_flags (key, tenant_id, ownership_state) VALUES ('r4a-invalid', 'one', 'intentional_global'), ('r4a-invalid', 'two', 'unresolved_legacy')",
  );
  await expect(
    connection.unsafe(
      'CREATE UNIQUE INDEX CONCURRENTLY uq_feature_flags_key_organization_compact ON public.feature_flags USING btree (key, organization_id) NULLS NOT DISTINCT',
    ),
  ).rejects.toThrow();
  expect(
    await indexState(connection, 'uq_feature_flags_key_organization_compact'),
  ).toMatchObject({ valid: false, ready: false, live: true });
}

/** Re-adds the identical ownership CHECK as NOT VALID; resetFixture re-validates it. */
async function unvalidateOwnershipCheck(connection: Sql): Promise<void> {
  const [constraint] = await connection.unsafe<{ definition: string }[]>(
    "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'public.feature_flags'::regclass AND conname = 'ck_feature_flags_ownership_state_org'",
  );
  await connection.unsafe(
    `ALTER TABLE public.feature_flags DROP CONSTRAINT ck_feature_flags_ownership_state_org, ADD CONSTRAINT ck_feature_flags_ownership_state_org ${constraint!.definition} NOT VALID`,
  );
}

async function sessionTimeouts(connection: Sql) {
  const [row] = await connection.unsafe<
    { lock_timeout: string; statement_timeout: string }[]
  >(
    "SELECT current_setting('lock_timeout') AS lock_timeout, current_setting('statement_timeout') AS statement_timeout",
  );
  return row;
}

const RESTORE_TIMEOUTS_SQL =
  "SELECT set_config('lock_timeout', $1, false), set_config('statement_timeout', $2, false)";

const isIndexDdl = (statement: string) =>
  /^(CREATE UNIQUE INDEX|DROP INDEX)/.test(statement);

async function retainedSnapshot(connection: Sql) {
  return connection.unsafe<{ readonly name: string; readonly kind: string }[]>(
    `SELECT c.relname AS name, c.relkind AS kind FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN (${retainedIndexes.map((name) => `'${name}'`).join(', ')}) ORDER BY c.relname`,
  );
}

beforeAll(async () => {
  database = await startIsolatedPostgres();
  testUrl = database.url;
  const parsed = new URL(testUrl);
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost')
    throw new Error(
      'R4a executor DB tests require local Testcontainers PostgreSQL',
    );
  client = await openClient();
  await resetFixture(client);
});

afterEach(async () => {
  if (client) await resetFixture(client);
});

afterAll(async () => {
  await client?.end({ timeout: 5 });
  await database?.stop();
});

describe('r4a compact-index executor — isolated real PostgreSQL', () => {
  it('creates the feature_flags compact index concurrently and proves NULLS NOT DISTINCT in pg_catalog', async () => {
    const statements: string[] = [];
    const result = await runR4aCompactIndexExecutor(
      runner(client!, statements),
      ['feature_flags'],
    );

    expect(result).toMatchObject([
      { table: 'feature_flags', action: 'created' },
    ]);
    expect(statements).toContain(
      'CREATE UNIQUE INDEX CONCURRENTLY "uq_feature_flags_key_organization_compact" ON "public"."feature_flags" USING btree ("key", "organization_id") NULLS NOT DISTINCT',
    );
    await expect(
      indexState(client!, 'uq_feature_flags_key_organization_compact'),
    ).resolves.toMatchObject({
      valid: true,
      ready: true,
      live: true,
      nullsNotDistinct: true,
    });
  });

  it('creates the audit_log_settings compact index concurrently', async () => {
    const statements: string[] = [];
    const result = await runR4aCompactIndexExecutor(
      runner(client!, statements),
      ['audit_log_settings'],
    );

    expect(result).toMatchObject([
      { table: 'audit_log_settings', action: 'created' },
    ]);
    expect(
      statements.some((statement) =>
        statement.startsWith('CREATE UNIQUE INDEX CONCURRENTLY'),
      ),
    ).toBe(true);
    await expect(
      indexState(
        client!,
        'uq_audit_log_settings_category_organization_compact',
      ),
    ).resolves.toMatchObject({ valid: true, ready: true, live: true });
  });

  it('is idempotent and preserves every retained legacy/semantic index', async () => {
    const before = await retainedSnapshot(client!);
    await runR4aCompactIndexExecutor(runner(client!));
    const statements: string[] = [];
    const second = await runR4aCompactIndexExecutor(
      runner(client!, statements),
    );

    expect(second.map((result) => result.action)).toEqual(['no-op', 'no-op']);
    expect(
      statements.some((statement) => /CREATE|DROP INDEX/.test(statement)),
    ).toBe(false);
    expect(await retainedSnapshot(client!)).toEqual(before);
  });

  it('refuses an exact-name index with a wrong real definition without dropping it', async () => {
    await client!.unsafe(
      'CREATE UNIQUE INDEX CONCURRENTLY uq_feature_flags_key_organization_compact ON public.feature_flags USING btree (organization_id, key) NULLS NOT DISTINCT',
    );

    await expect(
      runR4aCompactIndexExecutor(runner(client!), ['feature_flags']),
    ).rejects.toBeInstanceOf(R4aCompactIndexExecutorError);
    await expect(
      indexState(client!, 'uq_feature_flags_key_organization_compact'),
    ).resolves.toMatchObject({ valid: true, ready: true });
  });

  it('refuses a settled-check table with unresolved ownership disposition', async () => {
    await client!.unsafe(
      "INSERT INTO public.feature_flags (key, tenant_id, ownership_state) VALUES ('r4a-unsettled', 'test-tenant', 'unresolved_legacy')",
    );
    await expect(
      runR4aCompactIndexExecutor(runner(client!), ['feature_flags']),
    ).rejects.toThrow('blocked-by-disposition');
    await expect(
      inspectR4aCompactIndex(runner(client!), 'feature_flags'),
    ).resolves.toMatchObject({ decision: 'blocked-by-disposition' });
  });

  it('recovers a real exact INVALID and not-ready index created by a failed concurrent build', async () => {
    await failCompactBuild(client!);
    await client!.unsafe(
      "DELETE FROM public.feature_flags WHERE ownership_state = 'unresolved_legacy'",
    );
    await client!.unsafe("SET lock_timeout = '7s'");
    const statements: string[] = [];
    const params: (readonly string[])[] = [];
    const result = await runR4aCompactIndexExecutor(
      runner(client!, statements, params),
      ['feature_flags'],
    );
    expect(result).toMatchObject([
      { table: 'feature_flags', action: 'recreated-invalid' },
    ]);
    expect(
      await indexState(client!, 'uq_feature_flags_key_organization_compact'),
    ).toMatchObject({ valid: true, ready: true, live: true });
    // Recovery DDL ran under the executor policy, and the session was restored.
    const drop = statements.findIndex((s) => s.startsWith('DROP INDEX'));
    expect(statements.indexOf('SET lock_timeout = 3000')).toBeGreaterThan(-1);
    expect(statements.indexOf('SET lock_timeout = 3000')).toBeLessThan(drop);
    expect(statements.indexOf('SET statement_timeout = 0')).toBeLessThan(drop);
    await expect(sessionTimeouts(client!)).resolves.toEqual({
      lock_timeout: '7s',
      statement_timeout: '0',
    });
    // Restored through bound parameters: constant SQL, values passed apart.
    expect(statements.filter((s) => s.includes('set_config'))).toEqual([
      RESTORE_TIMEOUTS_SQL,
    ]);
    expect(params).toEqual([['7s', '0']]);
  });

  it.each([
    ['unresolved ownership rows', async () => {}],
    [
      'an unvalidated ownership CHECK',
      async () => {
        await client!.unsafe(
          "DELETE FROM public.feature_flags WHERE ownership_state = 'unresolved_legacy'",
        );
        await unvalidateOwnershipCheck(client!);
      },
    ],
  ])(
    'refuses DROP/CREATE for a real exact INVALID/not-ready/live index with %s',
    async (_label, unsettle) => {
      await failCompactBuild(client!);
      await unsettle();
      const statements: string[] = [];
      await expect(
        runR4aCompactIndexExecutor(runner(client!, statements), [
          'feature_flags',
        ]),
      ).rejects.toThrow('blocked-by-disposition');
      expect(statements.filter(isIndexDdl)).toEqual([]);
      expect(
        await indexState(client!, 'uq_feature_flags_key_organization_compact'),
      ).toMatchObject({ valid: false, ready: false, live: true });
    },
  );

  it('bounds a lock-blocked preflight, refuses DDL, restores the session and releases the lock', async () => {
    const blocker = await openClient();
    const verifier = await openClient();
    await client!.unsafe("SET lock_timeout = '45s'");
    try {
      await blocker.unsafe('BEGIN');
      await blocker.unsafe(
        'LOCK TABLE public.feature_flags IN ACCESS EXCLUSIVE MODE',
      );
      const statements: string[] = [];
      const params: (readonly string[])[] = [];
      const started = Date.now();
      await expect(
        runR4aCompactIndexExecutor(runner(client!, statements, params), [
          'feature_flags',
        ]),
      ).rejects.toThrow('blocked-by-schema-drift');
      // Each queued preflight statement waits at most the executor's 3s
      // policy; the session's own 45s would exceed this bound on the first.
      expect(Date.now() - started).toBeLessThan(30_000);
      expect(statements.filter(isIndexDdl)).toEqual([]);
      await expect(sessionTimeouts(client!)).resolves.toEqual({
        lock_timeout: '45s',
        statement_timeout: '0',
      });
      expect(params).toEqual([['45s', '0']]);
      expect(statements.some((s) => s.includes('45s'))).toBe(false);
      const lock = await verifier.unsafe<{ ok: boolean }[]>(
        `SELECT pg_try_advisory_lock(${R4A_COMPACT_INDEX_LOCK.namespace}, ${R4A_COMPACT_INDEX_LOCK.id}) AS ok`,
      );
      expect(lock[0]?.ok).toBe(true);
      await verifier.unsafe(
        `SELECT pg_advisory_unlock(${R4A_COMPACT_INDEX_LOCK.namespace}, ${R4A_COMPACT_INDEX_LOCK.id})`,
      );
    } finally {
      await blocker.unsafe('ROLLBACK');
      await blocker.end({ timeout: 5 });
      await verifier.end({ timeout: 5 });
    }
  });

  it('refuses recovery for a real exact INVALID but ready index', async () => {
    // Settled rows keep the ownership gate ready, so the refusal below is
    // recoveryAllowed()'s ready=true guard and not the disposition gate.
    await client!.unsafe(
      "INSERT INTO public.feature_flags (key, tenant_id, ownership_state) SELECT 'r4a-ready-' || value, 'tenant-' || value, 'intentional_global' FROM generate_series(1, 500000) AS value",
    );
    const builder = await openClient();
    const observer = await openClient();
    try {
      const [{ pid }] = await builder.unsafe<{ readonly pid: number }[]>(
        'SELECT pg_backend_pid() AS pid',
      );
      // postgres.js queries are lazy thenables; attaching `then` starts the
      // build before we observe its pg_index state from another session.
      // Both outcomes are settled here: the cancel's error can arrive before
      // pg_cancel_backend() returns, and an unobserved rejection in that gap
      // is reported as an unhandled error.
      const build = builder
        .unsafe(
          'CREATE UNIQUE INDEX CONCURRENTLY uq_feature_flags_key_organization_compact ON public.feature_flags USING btree (key, organization_id) NULLS NOT DISTINCT',
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      let interruptedAtReady = false;
      for (let attempt = 0; attempt < 400; attempt += 1) {
        const state = await indexState(
          observer,
          'uq_feature_flags_key_organization_compact',
        );
        if (state?.ready === true && state.valid === false) {
          interruptedAtReady = true;
          await observer.unsafe(`SELECT pg_cancel_backend(${pid})`);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      // 57014 = query_canceled: the build was stopped by our cancel.
      expect(await build).toMatchObject({ code: '57014' });
      expect(interruptedAtReady).toBe(true);
      expect(
        await indexState(client!, 'uq_feature_flags_key_organization_compact'),
      ).toMatchObject({ valid: false, ready: true, live: true });

      const statements: string[] = [];
      await expect(
        runR4aCompactIndexExecutor(runner(client!, statements), [
          'feature_flags',
        ]),
      ).rejects.toThrow('invalid-index-recovery-required');
      expect(
        statements.some((statement) => statement.startsWith('DROP INDEX')),
      ).toBe(false);
    } finally {
      await builder.end({ timeout: 5 });
      await observer.end({ timeout: 5 });
    }
  });

  it('serializes two separate PostgreSQL sessions with the session advisory lock', async () => {
    const first = await openClient();
    const second = await openClient();
    let acquired!: () => void;
    let continueFirst!: () => void;
    const acquiredLock = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const continueAfterProbe = new Promise<void>((resolve) => {
      continueFirst = resolve;
    });
    const firstRunner: R4aCompactIndexExecutorRunner = {
      ...runner(first),
      query: async <T>(statement: string) => {
        const rows = (await first.unsafe(statement)) as T[];
        if (statement.includes('pg_try_advisory_lock')) {
          acquired();
          await continueAfterProbe;
        }
        return rows;
      },
    };
    try {
      const firstRun = runR4aCompactIndexExecutor(firstRunner, [
        'feature_flags',
      ]);
      await acquiredLock;
      await expect(
        runR4aCompactIndexExecutor(runner(second), ['feature_flags']),
      ).rejects.toBeInstanceOf(R4aCompactIndexAlreadyRunningError);
      continueFirst();
      await expect(firstRun).resolves.toMatchObject([
        { table: 'feature_flags', action: 'created' },
      ]);
    } finally {
      continueFirst?.();
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
    }
  });

  it('releases its advisory lock after a PostgreSQL CREATE failure', async () => {
    const blocker = await openClient();
    const verifier = await openClient();
    try {
      await blocker.unsafe('BEGIN');
      await blocker.unsafe(
        'LOCK TABLE public.feature_flags IN ACCESS EXCLUSIVE MODE',
      );
      await expect(
        runR4aCompactIndexExecutor(runner(client!), ['feature_flags']),
      ).rejects.toThrow();
      const lock = await verifier.unsafe<{ ok: boolean }[]>(
        `SELECT pg_try_advisory_lock(${R4A_COMPACT_INDEX_LOCK.namespace}, ${R4A_COMPACT_INDEX_LOCK.id}) AS ok`,
      );
      expect(lock[0]?.ok).toBe(true);
      await verifier.unsafe(
        `SELECT pg_advisory_unlock(${R4A_COMPACT_INDEX_LOCK.namespace}, ${R4A_COMPACT_INDEX_LOCK.id})`,
      );
    } finally {
      await blocker.unsafe('ROLLBACK');
      await blocker.end({ timeout: 5 });
      await verifier.end({ timeout: 5 });
    }
  });

  it('pins its session: a reserved connection outlives the driver lifetime that retires a plain one', async () => {
    const { default: postgres } = await import('postgres');
    const pid = async (sql: Sql) =>
      (
        await sql.unsafe<{ pid: number }[]>('SELECT pg_backend_pid() AS pid')
      )[0]!.pid;
    // max_lifetime is in seconds; a 1s lifetime expires during the sleep.
    const plain = postgres(testUrl!, {
      max: 1,
      prepare: false,
      max_lifetime: 1,
    });
    const pooled = postgres(testUrl!, {
      max: 1,
      prepare: false,
      max_lifetime: 1,
    });
    try {
      const plainBefore = await pid(plain);
      await plain.unsafe('SELECT pg_sleep(1.5)');
      expect(await pid(plain)).not.toBe(plainBefore);

      const session = await pooled.reserve();
      try {
        const pinnedBefore = await pid(session);
        await session.unsafe('SELECT pg_sleep(1.5)');
        expect(await pid(session)).toBe(pinnedBefore);
      } finally {
        session.release();
      }
    } finally {
      // A lifetime-expired connection otherwise waits out the end timeout.
      await plain.end({ timeout: 0 });
      await pooled.end({ timeout: 0 });
    }
  });

  it('refuses DDL on a session that no longer holds its advisory lock', async () => {
    const other = await openClient();
    const statements: string[] = [];
    let switched = false;
    const original = runner(client!, statements);
    const replacement = runner(other, statements);
    // Simulates the driver retiring the connection after the first build.
    const switching: R4aCompactIndexExecutorRunner = {
      query: async <T>(statement: string) => {
        const rows = await (switched ? replacement : original).query<T>(
          statement,
        );
        if (statement.startsWith('CREATE UNIQUE INDEX')) switched = true;
        return rows;
      },
      queryWithParams: (statement, values) =>
        (switched ? replacement : original).queryWithParams(statement, values),
    };
    try {
      await expect(
        runR4aCompactIndexExecutor(switching, [
          'feature_flags',
          'audit_log_settings',
        ]),
      ).rejects.toThrow('no longer holds the advisory lock');
      expect(statements.filter(isIndexDdl)).toHaveLength(1);
      expect(
        await indexState(
          client!,
          'uq_audit_log_settings_category_organization_compact',
        ),
      ).toBeUndefined();
    } finally {
      // The original session still holds the lock; release it for later tests.
      await client!.unsafe(
        `SELECT pg_advisory_unlock(${R4A_COMPACT_INDEX_LOCK.namespace}, ${R4A_COMPACT_INDEX_LOCK.id})`,
      );
      await other.end({ timeout: 5 });
    }
  });

  it('refuses a public pg_class name collision that is not an index', async () => {
    await client!.unsafe(
      'CREATE VIEW public.uq_feature_flags_key_organization_compact AS SELECT 1 AS value',
    );
    await expect(
      runR4aCompactIndexExecutor(runner(client!), ['feature_flags']),
    ).rejects.toThrow('blocked-by-schema-drift');
    const relations = await client!.unsafe<{ relkind: string }[]>(
      "SELECT relkind FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'uq_feature_flags_key_organization_compact'",
    );
    expect(relations).toEqual([{ relkind: 'v' }]);
  });
});
