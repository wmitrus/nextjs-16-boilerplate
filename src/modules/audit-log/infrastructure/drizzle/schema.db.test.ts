/** @vitest-environment node */
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { auditEventsTable, auditLogSettingsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 AUD·A — additive canonical ownership schema for `audit_events` and
 * `audit_log_settings`, proven against a real (PGlite / Postgres) database:
 * the fail-closed `ownership_state` default, legacy coexistence, the scoped
 * canonical partial unique (settings), both `ownership_state ↔ organization_id`
 * CHECKs (installed NOT VALID but enforced for new/changed rows), and the
 * per-table FK deletion semantics (SET NULL for events, CASCADE for settings).
 *
 * AUD·A is additive only — no runtime reader/writer is exercised here.
 */

let testDb: TestDb;

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG_MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// Legacy-tenant marker strings this suite writes into `tenant_id`, so cleanup
// can be scoped instead of a whole-table delete.
const SUITE_TENANT_TAGS = [
  'legacy-acme',
  'legacy-globex',
  'legacy-a1',
  'legacy-a2',
  'legacy-a',
  'legacy-b',
  'seed-fixture',
] as const;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterEach(async () => {
  await testDb.db.execute(
    sql`DELETE FROM audit_events WHERE tenant_id IN (${sql.join(
      SUITE_TENANT_TAGS.map((t) => sql`${t}`),
      sql`, `,
    )}) OR organization_id IN (${ORG_A}, ${ORG_B})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM audit_log_settings WHERE tenant_id IN (${sql.join(
      SUITE_TENANT_TAGS.map((t) => sql`${t}`),
      sql`, `,
    )}) OR organization_id IN (${ORG_A}, ${ORG_B})`,
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

/**
 * `postgres-js` wraps driver errors in drizzle's `DrizzleQueryError`; the real
 * constraint name lives on `.cause`. Walk the chain (mirrors the feature-flags
 * suite).
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

async function constraintValidated(conname: string): Promise<boolean> {
  const res = await testDb.db.execute(
    sql`SELECT convalidated FROM pg_constraint WHERE conname = ${conname}`,
  );
  const rows = (
    Array.isArray(res) ? res : (res as { rows: unknown[] }).rows
  ) as Array<{ convalidated: boolean }>;
  expect(rows, `constraint ${conname} must exist`).toHaveLength(1);
  return rows[0]!.convalidated;
}

describe('AUD·A — audit_events / audit_log_settings schema contract (real DB)', () => {
  describe('fail-closed ownership_state default', () => {
    it('a legacy-shaped audit_events insert (no ownership_state, no organization_id) becomes unresolved_legacy / NULL', async () => {
      await testDb.db.execute(
        sql`INSERT INTO audit_events (category, action, outcome, tenant_id)
            VALUES ('auth', 'login', 'success', 'legacy-acme')`,
      );
      const rows = await testDb.db
        .select({
          ownershipState: auditEventsTable.ownershipState,
          organizationId: auditEventsTable.organizationId,
          tenantId: auditEventsTable.tenantId,
        })
        .from(auditEventsTable)
        .where(eq(auditEventsTable.tenantId, 'legacy-acme'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.ownershipState).toBe('unresolved_legacy');
      expect(rows[0]?.ownershipState).not.toBe('intentional_global');
      expect(rows[0]?.organizationId).toBeNull();
    });

    it('a legacy-shaped audit_log_settings insert becomes unresolved_legacy / NULL', async () => {
      await testDb.db.execute(
        sql`INSERT INTO audit_log_settings (category, tenant_id, enabled, retention_days)
            VALUES ('auth', 'legacy-acme', true, 30)`,
      );
      const rows = await testDb.db
        .select({
          ownershipState: auditLogSettingsTable.ownershipState,
          organizationId: auditLogSettingsTable.organizationId,
        })
        .from(auditLogSettingsTable)
        .where(eq(auditLogSettingsTable.tenantId, 'legacy-acme'));
      expect(rows[0]?.ownershipState).toBe('unresolved_legacy');
      expect(rows[0]?.organizationId).toBeNull();
    });
  });

  describe('legacy audit_log_settings uniqueness is unchanged', () => {
    it('two legacy rows, same category, different tenant_id coexist', async () => {
      await testDb.db.execute(
        sql`INSERT INTO audit_log_settings (category, tenant_id, enabled, retention_days) VALUES
            ('auth', 'legacy-acme', true, 30),
            ('auth', 'legacy-globex', false, 30)`,
      );
      const rows = await testDb.db
        .select({ tenantId: auditLogSettingsTable.tenantId })
        .from(auditLogSettingsTable)
        .where(eq(auditLogSettingsTable.category, 'auth'))
        .orderBy(asc(auditLogSettingsTable.tenantId));
      expect(rows.map((r) => r.tenantId)).toEqual([
        'legacy-acme',
        'legacy-globex',
      ]);
    });

    it('uq_audit_log_settings_category_tenant still fires on a duplicate (category, tenant_id)', async () => {
      await testDb.db.execute(
        sql`INSERT INTO audit_log_settings (category, tenant_id, enabled, retention_days)
            VALUES ('auth', 'legacy-acme', true, 30)`,
      );
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO audit_log_settings (category, tenant_id, enabled, retention_days)
                VALUES ('auth', 'legacy-acme', false, 30)`,
          ),
        /unique|uq_audit_log_settings_category_tenant|duplicate/i,
      );
    });

    it('NULLS NOT DISTINCT still collapses two global (tenant_id NULL) rows for a category', async () => {
      await testDb.db.execute(
        sql`INSERT INTO audit_log_settings (category, tenant_id, enabled, retention_days)
            VALUES ('membership', NULL, true, 30)`,
      );
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO audit_log_settings (category, tenant_id, enabled, retention_days)
                VALUES ('membership', NULL, false, 30)`,
          ),
        /unique|uq_audit_log_settings_category_tenant|duplicate/i,
      );
      await testDb.db.execute(
        sql`DELETE FROM audit_log_settings WHERE category = 'membership'`,
      );
    });
  });

  describe('audit_log_settings canonical scoped uniqueness', () => {
    it('rejects a second canonical override for the same (category, organization)', async () => {
      await seedOrganizations();
      await testDb.db.execute(
        sql`INSERT INTO audit_log_settings (category, tenant_id, organization_id, ownership_state, enabled, retention_days)
            VALUES ('auth', 'legacy-a1', ${ORG_A}, 'canonical_organization', true, 30)`,
      );
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO audit_log_settings (category, tenant_id, organization_id, ownership_state, enabled, retention_days)
                VALUES ('auth', 'legacy-a2', ${ORG_A}, 'canonical_organization', false, 30)`,
          ),
        /uq_audit_log_settings_category_organization_canonical/i,
      );
    });

    it('allows the same category as a canonical override for a different organization', async () => {
      await seedOrganizations();
      await testDb.db.execute(
        sql`INSERT INTO audit_log_settings (category, tenant_id, organization_id, ownership_state, enabled, retention_days) VALUES
            ('auth', 'legacy-a', ${ORG_A}, 'canonical_organization', true, 30),
            ('auth', 'legacy-b', ${ORG_B}, 'canonical_organization', true, 30)`,
      );
      const rows = await testDb.db
        .select({ id: auditLogSettingsTable.id })
        .from(auditLogSettingsTable)
        .where(eq(auditLogSettingsTable.category, 'auth'));
      expect(rows).toHaveLength(2);
    });

    it('does not collide across NULL-organization_id legacy rows', async () => {
      await testDb.db.execute(
        sql`INSERT INTO audit_log_settings (category, tenant_id, enabled, retention_days) VALUES
            ('auth', 'legacy-acme', true, 30),
            ('auth', 'legacy-globex', true, 30)`,
      );
      const rows = await testDb.db
        .select({ id: auditLogSettingsTable.id })
        .from(auditLogSettingsTable)
        .where(eq(auditLogSettingsTable.category, 'auth'));
      expect(rows).toHaveLength(2);
    });
  });

  describe('audit_log_settings ownership CHECK (feature_flags shape)', () => {
    it('rejects canonical_organization with a NULL organization_id', async () => {
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO audit_log_settings (category, organization_id, ownership_state, enabled, retention_days)
                VALUES ('auth', NULL, 'canonical_organization', true, 30)`,
          ),
        /check|ck_audit_log_settings_ownership_state_org|violates/i,
      );
    });

    it.each([['intentional_global'], ['unresolved_legacy'], ['quarantined']])(
      'rejects %s with a non-NULL organization_id',
      async (state) => {
        await seedOrganizations();
        await expectRejection(
          () =>
            testDb.db.execute(
              sql`INSERT INTO audit_log_settings (category, organization_id, ownership_state, enabled, retention_days)
                VALUES ('auth', ${ORG_A}, ${state}, true, 30)`,
            ),
          /check|ck_audit_log_settings_ownership_state_org|violates/i,
        );
      },
    );

    it('accepts every valid combination', async () => {
      await seedOrganizations();
      await testDb.db.execute(
        sql`INSERT INTO audit_log_settings (category, tenant_id, organization_id, ownership_state, enabled, retention_days) VALUES
            ('auth',        'legacy-a', ${ORG_A}, 'canonical_organization', true, 30),
            ('admin_access', NULL,      NULL,     'intentional_global',     true, 30),
            ('membership',   'legacy-acme', NULL,  'unresolved_legacy',     true, 30),
            ('billing',      'legacy-globex', NULL, 'quarantined',          true, 30)`,
      );
      const rows = await testDb.db.select().from(auditLogSettingsTable);
      expect(rows.length).toBeGreaterThanOrEqual(4);
      await testDb.db.execute(
        sql`DELETE FROM audit_log_settings WHERE category IN ('admin_access','membership','billing') AND organization_id IS NULL`,
      );
    });

    it('rejects a value outside the four-state domain', async () => {
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO audit_log_settings (category, organization_id, ownership_state, enabled, retention_days)
                VALUES ('auth', NULL, 'something_else', true, 30)`,
          ),
        /check|ck_audit_log_settings_ownership_state_org|violates/i,
      );
    });
  });

  describe('audit_events ownership CHECK (append-only shape)', () => {
    it('accepts canonical_organization with a non-NULL organization_id', async () => {
      await seedOrganizations();
      await testDb.db.execute(
        sql`INSERT INTO audit_events (category, action, outcome, tenant_id, organization_id, ownership_state)
            VALUES ('auth', 'login', 'success', 'legacy-a', ${ORG_A}, 'canonical_organization')`,
      );
      const rows = await testDb.db
        .select({ organizationId: auditEventsTable.organizationId })
        .from(auditEventsTable)
        .where(eq(auditEventsTable.organizationId, ORG_A));
      expect(rows).toHaveLength(1);
    });

    it('ALSO accepts canonical_organization with a NULL organization_id (transient post-SET NULL state, §14a.2)', async () => {
      await testDb.db.execute(
        sql`INSERT INTO audit_events (category, action, outcome, tenant_id, organization_id, ownership_state)
            VALUES ('auth', 'login', 'success', 'legacy-acme', NULL, 'canonical_organization')`,
      );
      const rows = await testDb.db
        .select({ ownershipState: auditEventsTable.ownershipState })
        .from(auditEventsTable)
        .where(eq(auditEventsTable.tenantId, 'legacy-acme'));
      expect(rows[0]?.ownershipState).toBe('canonical_organization');
    });

    it.each([
      ['organization_owned_orphaned'],
      ['intentional_global'],
      ['unresolved_legacy'],
      ['quarantined'],
    ])('rejects %s with a non-NULL organization_id', async (state) => {
      await seedOrganizations();
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO audit_events (category, action, outcome, tenant_id, organization_id, ownership_state)
                VALUES ('auth', 'x', 'success', 'legacy-a', ${ORG_A}, ${state})`,
          ),
        /check|ck_audit_events_ownership_state_org|violates/i,
      );
    });

    it('accepts every NULL-org state', async () => {
      await testDb.db.execute(
        sql`INSERT INTO audit_events (category, action, outcome, tenant_id, organization_id, ownership_state) VALUES
            ('auth', 'a', 'success', 'legacy-acme',   NULL, 'organization_owned_orphaned'),
            ('auth', 'b', 'success', 'legacy-globex', NULL, 'intentional_global'),
            ('auth', 'c', 'success', 'legacy-a1',     NULL, 'unresolved_legacy'),
            ('auth', 'd', 'success', 'legacy-a2',     NULL, 'quarantined')`,
      );
      const rows = await testDb.db
        .select({ id: auditEventsTable.id })
        .from(auditEventsTable)
        .where(sql`${auditEventsTable.tenantId} LIKE 'legacy-%'`);
      expect(rows.length).toBeGreaterThanOrEqual(4);
    });

    it('rejects a value outside the five-state domain', async () => {
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO audit_events (category, action, outcome, tenant_id, ownership_state)
                VALUES ('auth', 'x', 'success', 'legacy-acme', 'something_else')`,
          ),
        /check|ck_audit_events_ownership_state_org|violates/i,
      );
    });
  });

  describe('organization_id FK deletion semantics', () => {
    it('rejects a non-existent organization_id on both tables', async () => {
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO audit_events (category, action, outcome, tenant_id, organization_id, ownership_state)
                VALUES ('auth', 'x', 'success', 'legacy-acme', ${ORG_MISSING}, 'canonical_organization')`,
          ),
        /foreign key|audit_events_organization_id_organizations_id_fk|violates/i,
      );
      await expectRejection(
        () =>
          testDb.db.execute(
            sql`INSERT INTO audit_log_settings (category, tenant_id, organization_id, ownership_state, enabled, retention_days)
                VALUES ('auth', 'legacy-acme', ${ORG_MISSING}, 'canonical_organization', true, 30)`,
          ),
        /foreign key|audit_log_settings_organization_id_organizations_id_fk|violates/i,
      );
    });

    it('audit_events: ON DELETE SET NULL — the event row survives org deletion, organization_id becomes NULL, state unchanged', async () => {
      await seedOrganizations();
      await testDb.db.execute(
        sql`INSERT INTO audit_events (category, action, outcome, tenant_id, organization_id, ownership_state)
            VALUES ('auth', 'login', 'success', 'legacy-a', ${ORG_A}, 'canonical_organization')`,
      );
      await testDb.db.execute(
        sql`DELETE FROM organizations WHERE id = ${ORG_A}`,
      );
      const rows = await testDb.db
        .select({
          organizationId: auditEventsTable.organizationId,
          ownershipState: auditEventsTable.ownershipState,
        })
        .from(auditEventsTable)
        .where(eq(auditEventsTable.tenantId, 'legacy-a'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.organizationId).toBeNull();
      // AUD·A does not run reconciliation — the state is untouched by SET NULL,
      // and the append-only CHECK still permits canonical_organization + NULL.
      expect(rows[0]?.ownershipState).toBe('canonical_organization');
    });

    it('audit_log_settings: ON DELETE CASCADE — the override row is removed with its organization', async () => {
      await seedOrganizations();
      await testDb.db.execute(
        sql`INSERT INTO audit_log_settings (category, tenant_id, organization_id, ownership_state, enabled, retention_days) VALUES
            ('auth', 'legacy-a', ${ORG_A}, 'canonical_organization', true, 30),
            ('auth', 'legacy-b', ${ORG_B}, 'canonical_organization', true, 30)`,
      );
      await testDb.db.execute(
        sql`DELETE FROM organizations WHERE id = ${ORG_A}`,
      );
      const rows = await testDb.db
        .select({ organizationId: auditLogSettingsTable.organizationId })
        .from(auditLogSettingsTable)
        .where(eq(auditLogSettingsTable.category, 'auth'));
      expect(rows.map((r) => r.organizationId)).toEqual([ORG_B]);
    });
  });

  describe('constraint validation state after AUD·A', () => {
    it('both ownership CHECKs are NOT VALID (convalidated = false)', async () => {
      expect(
        await constraintValidated('ck_audit_events_ownership_state_org'),
      ).toBe(false);
      expect(
        await constraintValidated('ck_audit_log_settings_ownership_state_org'),
      ).toBe(false);
    });

    it('both organization FKs ARE validated (convalidated = true) after the post-migrate step', async () => {
      expect(
        await constraintValidated(
          'audit_events_organization_id_organizations_id_fk',
        ),
      ).toBe(true);
      expect(
        await constraintValidated(
          'audit_log_settings_organization_id_organizations_id_fk',
        ),
      ).toBe(true);
    });
  });

  describe('audit_events organization lookup index exists (post-migrate step end state)', () => {
    it('idx_audit_events_organization_occurred is present and valid on (organization_id, occurred_at)', async () => {
      const res = await testDb.db.execute(
        sql`SELECT i.indisvalid, pg_get_indexdef(i.indexrelid) AS indexdef
            FROM pg_class c
            JOIN pg_index i ON i.indexrelid = c.oid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = 'idx_audit_events_organization_occurred'`,
      );
      const rows = (
        Array.isArray(res) ? res : (res as { rows: unknown[] }).rows
      ) as Array<{ indisvalid: boolean; indexdef: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.indisvalid).toBe(true);
      expect(rows[0]?.indexdef).toMatch(
        /audit_events USING btree \(organization_id, occurred_at\)/,
      );
    });
  });
});
