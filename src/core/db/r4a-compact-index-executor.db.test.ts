/** @vitest-environment node */
import type { Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  startIsolatedPostgres,
  type IsolatedPostgres,
} from '../../../tests/db/isolated-postgres';

import {
  R4A_COMPACT_INDEX_LOCK,
  R4aCompactIndexAlreadyRunningError,
  R4aCompactIndexExecutorError,
  runR4aCompactIndexExecutor,
} from './r4a-compact-index-executor';
import { inspectR4aCompactIndex } from './r4a-compact-index-inspection';
import type { R4aCompactIndexSqlRunner } from './r4a-compact-index-inspection';

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
): R4aCompactIndexSqlRunner {
  return {
    query: async <T>(statement: string) => {
      statements.push(statement);
      return (await connection.unsafe(statement)) as T[];
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
    await client!.unsafe(
      "INSERT INTO public.feature_flags (key, tenant_id, ownership_state) VALUES ('r4a-invalid', 'one', 'intentional_global'), ('r4a-invalid', 'two', 'unresolved_legacy')",
    );
    await expect(
      client!.unsafe(
        'CREATE UNIQUE INDEX CONCURRENTLY uq_feature_flags_key_organization_compact ON public.feature_flags USING btree (key, organization_id) NULLS NOT DISTINCT',
      ),
    ).rejects.toThrow();
    expect(
      await indexState(client!, 'uq_feature_flags_key_organization_compact'),
    ).toMatchObject({ valid: false, ready: false, live: true });

    await client!.unsafe(
      "DELETE FROM public.feature_flags WHERE ownership_state = 'unresolved_legacy'",
    );
    const result = await runR4aCompactIndexExecutor(runner(client!), [
      'feature_flags',
    ]);
    expect(result).toMatchObject([
      { table: 'feature_flags', action: 'recreated-invalid' },
    ]);
    expect(
      await indexState(client!, 'uq_feature_flags_key_organization_compact'),
    ).toMatchObject({ valid: true, ready: true, live: true });
  });

  it('refuses recovery for a real exact INVALID but ready index', async () => {
    await client!.unsafe(
      "INSERT INTO public.feature_flags (key, tenant_id, ownership_state) SELECT 'r4a-ready-' || value, 'tenant-' || value, 'unresolved_legacy' FROM generate_series(1, 500000) AS value",
    );
    const builder = await openClient();
    const observer = await openClient();
    try {
      const [{ pid }] = await builder.unsafe<{ readonly pid: number }[]>(
        'SELECT pg_backend_pid() AS pid',
      );
      // postgres.js queries are lazy thenables; attaching `then` starts the
      // build before we observe its pg_index state from another session.
      const build = builder
        .unsafe(
          'CREATE UNIQUE INDEX CONCURRENTLY uq_feature_flags_key_organization_compact ON public.feature_flags USING btree (key, organization_id) NULLS NOT DISTINCT',
        )
        .then((rows) => rows);
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
      await expect(build).rejects.toThrow();
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
    const firstRunner: R4aCompactIndexSqlRunner = {
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
