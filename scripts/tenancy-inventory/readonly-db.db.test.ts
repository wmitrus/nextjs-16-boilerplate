/** @vitest-environment node */
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

import { TEST_DEFAULT_URL } from '../lib/db-guard.mjs';

import { describeLocalTarget, withReadOnlyDb } from './readonly-db';

/**
 * Drizzle wraps the driver's raw Postgres error in `DrizzleQueryError`; the
 * top-level error's own `message` is a generic "Failed query: ..." and
 * carries no Postgres error code. The actual `25006`
 * (`cannot execute ... in a read-only transaction`) code and message live
 * on `.cause` -- same shape as `DrizzleFeatureFlagAdminService`'s
 * `isUniqueViolation` helper already documents for `23505`.
 */
async function expectReadOnlyRejection(action: Promise<unknown>) {
  await expect(action).rejects.toSatisfy((error: unknown) => {
    const cause =
      error instanceof Error && 'cause' in error
        ? (error as { cause?: unknown }).cause
        : undefined;
    return (
      cause instanceof Error &&
      /read-only transaction/i.test(cause.message) &&
      (cause as { code?: string }).code === '25006'
    );
  });
}

/**
 * The core evidence bar for OZI-75's read-only requirement: prove the
 * enforcement is real (a genuine Postgres `READ ONLY` transaction, engine
 * error `25006`), not merely that the tool's own code never happens to
 * issue a write.
 */
describe('withReadOnlyDb (real DB)', () => {
  it('runs a read query successfully', async () => {
    const rows = await withReadOnlyDb('test', async (tx) => {
      return tx.execute<{ one: number }>(sql`select 1 as one`);
    });

    expect(rows[0]?.one).toBe(1);
  });

  it('rejects an INSERT attempted inside the transaction', async () => {
    await expectReadOnlyRejection(
      withReadOnlyDb('test', async (tx) => {
        await tx.execute(
          sql`insert into tenants (id, name) values (gen_random_uuid(), 'ozi-75-should-never-commit')`,
        );
      }),
    );
  });

  it('rejects an UPDATE attempted inside the transaction', async () => {
    await expectReadOnlyRejection(
      withReadOnlyDb('test', async (tx) => {
        await tx.execute(sql`update tenants set name = name where false`);
      }),
    );
  });

  it('rejects a DELETE attempted inside the transaction', async () => {
    await expectReadOnlyRejection(
      withReadOnlyDb('test', async (tx) => {
        await tx.execute(sql`delete from tenants where false`);
      }),
    );
  });

  it('rejects DDL attempted inside the transaction', async () => {
    await expectReadOnlyRejection(
      withReadOnlyDb('test', async (tx) => {
        await tx.execute(sql`create table ozi_75_should_never_exist (id int)`);
      }),
    );
  });
});

describe('withReadOnlyDb snapshot semantics (real DB)', () => {
  it('holds one stable snapshot for the whole transaction, not a fresh one per statement', async () => {
    const adminClient = postgres(TEST_DEFAULT_URL, { connect_timeout: 10 });
    const probeId = randomUUID();
    try {
      const observedCounts = await withReadOnlyDb('test', async (tx) => {
        const [before] = await tx.execute<{ count: string }>(
          sql`select count(*)::text as count from tenants`,
        );
        // A second, real connection commits a brand-new row *while this
        // transaction is still open*. Whether the next read here sees it
        // depends entirely on isolation level, not on timing -- proving
        // the fix, not just its absence of an error.
        await adminClient.unsafe(
          `insert into tenants (id, name) values ($1, $2)`,
          [probeId, 'ozi-75-snapshot-probe'],
        );
        const [after] = await tx.execute<{ count: string }>(
          sql`select count(*)::text as count from tenants`,
        );
        return { before: before?.count, after: after?.count };
      });

      expect(observedCounts.after).toBe(observedCounts.before);

      const [freshCount] = await withReadOnlyDb('test', async (tx) => {
        return tx.execute<{ count: string }>(
          sql`select count(*)::text as count from tenants`,
        );
      });
      expect(Number(freshCount?.count)).toBe(Number(observedCounts.before) + 1);
    } finally {
      await adminClient
        .unsafe(`delete from tenants where id = $1`, [probeId])
        .catch(() => undefined);
      await adminClient.end({ timeout: 5 });
    }
  });
});

describe('describeLocalTarget', () => {
  it('never includes credentials, only host:port/database', () => {
    expect(describeLocalTarget('test')).toBe('127.0.0.1:5433/app_test');
    expect(describeLocalTarget('dev')).toBe('127.0.0.1:5432/app_dev');
  });
});
