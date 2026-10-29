/** @vitest-environment node */
import { createServer, connect, type Server } from 'node:net';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import { runMigrations } from './migrations/run-migrations';
import { sqlRunnerFromDrizzle } from './post-migrate-steps';
import {
  bootstrapR4aSchemaAConcurrent,
  bootstrapR4aSchemaAPlain,
} from './r4a-compact-index-bootstrap';
import { r4aExecutorRunnerFromPostgres } from './r4a-compact-index-executor';
import { inspectR4aCompactIndex } from './r4a-compact-index-inspection';
import type { DrizzleDb } from './types';

import {
  resolveMigrationOnlyTestDb,
  resolveTestDb,
  type TestDb,
} from '@/testing/db/create-test-db';

/**
 * OZI-219 — every migration-built test database (PGlite under `test:db`, the
 * Testcontainers fixture under `test:db:ci`) starts in R4a schema A.
 */
let testDb: TestDb;
/** PGlite reports `constraint`, postgres.js `constraint_name`; ORMs wrap in `cause`. */
function violatedConstraint(error: unknown): string | undefined {
  for (let e = error; e && typeof e === 'object'; ) {
    const o = e as { constraint?: unknown; constraint_name?: unknown };
    const name = o.constraint ?? o.constraint_name;
    if (typeof name === 'string') return name;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}
const runner = () => sqlRunnerFromDrizzle(testDb.db, (text) => sql.raw(text));

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('R4a schema A bootstrap on the shared test database', () => {
  it.each(['feature_flags', 'audit_log_settings'] as const)(
    '%s compact unique is already converged after migrations',
    async (table) => {
      await expect(
        inspectR4aCompactIndex(runner(), table),
      ).resolves.toMatchObject({ decision: 'already-converged' });
    },
  );

  it('keeps exactly the six retained uniques plus the two compact uniques', async () => {
    const rows = await runner().query<{ name: string }>(
      `SELECT indexrelid::regclass::text AS name FROM pg_index
       WHERE indrelid IN ('public.audit_log_settings'::regclass, 'public.feature_flags'::regclass)
         AND indisunique AND NOT indisprimary`,
    );
    expect(rows.map((row) => row.name).sort()).toEqual([
      'uq_audit_log_settings_category_intentional_global',
      'uq_audit_log_settings_category_organization_canonical',
      'uq_audit_log_settings_category_organization_compact',
      'uq_audit_log_settings_category_tenant',
      'uq_feature_flags_key_intentional_global',
      'uq_feature_flags_key_organization_canonical',
      'uq_feature_flags_key_organization_compact',
      'uq_feature_flags_key_tenant',
    ]);
  });

  it('validates both R4a ownership CHECKs (the OZI-213 step) and leaves audit_events untouched', async () => {
    const rows = await runner().query<{
      conname: string;
      convalidated: boolean;
    }>(
      `SELECT conname, convalidated FROM pg_constraint
       WHERE conname IN ('ck_feature_flags_ownership_state_org',
                         'ck_audit_log_settings_ownership_state_org',
                         'ck_audit_events_ownership_state_org')`,
    );
    expect(
      Object.fromEntries(rows.map((row) => [row.conname, row.convalidated])),
    ).toEqual({
      ck_feature_flags_ownership_state_org: true,
      ck_audit_log_settings_ownership_state_org: true,
      ck_audit_events_ownership_state_org: false,
    });
  });

  it.each([
    [
      'feature_flags',
      `INSERT INTO feature_flags (key, tenant_id, ownership_state, enabled)
       VALUES ('r4a-a', 'legacy-1', 'unresolved_legacy', true),
              ('r4a-a', 'legacy-2', 'unresolved_legacy', true)`,
      'uq_feature_flags_key_organization_compact',
    ],
    [
      'audit_log_settings',
      `INSERT INTO audit_log_settings (category, tenant_id, ownership_state, enabled, retention_days)
       VALUES ('auth', 'legacy-1', 'unresolved_legacy', true, 30),
              ('auth', 'legacy-2', 'quarantined', true, 30)`,
      'uq_audit_log_settings_category_organization_compact',
    ],
  ])(
    '%s rejects a second NULL-organization row for one key (compact NULLS NOT DISTINCT)',
    async (table, insert, index) => {
      try {
        const error = await runner()
          .query(insert)
          .then(
            () => undefined,
            (caught: unknown) => caught,
          );
        expect(violatedConstraint(error)).toBe(index);
      } finally {
        await runner().query(`DELETE FROM ${table}`);
      }
    },
  );

  it('a repeated bootstrap is a no-op and issues no DDL', async () => {
    const statements: string[] = [];
    const base = runner();
    const recording = {
      query: <T>(text: string) => {
        statements.push(text);
        return base.query<T>(text);
      },
    };
    await expect(bootstrapR4aSchemaAPlain(recording)).resolves.toEqual([
      { table: 'feature_flags', action: 'no-op' },
      { table: 'audit_log_settings', action: 'no-op' },
    ]);
    expect(statements.some((s) => /\bCREATE\b|\bDROP\b/i.test(s))).toBe(false);
  });
});

describe('R4a schema A bootstrap on a migration-only database with unsettled ownership', () => {
  let preA: TestDb;

  beforeEach(async () => {
    preA = await resolveMigrationOnlyTestDb();
  });

  afterEach(async () => {
    await preA.cleanup();
  });

  const attempt = async () => {
    const base = sqlRunnerFromDrizzle(preA.db, (text) => sql.raw(text));
    if (!preA.url) return bootstrapR4aSchemaAPlain(base);
    const { default: postgres } = await import('postgres');
    const client = postgres(preA.url, { max: 1, prepare: false });
    try {
      const session = await client.reserve();
      try {
        return await bootstrapR4aSchemaAConcurrent(
          r4aExecutorRunnerFromPostgres(session),
          { expectedSystemIdentifier: preA.systemIdentifier ?? '' },
        );
      } finally {
        session.release();
      }
    } finally {
      await client.end({ timeout: 5 });
    }
  };

  /** Neither table mutated: no compact unique, both R4a CHECKs NOT VALID. */
  const expectNoSchemaAMutation = async () => {
    const base = sqlRunnerFromDrizzle(preA.db, (text) => sql.raw(text));
    const compact = await base.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_class
       WHERE relname IN ('uq_feature_flags_key_organization_compact',
                         'uq_audit_log_settings_category_organization_compact')`,
    );
    expect(compact[0]?.n).toBe(0);
    const checks = await base.query<{ conname: string; convalidated: boolean }>(
      `SELECT conname, convalidated FROM pg_constraint
       WHERE conname IN ('ck_feature_flags_ownership_state_org',
                         'ck_audit_log_settings_ownership_state_org')`,
    );
    expect(
      Object.fromEntries(checks.map((row) => [row.conname, row.convalidated])),
    ).toEqual({
      ck_feature_flags_ownership_state_org: false,
      ck_audit_log_settings_ownership_state_org: false,
    });
  };

  it('refuses with no DDL while an unresolved_legacy row blocks the first table (feature_flags)', async () => {
    await sqlRunnerFromDrizzle(preA.db, (text) => sql.raw(text)).query(
      `INSERT INTO feature_flags (key, tenant_id, ownership_state, enabled)
       VALUES ('r4a-unsettled', 'legacy-1', 'unresolved_legacy', true)`,
    );

    await expect(attempt()).rejects.toThrow(
      /feature_flags is blocked-unsettled-rows\/.*refused before any DDL/,
    );
    await expectNoSchemaAMutation();
  });

  it('preflights both tables: a blocked second table (audit_log_settings) leaves the first untouched', async () => {
    await sqlRunnerFromDrizzle(preA.db, (text) => sql.raw(text)).query(
      `INSERT INTO audit_log_settings (category, tenant_id, ownership_state, enabled, retention_days)
       VALUES ('auth', 'legacy-1', 'unresolved_legacy', true, 30)`,
    );

    await expect(attempt()).rejects.toThrow(
      /audit_log_settings is blocked-unsettled-rows\/.*refused before any DDL/,
    );
    await expectNoSchemaAMutation();
  });
});

/**
 * OZI-219 P1 falsification — a loopback URL that is really a tunnel /
 * port-forward to another cluster. A TCP forwarder on 127.0.0.1 fronts a
 * disposable "remote" Testcontainers cluster; the trusted identity is the
 * shared fixture's, read inside its own container by globalSetup. The
 * hostname guard passes (127.0.0.1); only the identity proof may stop it.
 */
const trustedLocalIdentity = inject('TEST_DATABASE_SYSTEM_IDENTIFIER') as
  | string
  | undefined;

describe.skipIf(!trustedLocalIdentity)(
  'R4a schema A bootstrap through a localhost tunnel to another cluster',
  () => {
    let remote: TestDb;
    let tunnel: Server;
    let tunnelUrl: string;

    beforeAll(async () => {
      remote = await resolveMigrationOnlyTestDb();
      const target = new URL(remote.url!);
      tunnel = createServer((inbound) => {
        const outbound = connect(Number(target.port), target.hostname);
        inbound.pipe(outbound).pipe(inbound);
        inbound.on('error', () => outbound.destroy());
        outbound.on('error', () => inbound.destroy());
      });
      await new Promise<void>((resolve) =>
        tunnel.listen(0, '127.0.0.1', resolve),
      );
      const { port } = tunnel.address() as { port: number };
      const viaTunnel = new URL(remote.url!);
      viaTunnel.hostname = '127.0.0.1';
      viaTunnel.port = String(port);
      tunnelUrl = viaTunnel.toString();
    });

    afterAll(async () => {
      tunnel?.close();
      await remote?.cleanup();
    });

    async function migrateThroughTunnel(identity: string) {
      const client = postgres(tunnelUrl, { max: 1, prepare: false });
      try {
        await runMigrations(
          drizzle(client) as unknown as DrizzleDb,
          'postgres',
          {
            postgresUrl: tunnelUrl,
            r4aSchemaA: 'bootstrap',
            r4aTargetSystemIdentifier: identity,
          },
        );
      } finally {
        await client.end({ timeout: 5 });
      }
    }

    async function remoteState() {
      const base = sqlRunnerFromDrizzle(remote.db, (text) => sql.raw(text));
      const [compact] = await base.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_class
         WHERE relname IN ('uq_feature_flags_key_organization_compact',
                           'uq_audit_log_settings_category_organization_compact')`,
      );
      const validated = await base.query<{ table: string; valid: boolean }>(
        `SELECT conrelid::regclass::text AS table, convalidated AS valid
         FROM pg_constraint
         WHERE contype = 'c'
           AND conrelid IN ('public.feature_flags'::regclass,
                            'public.audit_log_settings'::regclass)
           AND conname LIKE '%ownership%'
         ORDER BY 1`,
      );
      return { compact: compact?.n, validated };
    }

    it('the tunnel really reaches a different cluster than the trusted one', () => {
      expect(new URL(tunnelUrl).hostname).toBe('127.0.0.1');
      expect(remote.systemIdentifier).toMatch(/^\d+$/);
      expect(remote.systemIdentifier).not.toBe(trustedLocalIdentity);
    });

    it('refuses with no DDL: no compact unique, ownership CHECKs still NOT VALID', async () => {
      const before = await remoteState();
      expect(before.compact).toBe(0);
      expect(before.validated.length).toBeGreaterThan(0);
      expect(before.validated.every((row) => !row.valid)).toBe(true);

      await expect(migrateThroughTunnel(trustedLocalIdentity!)).rejects.toThrow(
        'not the trusted local cluster',
      );

      expect(await remoteState()).toEqual(before);
    });

    it('control: the same tunnel with that cluster own identity converges', async () => {
      await migrateThroughTunnel(remote.systemIdentifier!);
      expect((await remoteState()).compact).toBe(2);
    });
  },
);
