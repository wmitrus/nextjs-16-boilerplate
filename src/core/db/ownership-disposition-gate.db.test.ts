/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import type { DbDriver } from '@/core/db/types';

import { gatherOwnershipDispositionEvidence } from './ownership-disposition-gate';
import { sqlRunnerFromDrizzle, type SqlRunner } from './post-migrate-steps';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-213 — real-PostgreSQL proof for the Quarantine Disposition Gate.
 *
 * Unit tests own pure classification. This suite deliberately proves the
 * PostgreSQL-specific boundary that mocks cannot:
 *
 * - the actual migration-installed CHECK expressions are structurally
 *   recognized through pg_constraint + pg_get_expr();
 * - the three historical CHECKs remain NOT VALID before this gate;
 * - evidence gathering is read-only and does not validate them implicitly;
 * - a real unresolved feature_flags row blocks only that table's R4a gate;
 * - audit_events remains an independent R4b-1 gate.
 *
 * This suite is intentionally real-Postgres-only. PGlite rendering of catalog
 * expressions is not Production evidence for PostgreSQL structural identity.
 */

const testUrl =
  (inject('TEST_DATABASE_URL') as string | undefined) ??
  process.env.TEST_DATABASE_URL?.trim();

const driver: DbDriver = testUrl ? 'postgres' : 'pglite';
const isRealPg = driver === 'postgres';

const LEGACY_FLAG_KEY = 'ozi213-real-pg-unresolved';

let testDb: TestDb;
let runner: SqlRunner;

async function cleanupFixture(): Promise<void> {
  await testDb.db.execute(
    sql`DELETE FROM feature_flags WHERE key = ${LEGACY_FLAG_KEY}`,
  );
}

beforeAll(async () => {
  testDb = await resolveTestDb();
  runner = sqlRunnerFromDrizzle(testDb.db, (text) => sql.raw(text));
  await cleanupFixture();
});

afterEach(async () => {
  await cleanupFixture();
});

afterAll(async () => {
  await cleanupFixture();
  await testDb.cleanup();
});

describe.skipIf(!isRealPg)(
  'ownership-disposition-gate — real PostgreSQL',
  () => {
    it('recognizes all three migration-installed CHECKs and leaves them NOT VALID', async () => {
      const before = await gatherOwnershipDispositionEvidence(runner);

      expect(before.featureFlags.constraint).toMatchObject({
        name: 'ck_feature_flags_ownership_state_org',
        exists: true,
        definitionMatches: true,
        validated: false,
        state: 'exact-unvalidated',
      });

      expect(before.auditLogSettings.constraint).toMatchObject({
        name: 'ck_audit_log_settings_ownership_state_org',
        exists: true,
        definitionMatches: true,
        validated: false,
        state: 'exact-unvalidated',
      });

      expect(before.auditEvents.constraint).toMatchObject({
        name: 'ck_audit_events_ownership_state_org',
        exists: true,
        definitionMatches: true,
        validated: false,
        state: 'exact-unvalidated',
      });

      expect(before.featureFlags.invalidCombinationCount).toBe(0);
      expect(before.auditLogSettings.invalidCombinationCount).toBe(0);
      expect(before.auditEvents.invalidCombinationCount).toBe(0);

      expect(before.featureFlags).toMatchObject({
        dispositionSettled: true,
        gateReady: false,
        plannedAction: 'validate-constraint',
      });
      expect(before.auditLogSettings).toMatchObject({
        dispositionSettled: true,
        gateReady: false,
        plannedAction: 'validate-constraint',
      });
      expect(before.auditEvents).toMatchObject({
        dispositionSettled: true,
        gateReady: false,
        plannedAction: 'validate-constraint',
      });

      const after = await gatherOwnershipDispositionEvidence(runner);

      expect([
        after.featureFlags.constraint.validated,
        after.auditLogSettings.constraint.validated,
        after.auditEvents.constraint.validated,
      ]).toEqual([false, false, false]);
    });

    it('a real unresolved feature flag blocks only its own R4a table gate', async () => {
      await testDb.db.execute(
        sql`INSERT INTO feature_flags
              (key, tenant_id, organization_id, ownership_state, enabled)
            VALUES
              (${LEGACY_FLAG_KEY}, NULL, NULL, 'unresolved_legacy', false)`,
      );

      const evidence = await gatherOwnershipDispositionEvidence(runner);

      expect(
        evidence.featureFlags.counts.unresolvedLegacy,
      ).toBeGreaterThanOrEqual(1);
      expect(evidence.featureFlags).toMatchObject({
        gate: 'r4a',
        dispositionSettled: false,
        gateReady: false,
        plannedAction: 'blocked-unsettled-rows',
      });

      expect(evidence.auditLogSettings).toMatchObject({
        gate: 'r4a',
        dispositionSettled: true,
        plannedAction: 'validate-constraint',
      });

      expect(evidence.auditEvents).toMatchObject({
        gate: 'r4b1',
        dispositionSettled: true,
        plannedAction: 'validate-constraint',
      });
    });
    it('rejects an otherwise exact NO INHERIT CHECK', async () => {
      if (!testUrl) {
        throw new Error('Real PostgreSQL test URL is required');
      }

      const { default: postgres } = await import('postgres');
      const client = postgres(testUrl, { max: 1 });
      const connection = await client.reserve();

      let transactionStarted = false;

      try {
        await connection.unsafe('BEGIN');
        transactionStarted = true;

        const existing = await connection.unsafe(
          `SELECT pg_get_expr(c.conbin, c.conrelid, true) AS expression
           FROM pg_constraint c
           JOIN pg_class rel ON rel.oid = c.conrelid
           JOIN pg_namespace ns ON ns.oid = rel.relnamespace
           WHERE ns.nspname = 'public'
             AND rel.relname = 'feature_flags'
             AND c.conname = 'ck_feature_flags_ownership_state_org'
             AND c.contype = 'c'`,
        );

        const expression = existing[0]?.expression;

        if (typeof expression !== 'string') {
          throw new Error('Expected migration-installed CHECK expression');
        }

        await connection.unsafe(
          'ALTER TABLE public.feature_flags ' +
            'DROP CONSTRAINT ck_feature_flags_ownership_state_org',
        );

        await connection.unsafe(
          'ALTER TABLE public.feature_flags ' +
            'ADD CONSTRAINT ck_feature_flags_ownership_state_org ' +
            `CHECK (${expression}) NO INHERIT NOT VALID`,
        );

        const transactionRunner: SqlRunner = {
          query: async <T>(statement: string) =>
            (await connection.unsafe(statement)) as T[],
        };

        const evidence =
          await gatherOwnershipDispositionEvidence(transactionRunner);

        expect(evidence.featureFlags.constraint).toMatchObject({
          exists: true,
          definitionMatches: false,
          state: 'wrong-definition',
        });

        expect(evidence.featureFlags).toMatchObject({
          gateReady: false,
          plannedAction: 'blocked-wrong-constraint',
        });
      } finally {
        try {
          if (transactionStarted) {
            await connection.unsafe('ROLLBACK');
          }
        } finally {
          connection.release();
          await client.end();
        }
      }
    });
  },
);
