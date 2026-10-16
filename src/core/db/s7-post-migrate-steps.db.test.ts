/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { sqlRunnerFromDrizzle } from '@/core/db/post-migrate-steps';
import { runS7PostMigrateSteps } from '@/core/db/s7-post-migrate-steps';
import { gatherS7ProductionEvidence } from '@/core/db/s7-production-gate';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

const CHECK_NAME = 'policies_organization_id_not_null';

let testDb: TestDb;

async function policiesNullable(): Promise<'YES' | 'NO' | null> {
  const result = await testDb.db.execute(sql`
    SELECT is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'policies'
       AND column_name = 'organization_id'
  `);

  const rows = (
    Array.isArray(result) ? result : (result as { rows: unknown[] }).rows
  ) as Array<{ is_nullable: 'YES' | 'NO' }>;

  return rows[0]?.is_nullable ?? null;
}

async function helperCheckExists(): Promise<boolean> {
  const result = await testDb.db.execute(sql`
    SELECT EXISTS (
      SELECT 1
        FROM pg_constraint c
        JOIN pg_class rel
          ON rel.oid = c.conrelid
        JOIN pg_namespace ns
          ON ns.oid = rel.relnamespace
       WHERE ns.nspname = 'public'
         AND rel.relname = 'policies'
         AND c.conname = ${CHECK_NAME}
         AND c.contype = 'c'
    ) AS present
  `);

  const rows = (
    Array.isArray(result) ? result : (result as { rows: unknown[] }).rows
  ) as Array<{ present: boolean }>;

  return rows[0]?.present === true;
}

async function waitlistTenantIdExists(): Promise<boolean> {
  const result = await testDb.db.execute(sql`
    SELECT EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'waitlist_entries'
         AND column_name = 'tenant_id'
    ) AS present
  `);

  const rows = (
    Array.isArray(result) ? result : (result as { rows: unknown[] }).rows
  ) as Array<{ present: boolean }>;

  return rows[0]?.present === true;
}

async function restoreCanonicalState(): Promise<void> {
  await testDb.db.execute(
    sql.raw(
      `ALTER TABLE public.policies DROP CONSTRAINT IF EXISTS "${CHECK_NAME}"`,
    ),
  );

  await testDb.db.execute(
    sql`ALTER TABLE public.policies ALTER COLUMN organization_id SET NOT NULL`,
  );

  await testDb.db.execute(
    sql`ALTER TABLE public.waitlist_entries DROP COLUMN IF EXISTS tenant_id`,
  );
}

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterEach(async () => {
  await restoreCanonicalState();
});

afterAll(async () => {
  if (testDb) {
    await testDb.cleanup();
  }
});

describe('runS7PostMigrateSteps (DB)', () => {
  it('converges nullable policies.organization_id through the validated helper CHECK', async () => {
    await testDb.db.execute(
      sql`ALTER TABLE public.policies ALTER COLUMN organization_id DROP NOT NULL`,
    );
    await testDb.db.execute(
      sql.raw(
        `ALTER TABLE public.policies
         ADD CONSTRAINT "${CHECK_NAME}"
         CHECK (organization_id IS NOT NULL) NOT VALID`,
      ),
    );

    const runner = sqlRunnerFromDrizzle(testDb.db, (text) => sql.raw(text));

    await expect(runS7PostMigrateSteps(runner)).resolves.toEqual({
      policiesOrganizationId: 'converged',
      waitlistTenantIdAbsent: true,
    });

    expect(await policiesNullable()).toBe('NO');
    expect(await helperCheckExists()).toBe(false);
  });

  it('is idempotent after complete convergence', async () => {
    const runner = sqlRunnerFromDrizzle(testDb.db, (text) => sql.raw(text));

    await expect(runS7PostMigrateSteps(runner)).resolves.toEqual({
      policiesOrganizationId: 'already-not-null',
      waitlistTenantIdAbsent: true,
    });

    expect(await policiesNullable()).toBe('NO');
    expect(await helperCheckExists()).toBe(false);
  });

  it('recovers from partial success: NOT NULL already set but helper CHECK still present', async () => {
    await testDb.db.execute(
      sql.raw(
        `ALTER TABLE public.policies
         ADD CONSTRAINT "${CHECK_NAME}"
         CHECK (organization_id IS NOT NULL)`,
      ),
    );

    expect(await policiesNullable()).toBe('NO');
    expect(await helperCheckExists()).toBe(true);

    const runner = sqlRunnerFromDrizzle(testDb.db, (text) => sql.raw(text));

    await expect(runS7PostMigrateSteps(runner)).resolves.toEqual({
      policiesOrganizationId: 'converged',
      waitlistTenantIdAbsent: true,
    });

    expect(await policiesNullable()).toBe('NO');
    expect(await helperCheckExists()).toBe(false);
  });

  it('fails closed when organization_id is nullable but the required helper CHECK is missing', async () => {
    await testDb.db.execute(
      sql`ALTER TABLE public.policies ALTER COLUMN organization_id DROP NOT NULL`,
    );

    const runner = sqlRunnerFromDrizzle(testDb.db, (text) => sql.raw(text));

    await expect(runS7PostMigrateSteps(runner)).rejects.toThrow(
      /required CHECK constraint policies_organization_id_not_null is missing/i,
    );

    expect(await policiesNullable()).toBe('YES');
  });

  it('fails closed when the same-name helper CHECK has the wrong definition', async () => {
    await testDb.db.execute(
      sql`ALTER TABLE public.policies ALTER COLUMN organization_id DROP NOT NULL`,
    );
    await testDb.db.execute(
      sql.raw(
        `ALTER TABLE public.policies
         ADD CONSTRAINT "${CHECK_NAME}"
         CHECK (effect IN ('allow', 'deny')) NOT VALID`,
      ),
    );

    const runner = sqlRunnerFromDrizzle(testDb.db, (text) => sql.raw(text));

    await expect(runS7PostMigrateSteps(runner)).rejects.toThrow(
      /unexpected definition/i,
    );

    expect(await policiesNullable()).toBe('YES');
    expect(await helperCheckExists()).toBe(true);
  });

  it('fails closed if waitlist_entries.tenant_id still exists', async () => {
    await testDb.db.execute(
      sql`ALTER TABLE public.waitlist_entries ADD COLUMN tenant_id uuid`,
    );

    const runner = sqlRunnerFromDrizzle(testDb.db, (text) => sql.raw(text));

    await expect(runS7PostMigrateSteps(runner)).rejects.toThrow(
      /waitlist_entries\.tenant_id still exists/i,
    );

    expect(await waitlistTenantIdExists()).toBe(true);
  });

  it('final schema rejects a NULL policies.organization_id', async () => {
    await expect(
      testDb.db.execute(sql`
        INSERT INTO public.policies (
          id,
          organization_id,
          role_id,
          effect,
          resource,
          actions,
          conditions
        )
        VALUES (
          'f7000000-0000-4000-8000-000000000001',
          NULL,
          NULL,
          'allow',
          's7:test',
          '["s7:test"]'::jsonb,
          '{}'::jsonb
        )
      `),
    ).rejects.toThrow();

    expect(await policiesNullable()).toBe('NO');
  });

  it('recognizes a genuine pre-0008 schema shape on a real database', async () => {
    await testDb.db
      .transaction(async (tx) => {
        await tx.execute(sql`
          ALTER TABLE public.policies
          RENAME COLUMN organization_id TO tenant_id
        `);

        // 0008 introduced both tables. Removing them inside this rollback-only
        // transaction reconstructs the durable pre-0008 signature that the
        // production gate relies on.
        await tx.execute(sql`DROP TABLE public.waitlist_entries CASCADE`);
        await tx.execute(sql`DROP TABLE public.organizations CASCADE`);

        const runner = sqlRunnerFromDrizzle(tx, (text) => sql.raw(text));
        const evidence = await gatherS7ProductionEvidence(runner);

        expect(evidence).toEqual({
          preS7Schema: true,
          waitlistTenantIdExists: false,
          waitlistRowsWithTenantId: 0,
          policiesNullOrganizationId: 0,
          policiesOrganizationIdNullable: false,
          policiesHelperCheckExists: false,
        });

        throw new Error('ROLLBACK_PRE_S7_TEST');
      })
      .catch((error: unknown) => {
        if (
          !(error instanceof Error) ||
          error.message !== 'ROLLBACK_PRE_S7_TEST'
        ) {
          throw error;
        }
      });

    expect(await policiesNullable()).toBe('NO');
    expect(await waitlistTenantIdExists()).toBe(false);
  });

  it('fails closed on a renamed-back policies column when 0008+ tables remain', async () => {
    await testDb.db
      .transaction(async (tx) => {
        await tx.execute(sql`
          ALTER TABLE public.policies
          RENAME COLUMN organization_id TO tenant_id
        `);

        const runner = sqlRunnerFromDrizzle(tx, (text) => sql.raw(text));

        await expect(gatherS7ProductionEvidence(runner)).rejects.toThrow(
          /unknown schema drift/i,
        );

        throw new Error('ROLLBACK_S7_DRIFT_TEST');
      })
      .catch((error: unknown) => {
        if (
          !(error instanceof Error) ||
          error.message !== 'ROLLBACK_S7_DRIFT_TEST'
        ) {
          throw error;
        }
      });

    expect(await policiesNullable()).toBe('NO');
    expect(await waitlistTenantIdExists()).toBe(false);
  });
});
