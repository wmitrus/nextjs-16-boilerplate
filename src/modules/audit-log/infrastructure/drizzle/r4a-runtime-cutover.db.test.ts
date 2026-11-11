/** @vitest-environment node */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { AuditWriteScope } from '@/core/contracts/audit-log';
import { bootstrapR4aSchemaAConcurrent } from '@/core/db/r4a-compact-index-bootstrap';
import { r4aExecutorRunnerFromPostgres } from '@/core/db/r4a-compact-index-executor';
import { inspectR4aCompactIndex } from '@/core/db/r4a-compact-index-inspection';
import type { DrizzleDb } from '@/core/db/types';

import { isSettingsCanonicalPartialUniqueViolation } from '../../../../../scripts/audit-log/backfill-canonical-ownership';
import { isCanonicalPartialUniqueViolation } from '../../../../../scripts/flags/backfill-canonical-ownership';
import {
  AuditCanonicalWriteInvariantError,
  AuditSettingAliasConflictError,
} from '../../domain/errors';

import { DrizzleAuditLogSettingsAdminService } from './DrizzleAuditLogSettingsAdminService';
import { resolveLegacyAuditRetentionCompat } from './effective-settings';

import {
  startIsolatedPostgres,
  type IsolatedPostgres,
} from '@/testing/db/isolated-postgres';

/**
 * OZI-219 (R4a-B) mixed-version compatibility matrix on real PostgreSQL.
 *
 * Schema states, applied in order to one disposable Testcontainers database
 * (the DDL cannot share the DB CI fixture):
 *   baseline -> expanded A (R4a executor) -> contracted C (test-only partial
 *   DROP) -> rollback of C (partials re-created) .
 *
 * "Old runtime" is the AUD·D settings UPSERT SQL verbatim from
 * main@0cf2635f (pre-B); "new runtime" is the live service.
 */
const TENANT_A = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const TENANT_B = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b';
const ORG_A1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const ORG_A2 = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
const ORG_B1 = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const CATEGORY = 'auth' as const;

const PARTIALS_DDL = [
  `CREATE UNIQUE INDEX "uq_audit_log_settings_category_organization_canonical" ON "audit_log_settings" USING btree ("category","organization_id") WHERE "audit_log_settings"."organization_id" is not null and "audit_log_settings"."ownership_state" = 'canonical_organization'`,
  `CREATE UNIQUE INDEX "uq_audit_log_settings_category_intentional_global" ON "audit_log_settings" USING btree ("category") WHERE "audit_log_settings"."ownership_state" = 'intentional_global'`,
  `CREATE UNIQUE INDEX "uq_feature_flags_key_organization_canonical" ON "feature_flags" USING btree ("key","organization_id") WHERE "feature_flags"."organization_id" is not null and "feature_flags"."ownership_state" = 'canonical_organization'`,
  `CREATE UNIQUE INDEX "uq_feature_flags_key_intentional_global" ON "feature_flags" USING btree ("key") WHERE "feature_flags"."ownership_state" = 'intentional_global'`,
] as const;
const PARTIALS = [
  'uq_audit_log_settings_category_organization_canonical',
  'uq_audit_log_settings_category_intentional_global',
  'uq_feature_flags_key_organization_canonical',
  'uq_feature_flags_key_intentional_global',
] as const;

const OLD_GLOBAL_UPSERT = `
  INSERT INTO "audit_log_settings"
    (category, tenant_id, organization_id, ownership_state, enabled,
     retention_days, sample_rate, capture_input_on_success, updated_by_user_id)
  VALUES ($1, NULL, NULL, 'intentional_global', $2, $3, NULL, false, NULL)
  ON CONFLICT (category)
    WHERE ownership_state = 'intentional_global'
  DO UPDATE SET
    tenant_id = NULL,
    organization_id = NULL,
    ownership_state = 'intentional_global',
    enabled = EXCLUDED.enabled,
    retention_days = EXCLUDED.retention_days,
    sample_rate = EXCLUDED.sample_rate,
    capture_input_on_success = EXCLUDED.capture_input_on_success,
    updated_by_user_id = EXCLUDED.updated_by_user_id,
    updated_at = now()
  RETURNING id`;
const OLD_ORG_UPSERT = `
  INSERT INTO "audit_log_settings"
    (category, tenant_id, organization_id, ownership_state, enabled,
     retention_days, sample_rate, capture_input_on_success, updated_by_user_id)
  SELECT $1, o.id, o.id, 'canonical_organization', $2, $3, NULL, false, NULL
  FROM "organizations" o
  WHERE o.id = $4 AND o.tenant_id = $5
  ON CONFLICT (category, organization_id)
    WHERE organization_id IS NOT NULL
      AND ownership_state = 'canonical_organization'
  DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    enabled = EXCLUDED.enabled,
    retention_days = EXCLUDED.retention_days,
    sample_rate = EXCLUDED.sample_rate,
    capture_input_on_success = EXCLUDED.capture_input_on_success,
    updated_by_user_id = EXCLUDED.updated_by_user_id,
    updated_at = now()
  RETURNING id`;

let database: IsolatedPostgres | undefined;
let client: Sql;
let executorSession: Sql;
let svc: DrizzleAuditLogSettingsAdminService;
let db: DrizzleDb;

const globalScope: AuditWriteScope = { kind: 'platform-global' };
const orgScope = (organizationId: string, tenantId: string) =>
  ({ kind: 'organization', organizationId, tenantId }) as AuditWriteScope;
const input = (retentionDays: number) => ({
  category: CATEGORY,
  enabled: true,
  retentionDays,
  captureInputOnSuccess: false,
  updatedByUserId: null,
});

const oldGlobal = (retentionDays: number) =>
  client.unsafe(OLD_GLOBAL_UPSERT, [CATEGORY, true, retentionDays]);
const oldOrg = (
  retentionDays: number,
  organizationId: string,
  tenantId: string,
) =>
  client.unsafe(OLD_ORG_UPSERT, [
    CATEGORY,
    true,
    retentionDays,
    organizationId,
    tenantId,
  ]);
const newGlobal = (retentionDays: number) =>
  svc.upsertCanonical(input(retentionDays), globalScope);
const newOrg = (
  retentionDays: number,
  organizationId: string,
  tenantId: string,
) =>
  svc.upsertCanonical(input(retentionDays), orgScope(organizationId, tenantId));

interface SettingRow {
  id: string;
  tenant_id: string | null;
  organization_id: string | null;
  ownership_state: string;
  retention_days: number;
}
const settings = () =>
  client.unsafe<SettingRow[]>(
    `SELECT id, tenant_id, organization_id, ownership_state, retention_days
     FROM audit_log_settings ORDER BY organization_id NULLS FIRST, tenant_id`,
  );
const seedSetting = (
  tenantId: string | null,
  organizationId: string | null,
  ownershipState: string,
) =>
  client.unsafe(
    `INSERT INTO audit_log_settings
       (category, tenant_id, organization_id, ownership_state, enabled, retention_days)
     VALUES ($1, $2, $3, $4, true, 30)`,
    [CATEGORY, tenantId, organizationId, ownershipState],
  );

/** SQLSTATE through driver/ORM wrappers (`cause` chain). */
function sqlState(error: unknown): string | undefined {
  for (let e = error; e && typeof e === 'object'; ) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}
async function rejection(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the statement to fail');
}
async function indexNames(): Promise<string[]> {
  const rows = await client.unsafe<{ name: string }[]>(
    `SELECT indexrelid::regclass::text AS name FROM pg_index
     WHERE indrelid IN ('public.audit_log_settings'::regclass, 'public.feature_flags'::regclass)
       AND indisunique AND NOT indisprimary ORDER BY 1`,
  );
  return rows.map((row) => row.name).sort();
}

/** The backfill's canonical UPDATE colliding with an existing canonical row. */
async function canonicalCollision(table: 'settings' | 'flags') {
  if (table === 'settings') {
    await seedSetting(ORG_A1, ORG_A1, 'canonical_organization');
    await seedSetting('legacy-key', null, 'unresolved_legacy');
    return rejection(
      client.unsafe(
        `UPDATE audit_log_settings
         SET organization_id = $1, ownership_state = 'canonical_organization'
         WHERE tenant_id = 'legacy-key'`,
        [ORG_A1],
      ),
    );
  }
  await client.unsafe(
    `INSERT INTO feature_flags (key, tenant_id, organization_id, ownership_state, enabled)
     VALUES ('r4a', $1, $2, 'canonical_organization', true),
            ('r4a', 'legacy-key', NULL, 'unresolved_legacy', true)`,
    [ORG_A1, ORG_A1],
  );
  return rejection(
    client.unsafe(
      `UPDATE feature_flags
       SET organization_id = $1, ownership_state = 'canonical_organization'
       WHERE tenant_id = 'legacy-key'`,
      [ORG_A1],
    ),
  );
}
const constraintOf = (error: unknown) =>
  (error as { constraint_name?: string }).constraint_name;

beforeAll(async () => {
  database = await startIsolatedPostgres({ r4aSchemaA: 'absent' });
  const host = new URL(database.url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost')
    throw new Error(
      'R4a cutover DB tests require local Testcontainers PostgreSQL',
    );
  client = postgres(database.url, { max: 1, prepare: false });
  executorSession = postgres(database.url, { max: 1, prepare: false });
  db = drizzle(client) as unknown as DrizzleDb;
  svc = new DrizzleAuditLogSettingsAdminService(db);
  await client.unsafe(
    `INSERT INTO tenants (id, name) VALUES ($1, 'R4a A'), ($2, 'R4a B')`,
    [TENANT_A, TENANT_B],
  );
  await client.unsafe(
    `INSERT INTO organizations (id, tenant_id, name) VALUES
       ($1, $4, 'R4a A1'), ($2, $4, 'R4a A2'), ($3, $5, 'R4a B1')`,
    [ORG_A1, ORG_A2, ORG_B1, TENANT_A, TENANT_B],
  );
  for (const check of [
    'ALTER TABLE feature_flags VALIDATE CONSTRAINT ck_feature_flags_ownership_state_org',
    'ALTER TABLE audit_log_settings VALIDATE CONSTRAINT ck_audit_log_settings_ownership_state_org',
  ])
    await client.unsafe(check);
});

afterEach(async () => {
  await client.unsafe('DELETE FROM audit_log_settings');
  await client.unsafe('DELETE FROM feature_flags');
});

afterAll(async () => {
  await executorSession?.end({ timeout: 5 });
  await client?.end({ timeout: 5 });
  await database?.stop();
});

/** Behaviour every schema with the compact unique (A and C) must satisfy. */
function newRuntimeContract() {
  it('global UPSERT twice updates one intentional-global row with a NULL shadow', async () => {
    await newGlobal(30);
    const dto = await newGlobal(60);
    expect(dto).toMatchObject({ retentionDays: 60, tenantId: null });
    expect(await settings()).toMatchObject([
      {
        tenant_id: null,
        organization_id: null,
        ownership_state: 'intentional_global',
        retention_days: 60,
      },
    ]);
  });

  it('organization UPSERT twice updates one row; a fresh insert shadows the organization id', async () => {
    await newOrg(30, ORG_A1, TENANT_A);
    await newOrg(90, ORG_A1, TENANT_A);
    expect(await settings()).toMatchObject([
      {
        tenant_id: ORG_A1,
        organization_id: ORG_A1,
        ownership_state: 'canonical_organization',
        retention_days: 90,
      },
    ]);
  });

  it('fails closed on (ORG_A1, TENANT_B) and writes nothing', async () => {
    await expect(newOrg(30, ORG_A1, TENANT_B)).rejects.toBeInstanceOf(
      AuditCanonicalWriteInvariantError,
    );
    expect(await settings()).toEqual([]);
  });

  it('keeps sibling organizations and the global row isolated', async () => {
    await newGlobal(10);
    await newOrg(20, ORG_A1, TENANT_A);
    await newOrg(30, ORG_A2, TENANT_A);
    await newOrg(40, ORG_A1, TENANT_A);
    const rows = await settings();
    expect(
      rows.map((row) => [row.organization_id, row.retention_days]),
    ).toEqual([
      [null, 10],
      [ORG_A1, 40],
      [ORG_A2, 30],
    ]);
  });

  it('organization DO UPDATE keeps a historical shadow tenant_id; retention compat still resolves it', async () => {
    await seedSetting('legacy-tenant-a1', ORG_A1, 'canonical_organization');
    await newOrg(120, ORG_A1, TENANT_A);
    // tenant-override DTO keeps exposing the row's shadow, as before R4a-B.
    await expect(newOrg(150, ORG_A1, TENANT_A)).resolves.toMatchObject({
      source: 'tenant-override',
      tenantId: 'legacy-tenant-a1',
    });
    expect(await settings()).toMatchObject([
      { tenant_id: 'legacy-tenant-a1', retention_days: 150 },
    ]);
    await expect(
      resolveLegacyAuditRetentionCompat(db, CATEGORY, 'legacy-tenant-a1'),
    ).resolves.toMatchObject({ retentionDays: 150 });
  });

  it('global DO UPDATE keeps a historical shadow tenant_id but never exposes it in the DTO', async () => {
    await seedSetting('legacy-global', null, 'intentional_global');
    // DTO: a global setting carries no tenant, as before R4a-B.
    await expect(newGlobal(200)).resolves.toMatchObject({
      source: 'global',
      tenantId: null,
      retentionDays: 200,
    });
    await expect(svc.list(globalScope)).resolves.toContainEqual(
      expect.objectContaining({
        category: CATEGORY,
        source: 'global',
        tenantId: null,
      }),
    );
    await expect(svc.list(orgScope(ORG_A1, TENANT_A))).resolves.toContainEqual(
      expect.objectContaining({
        category: CATEGORY,
        source: 'global',
        tenantId: null,
      }),
    );
    // Stored shadow: physically untouched.
    expect(await settings()).toMatchObject([
      {
        tenant_id: 'legacy-global',
        ownership_state: 'intentional_global',
        retention_days: 200,
      },
    ]);
    // Retention compat: the historical key still resolves the updated row.
    await expect(
      resolveLegacyAuditRetentionCompat(db, CATEGORY, 'legacy-global'),
    ).resolves.toMatchObject({ retentionDays: 200 });
  });

  it.each(['unresolved_legacy', 'quarantined'])(
    'never reclassifies a NULL-organization %s row through the global UPSERT',
    async (state) => {
      await seedSetting(null, null, state);
      await expect(newGlobal(45)).rejects.toBeInstanceOf(
        AuditSettingAliasConflictError,
      );
      expect(await settings()).toMatchObject([
        { ownership_state: state, retention_days: 30 },
      ]);
    },
  );

  it('maps a retained legacy UNIQUE(category, tenant_id) collision (23505) to the alias conflict', async () => {
    await seedSetting(ORG_A1, null, 'unresolved_legacy');
    await expect(newOrg(30, ORG_A1, TENANT_A)).rejects.toBeInstanceOf(
      AuditSettingAliasConflictError,
    );
    expect(await settings()).toMatchObject([
      { ownership_state: 'unresolved_legacy', organization_id: null },
    ]);
  });

  it.each(['settings', 'flags'] as const)(
    'backfill recognizes a canonical %s collision (23505) by index name',
    async (table) => {
      const error = await canonicalCollision(table);
      expect(sqlState(error)).toBe('23505');
      expect(
        table === 'settings'
          ? isSettingsCanonicalPartialUniqueViolation(error)
          : isCanonicalPartialUniqueViolation(error),
      ).toBe(true);
    },
  );
}

describe('R4a-B runtime cutover — mixed-version matrix (isolated real PostgreSQL)', () => {
  describe('baseline schema (before A)', () => {
    it('old runtime: global and organization UPSERT twice each update one row', async () => {
      await oldGlobal(30);
      await oldGlobal(60);
      await oldOrg(30, ORG_A1, TENANT_A);
      await oldOrg(90, ORG_A1, TENANT_A);
      expect(
        (await settings()).map((row) => [
          row.organization_id,
          row.retention_days,
        ]),
      ).toEqual([
        [null, 60],
        [ORG_A1, 90],
      ]);
    });

    it('a migration-only database has exactly the six retained uniques and no compact unique', async () => {
      expect(await indexNames()).toEqual(
        [
          ...PARTIALS,
          'uq_audit_log_settings_category_tenant',
          'uq_feature_flags_key_tenant',
        ].sort(),
      );
    });

    it('new runtime is refused with 42P10 and writes nothing: A must precede B', async () => {
      expect(sqlState(await rejection(newGlobal(30)))).toBe('42P10');
      expect(sqlState(await rejection(newOrg(30, ORG_A1, TENANT_A)))).toBe(
        '42P10',
      );
      expect(await settings()).toEqual([]);
    });
  });

  describe('expanded schema A (compact + all six retained uniques)', () => {
    beforeAll(async () => {
      // The non-Production bootstrap upgrading this migration-only database:
      // provisions A exactly once, then is a no-op.
      const bootstrap = () =>
        bootstrapR4aSchemaAConcurrent(
          r4aExecutorRunnerFromPostgres(executorSession),
          { expectedSystemIdentifier: database?.systemIdentifier ?? '' },
        );
      expect(await bootstrap()).toEqual([
        { table: 'feature_flags', action: 'created' },
        { table: 'audit_log_settings', action: 'created' },
      ]);
      expect(await bootstrap()).toEqual([
        { table: 'feature_flags', action: 'no-op' },
        { table: 'audit_log_settings', action: 'no-op' },
      ]);
      for (const table of ['feature_flags', 'audit_log_settings'] as const)
        expect(
          (
            await inspectR4aCompactIndex(
              r4aExecutorRunnerFromPostgres(client),
              table,
            )
          ).decision,
        ).toBe('already-converged');
      expect(await indexNames()).toEqual(
        [
          ...PARTIALS,
          'uq_audit_log_settings_category_tenant',
          'uq_feature_flags_key_tenant',
          'uq_audit_log_settings_category_organization_compact',
          'uq_feature_flags_key_organization_compact',
        ].sort(),
      );
    });

    it('old runtime still works: global and organization UPSERT twice each', async () => {
      await oldGlobal(30);
      await oldGlobal(60);
      await oldOrg(30, ORG_A1, TENANT_A);
      await oldOrg(90, ORG_A1, TENANT_A);
      expect(
        (await settings()).map((row) => [
          row.organization_id,
          row.retention_days,
        ]),
      ).toEqual([
        [null, 60],
        [ORG_A1, 90],
      ]);
    });

    it('rolling deploy and rollback: old and new writers interleave on the same rows', async () => {
      await oldGlobal(10);
      await newGlobal(20);
      await oldGlobal(30); // rollback B
      await newGlobal(40); // roll forward again
      await oldOrg(10, ORG_A1, TENANT_A);
      await newOrg(20, ORG_A1, TENANT_A);
      await oldOrg(30, ORG_A1, TENANT_A);
      await newOrg(40, ORG_A1, TENANT_A);
      expect(await settings()).toMatchObject([
        { organization_id: null, tenant_id: null, retention_days: 40 },
        { organization_id: ORG_A1, tenant_id: ORG_A1, retention_days: 40 },
      ]);
    });

    it('records the pre-B defect B removes: the old organization DO UPDATE rewrites a historical shadow', async () => {
      await seedSetting('legacy-tenant-a1', ORG_A1, 'canonical_organization');
      await oldOrg(60, ORG_A1, TENANT_A);
      expect(await settings()).toMatchObject([{ tenant_id: ORG_A1 }]);
    });

    it('a canonical collision is still reported by the semantic partial, then by compact only after C', async () => {
      const error = await canonicalCollision('settings');
      expect(constraintOf(error)).toBe(
        'uq_audit_log_settings_category_organization_canonical',
      );
    });

    newRuntimeContract();
  });

  describe('contracted schema C (forward compatibility, test-only partial DROP)', () => {
    beforeAll(async () => {
      for (const name of PARTIALS) await client.unsafe(`DROP INDEX "${name}"`);
    });

    it('old runtime is unsupported: its global UPSERT has no arbiter (42P10)', async () => {
      expect(sqlState(await rejection(oldGlobal(30)))).toBe('42P10');
      expect(await settings()).toEqual([]);
    });

    it.each(['settings', 'flags'] as const)(
      'a canonical %s collision is reported only by the compact unique',
      async (table) => {
        expect(constraintOf(await canonicalCollision(table))).toBe(
          table === 'settings'
            ? 'uq_audit_log_settings_category_organization_compact'
            : 'uq_feature_flags_key_organization_compact',
        );
      },
    );

    newRuntimeContract();
  });

  describe('rollback after C: partials re-created before old code', () => {
    beforeAll(async () => {
      for (const ddl of PARTIALS_DDL) await client.unsafe(ddl);
    });

    it('old runtime updates rows the new runtime wrote, without duplicates', async () => {
      await newGlobal(10);
      await newOrg(10, ORG_A1, TENANT_A);
      await oldGlobal(20);
      await oldOrg(20, ORG_A1, TENANT_A);
      expect(
        (await settings()).map((row) => [
          row.organization_id,
          row.retention_days,
        ]),
      ).toEqual([
        [null, 20],
        [ORG_A1, 20],
      ]);
    });
  });
});
