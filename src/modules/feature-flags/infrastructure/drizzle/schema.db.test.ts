/** @vitest-environment node */
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { featureFlagsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 FF·A — additive canonical ownership schema for `feature_flags`.
 *
 * Proves the migration-added schema contract against a real (PGlite / Postgres)
 * database: the fail-closed `ownership_state` default, legacy coexistence, the
 * scoped canonical partial unique, the `ownership_state ↔ organization_id`
 * CHECK, and the `ON DELETE CASCADE` FK to `organizations`.
 *
 * FF·A is additive only — no runtime reader/writer is exercised here.
 */

let testDb: TestDb;

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG_MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/**
 * Every `feature_flags.key` this suite inserts. `afterEach` deletes exactly
 * these rows (not a bare `DELETE FROM feature_flags`), so the suite stays
 * self-scoped and order-independent even against a shared real Postgres. Add a
 * key here whenever a new test inserts one.
 */
const SUITE_FLAG_KEYS = [
  'legacy-flag',
  'legacy-flag-2',
  'shared',
  'dup',
  'scoped-nc',
  'X',
  'bad1',
  'bad2',
  'bad3',
  'bad4',
  'ok-canon',
  'ok-global',
  'ok-unres',
  'ok-quar',
  'bad-domain',
  'fk-bad',
  'fk-ok',
  'cascade-me',
  'keep-me',
] as const;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterEach(async () => {
  // Scope cleanup to only the rows this suite creates so it stays safe to run
  // alongside other suites against a shared real Postgres: the suite's own
  // `feature_flags` keys, and only the fixed org / tenant fixtures — never a
  // whole-table delete of `feature_flags`, `organizations` or `tenants`.
  await testDb.db.execute(
    sql`DELETE FROM feature_flags WHERE key IN (${sql.join(
      SUITE_FLAG_KEYS.map((k) => sql`${k}`),
      sql`, `,
    )})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM organizations WHERE id IN (${ORG_A}, ${ORG_B})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM tenants WHERE id IN (${TENANT_A}, ${TENANT_B})`,
  );
});

afterAll(async () => {
  await testDb.cleanup();
});

async function seedOrganizations(): Promise<void> {
  await testDb.db.execute(
    sql`INSERT INTO tenants (id, name) VALUES (${TENANT_A}, 'Tenant A'), (${TENANT_B}, 'Tenant B')`,
  );
  await testDb.db.execute(
    sql`INSERT INTO organizations (id, tenant_id, name) VALUES
        (${ORG_A}, ${TENANT_A}, 'Org A'),
        (${ORG_B}, ${TENANT_B}, 'Org B')`,
  );
}

const allFlags = () =>
  testDb.db
    .select()
    .from(featureFlagsTable)
    .orderBy(asc(featureFlagsTable.key));

/**
 * `postgres-js` wraps the driver error in drizzle's `DrizzleQueryError` whose
 * top-level `message` is only `"Failed query: ..."`; the real constraint
 * name/code lives on `.cause` (PGlite surfaces it directly). Walk the chain.
 */
function errorChainText(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(' | ');
}

async function expectRejection(
  run: () => Promise<unknown>,
  matcher: RegExp,
): Promise<void> {
  let thrown: unknown;
  try {
    await run();
  } catch (err) {
    thrown = err;
  }
  expect(thrown, 'expected the statement to be rejected').toBeDefined();
  expect(errorChainText(thrown)).toMatch(matcher);
}

describe('feature_flags — OZI-71 FF·A schema contract (real DB)', () => {
  describe('10.1 fail-closed ownership_state default', () => {
    it('a row inserted via the legacy shape (no ownership_state, no organization_id) becomes unresolved_legacy', async () => {
      await testDb.db.execute(
        sql`INSERT INTO feature_flags (key, tenant_id, enabled) VALUES ('legacy-flag', 'acme', true)`,
      );

      const rows = await allFlags();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.ownershipState).toBe('unresolved_legacy');
      expect(rows[0]?.organizationId).toBeNull();
    });

    it('the default is never intentional_global', async () => {
      await testDb.db.execute(
        sql`INSERT INTO feature_flags (key, tenant_id, enabled) VALUES ('legacy-flag-2', NULL, false)`,
      );

      const rows = await allFlags();
      expect(rows[0]?.ownershipState).toBe('unresolved_legacy');
      expect(rows[0]?.ownershipState).not.toBe('intentional_global');
    });
  });

  describe('10.2 legacy coexistence', () => {
    it('two legacy-shaped rows with the same key but different tenant_id coexist under the additive schema', async () => {
      await testDb.db.execute(
        sql`INSERT INTO feature_flags (key, tenant_id, enabled) VALUES
            ('shared', 'acme', true),
            ('shared', 'globex', false)`,
      );

      const rows = await testDb.db
        .select({ tenantId: featureFlagsTable.tenantId })
        .from(featureFlagsTable)
        .where(eq(featureFlagsTable.key, 'shared'))
        .orderBy(asc(featureFlagsTable.tenantId));
      expect(rows.map((r) => r.tenantId)).toEqual(['acme', 'globex']);
    });

    it('the legacy uq_feature_flags_key_tenant unique still fires on a duplicate (key, tenant_id)', async () => {
      await testDb.db.execute(
        sql`INSERT INTO feature_flags (key, tenant_id, enabled) VALUES ('dup', 'acme', true)`,
      );
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO feature_flags (key, tenant_id, enabled) VALUES ('dup', 'acme', false)`,
          ),
        /unique|uq_feature_flags_key_tenant|duplicate/i,
      );
    });

    it('the new canonical partial unique does NOT collide across NULL-organization_id legacy rows', async () => {
      await testDb.db.execute(
        sql`INSERT INTO feature_flags (key, tenant_id, enabled) VALUES
            ('scoped-nc', 'acme', true),
            ('scoped-nc', 'globex', true)`,
      );
      const rows = await testDb.db
        .select({ id: featureFlagsTable.id })
        .from(featureFlagsTable)
        .where(eq(featureFlagsTable.key, 'scoped-nc'));
      expect(rows).toHaveLength(2);
    });
  });

  describe('10.3 canonical scoped uniqueness', () => {
    // The legacy `uq_feature_flags_key_tenant NULLS NOT DISTINCT` is still
    // authoritative in FF·A, so each canonical row also carries a distinct
    // legacy `tenant_id` (mirroring what FF·B's canonical dual-write will do) —
    // otherwise the legacy unique masks the canonical one under test.
    it('rejects a second canonical override for the same (key, organization)', async () => {
      await seedOrganizations();

      await testDb.db.execute(
        sql`INSERT INTO feature_flags (key, tenant_id, organization_id, ownership_state, enabled)
            VALUES ('X', 'legacy-a1', ${ORG_A}, 'canonical_organization', true)`,
      );

      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO feature_flags (key, tenant_id, organization_id, ownership_state, enabled)
                VALUES ('X', 'legacy-a2', ${ORG_A}, 'canonical_organization', false)`,
          ),
        /uq_feature_flags_key_organization_canonical/i,
      );
    });

    it('allows the same key as a canonical override for a different organization', async () => {
      await seedOrganizations();

      await testDb.db.execute(
        sql`INSERT INTO feature_flags (key, tenant_id, organization_id, ownership_state, enabled)
            VALUES ('X', 'legacy-a', ${ORG_A}, 'canonical_organization', true)`,
      );
      await testDb.db.execute(
        sql`INSERT INTO feature_flags (key, tenant_id, organization_id, ownership_state, enabled)
            VALUES ('X', 'legacy-b', ${ORG_B}, 'canonical_organization', true)`,
      );

      const rows = await testDb.db
        .select({ id: featureFlagsTable.id })
        .from(featureFlagsTable)
        .where(eq(featureFlagsTable.key, 'X'));
      expect(rows).toHaveLength(2);
    });
  });

  describe('10.4 ownership_state ↔ organization_id CHECK', () => {
    it('rejects canonical_organization with a NULL organization_id', async () => {
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO feature_flags (key, organization_id, ownership_state, enabled)
                VALUES ('bad1', NULL, 'canonical_organization', true)`,
          ),
        /check|ck_feature_flags_ownership_state_org|violates/i,
      );
    });

    it.each([
      ['intentional_global', 'bad2'],
      ['unresolved_legacy', 'bad3'],
      ['quarantined', 'bad4'],
    ])('rejects %s with a non-NULL organization_id', async (state, key) => {
      await seedOrganizations();
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO feature_flags (key, organization_id, ownership_state, enabled)
                VALUES (${key}, ${ORG_A}, ${state}, true)`,
          ),
        /check|ck_feature_flags_ownership_state_org|violates/i,
      );
    });

    it('accepts every valid combination', async () => {
      await seedOrganizations();
      await testDb.db.execute(
        sql`INSERT INTO feature_flags (key, organization_id, ownership_state, enabled) VALUES
            ('ok-canon', ${ORG_A}, 'canonical_organization', true),
            ('ok-global', NULL, 'intentional_global', true),
            ('ok-unres',  NULL, 'unresolved_legacy', true),
            ('ok-quar',   NULL, 'quarantined', true)`,
      );
      expect(await allFlags()).toHaveLength(4);
    });

    it('rejects a value outside the four-state domain', async () => {
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO feature_flags (key, organization_id, ownership_state, enabled)
                VALUES ('bad-domain', NULL, 'something_else', true)`,
          ),
        /check|ck_feature_flags_ownership_state_org|violates/i,
      );
    });
  });

  describe('10.5 organization_id FK', () => {
    it('rejects a non-existent organization_id', async () => {
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO feature_flags (key, organization_id, ownership_state, enabled)
                VALUES ('fk-bad', ${ORG_MISSING}, 'canonical_organization', true)`,
          ),
        /foreign key|feature_flags_organization_id_organizations_id_fk|violates/i,
      );
    });

    it('allows a canonical flag referencing an existing organization', async () => {
      await seedOrganizations();
      await testDb.db.execute(
        sql`INSERT INTO feature_flags (key, organization_id, ownership_state, enabled)
            VALUES ('fk-ok', ${ORG_A}, 'canonical_organization', true)`,
      );
      expect(await allFlags()).toHaveLength(1);
    });

    it('CASCADE-deletes the canonical flag row when its organization is deleted', async () => {
      await seedOrganizations();
      await testDb.db.execute(
        sql`INSERT INTO feature_flags (key, organization_id, ownership_state, enabled) VALUES
            ('cascade-me', ${ORG_A}, 'canonical_organization', true),
            ('keep-me', ${ORG_B}, 'canonical_organization', true)`,
      );

      await testDb.db.execute(
        sql`DELETE FROM organizations WHERE id = ${ORG_A}`,
      );

      const rows = await allFlags();
      expect(rows.map((r) => r.key)).toEqual(['keep-me']);
    });
  });

  describe('10.6 CHECK is installed NOT VALID but still enforces new/changed rows', () => {
    it('pg_constraint records the CHECK as convalidated = false after FF·A', async () => {
      const res = await testDb.db.execute(
        sql`SELECT convalidated
            FROM pg_constraint
            WHERE conname = 'ck_feature_flags_ownership_state_org'`,
      );
      const rows = (
        Array.isArray(res) ? res : (res as { rows: unknown[] }).rows
      ) as Array<{ convalidated: boolean }>;

      expect(rows).toHaveLength(1);
      // `false` => the historical back-scan is deferred to a later
      // `VALIDATE CONSTRAINT` (plan §14a.9). FF·A must not validate it.
      expect(rows[0]?.convalidated).toBe(false);
    });

    it('rejects an INSERT that violates the NOT VALID CHECK', async () => {
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO feature_flags (key, organization_id, ownership_state, enabled)
                VALUES ('bad1', NULL, 'canonical_organization', true)`,
          ),
        /check|ck_feature_flags_ownership_state_org|violates/i,
      );
    });

    it('rejects an UPDATE that moves an existing valid row into a violating state', async () => {
      await testDb.db.execute(
        sql`INSERT INTO feature_flags (key, organization_id, ownership_state, enabled)
            VALUES ('ok-global', NULL, 'intentional_global', true)`,
      );

      await expectRejection(
        () =>
          testDb.db.execute(
            sql`UPDATE feature_flags
                SET ownership_state = 'canonical_organization'
                WHERE key = 'ok-global'`,
          ),
        /check|ck_feature_flags_ownership_state_org|violates/i,
      );
    });
  });
});
