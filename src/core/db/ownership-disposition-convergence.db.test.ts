/** @vitest-environment node */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import type { DbDriver } from '@/core/db/types';

import {
  runOwnershipDispositionConvergence,
  type OwnershipDispositionConvergenceResult,
} from './ownership-disposition-convergence';
import { gatherOwnershipDispositionEvidence } from './ownership-disposition-gate';
import { sqlRunnerFromPostgres, type SqlRunner } from './post-migrate-steps';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-213 — real-PostgreSQL proof for the mutating convergence executor.
 *
 * Every mutation is wrapped in an explicit transaction and rolled back.
 * PostgreSQL VALIDATE CONSTRAINT is transactional, so the migration-installed
 * CHECKs remain NOT VALID after each test.
 *
 * A dedicated postgres.js max=1 connection is used because the executor relies
 * on session-affine SETs and a session advisory lock.
 */

const testUrl =
  (inject('TEST_DATABASE_URL') as string | undefined) ??
  process.env.TEST_DATABASE_URL?.trim();

const driver: DbDriver = testUrl ? 'postgres' : 'pglite';
const isRealPg = driver === 'postgres';

let testDb: TestDb;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  await testDb.cleanup();
});

async function withRollback<T>(
  work: (runner: SqlRunner) => Promise<T>,
): Promise<T> {
  if (!testUrl) {
    throw new Error('Real PostgreSQL TEST_DATABASE_URL is required');
  }

  const client = postgres(testUrl, {
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });
  const runner = sqlRunnerFromPostgres(client);

  await runner.query('BEGIN');

  try {
    return await work(runner);
  } finally {
    await runner.query('ROLLBACK').catch(() => undefined);
    await client.end({ timeout: 5 });
  }
}

function expectAllUnvalidated(
  evidence: Awaited<ReturnType<typeof gatherOwnershipDispositionEvidence>>,
): void {
  expect([
    evidence.featureFlags.constraint.state,
    evidence.auditLogSettings.constraint.state,
    evidence.auditEvents.constraint.state,
  ]).toEqual(['exact-unvalidated', 'exact-unvalidated', 'exact-unvalidated']);
}

describe.skipIf(!isRealPg)(
  'ownership-disposition-convergence — real PostgreSQL',
  () => {
    it('VALIDATEs all three eligible CHECKs and proves the postconditions', async () => {
      await withRollback(async (runner) => {
        const before = await gatherOwnershipDispositionEvidence(runner);

        expectAllUnvalidated(before);
        expect([
          before.featureFlags.plannedAction,
          before.auditLogSettings.plannedAction,
          before.auditEvents.plannedAction,
        ]).toEqual([
          'validate-constraint',
          'validate-constraint',
          'validate-constraint',
        ]);

        const result: OwnershipDispositionConvergenceResult =
          await runOwnershipDispositionConvergence(runner);

        expect(result.outcomes).toEqual([
          { table: 'feature_flags', action: 'validated' },
          { table: 'audit_log_settings', action: 'validated' },
          { table: 'audit_events', action: 'validated' },
        ]);

        expect([
          result.after.featureFlags.constraint.state,
          result.after.auditLogSettings.constraint.state,
          result.after.auditEvents.constraint.state,
        ]).toEqual(['exact-validated', 'exact-validated', 'exact-validated']);

        expect([
          result.after.featureFlags.gateReady,
          result.after.auditLogSettings.gateReady,
          result.after.auditEvents.gateReady,
        ]).toEqual([true, true, true]);
      });

      await withRollback(async (runner) => {
        const restored = await gatherOwnershipDispositionEvidence(runner);
        expectAllUnvalidated(restored);
      });
    });

    it('does not let unresolved audit_events block the independent R4a tables', async () => {
      await withRollback(async (runner) => {
        await runner.query(
          `INSERT INTO public.audit_events
             (category, action, outcome, tenant_id, organization_id,
              ownership_state, actor_user_id)
           VALUES
             ('security_event', 'ozi213.real-pg-gate', 'success',
              NULL, NULL, 'unresolved_legacy', NULL)`,
        );

        const before = await gatherOwnershipDispositionEvidence(runner);

        expect(before.featureFlags.plannedAction).toBe('validate-constraint');
        expect(before.auditLogSettings.plannedAction).toBe(
          'validate-constraint',
        );
        expect(before.auditEvents).toMatchObject({
          gate: 'r4b1',
          dispositionSettled: false,
          gateReady: false,
          plannedAction: 'blocked-unsettled-rows',
        });
        expect(
          before.auditEvents.counts.unresolvedLegacy,
        ).toBeGreaterThanOrEqual(1);

        const result = await runOwnershipDispositionConvergence(runner);

        expect(result.outcomes).toEqual([
          { table: 'feature_flags', action: 'validated' },
          { table: 'audit_log_settings', action: 'validated' },
          { table: 'audit_events', action: 'blocked-unsettled-rows' },
        ]);

        expect(result.after.featureFlags).toMatchObject({
          gate: 'r4a',
          gateReady: true,
          plannedAction: 'no-op',
        });
        expect(result.after.auditLogSettings).toMatchObject({
          gate: 'r4a',
          gateReady: true,
          plannedAction: 'no-op',
        });

        expect(result.after.auditEvents).toMatchObject({
          gate: 'r4b1',
          dispositionSettled: false,
          gateReady: false,
          plannedAction: 'blocked-unsettled-rows',
        });
        expect(result.after.auditEvents.constraint.state).toBe(
          'exact-unvalidated',
        );
      });

      await withRollback(async (runner) => {
        const restored = await gatherOwnershipDispositionEvidence(runner);

        expectAllUnvalidated(restored);
        expect(restored.auditEvents.counts.unresolvedLegacy).toBe(0);
      });
    });
  },
);
