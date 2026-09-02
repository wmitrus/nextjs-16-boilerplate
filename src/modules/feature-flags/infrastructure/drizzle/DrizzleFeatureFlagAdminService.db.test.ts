/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  DuplicateFeatureFlagError,
  FeatureFlagCanonicalWriteInvariantError,
  FeatureFlagNotFoundError,
} from '../../domain/errors';

import {
  type CanonicalFeatureFlagWriteFacts,
  type CreateFeatureFlagInput,
  DrizzleFeatureFlagAdminService,
} from './DrizzleFeatureFlagAdminService';
import { featureFlagsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let svc: DrizzleFeatureFlagAdminService;

// A real organization for the one test that needs the canonical create path to
// hit the *legacy* `(key, tenant_id)` unique (the row carries a legacy
// `tenant_id` string independent of this org's real tenant — the legal FF·B
// migration state, §10).
const TENANT_LEG = '9e9e9e9e-9e9e-4e9e-8e9e-9e9e9e9e9e9e';
const ORG_LEG = '9d9d9d9d-9d9d-4d9d-8d9d-9d9d9d9d9d9d';
const orgLegFacts = {
  kind: 'organization',
  organizationId: ORG_LEG,
  tenantId: TENANT_LEG,
} as CanonicalFeatureFlagWriteFacts;

/**
 * Seed a *historical / compatibility-period* legacy-shaped row directly, the
 * way pre-FF·B rows and any un-migrated legacy writer look: a legacy
 * `tenant_id`, no `organization_id`, and the FF·A fail-closed
 * `ownership_state = 'unresolved_legacy'` default. These fixtures exist for the
 * legacy `tenant_id` key / scoping / uniqueness regressions below and are
 * deliberately NOT routed through the FF·B canonical create service. The
 * canonical dual-write + same-statement tuple proof has its own suite
 * (`DrizzleFeatureFlagAdminService.canonical.db.test.ts`).
 */
async function insertLegacyFlag(input: CreateFeatureFlagInput) {
  const [row] = await testDb.db
    .insert(featureFlagsTable)
    .values({
      key: input.key,
      tenantId: input.tenantId,
      enabled: input.enabled,
      description: input.description ?? null,
      // organizationId + ownershipState omitted -> NULL + 'unresolved_legacy'
    })
    .returning();
  if (!row) throw new Error('insertLegacyFlag: no row returned');
  return row;
}

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleFeatureFlagAdminService(testDb.db);
  await testDb.db.execute(
    sql`INSERT INTO tenants (id, name) VALUES (${TENANT_LEG}, 'Tenant Leg')`,
  );
  await testDb.db.execute(
    sql`INSERT INTO organizations (id, tenant_id, name) VALUES (${ORG_LEG}, ${TENANT_LEG}, 'Org Leg')`,
  );
});

afterEach(async () => {
  await testDb.db.delete(featureFlagsTable);
});

afterAll(async () => {
  await testDb.db.execute(sql`DELETE FROM organizations WHERE id = ${ORG_LEG}`);
  await testDb.db.execute(sql`DELETE FROM tenants WHERE id = ${TENANT_LEG}`);
  await testDb.cleanup();
});

describe('DrizzleFeatureFlagAdminService — legacy tenant_id regressions (real DB)', () => {
  it('lists all rows, global and tenant-scoped, ordered by key then tenantId', async () => {
    await insertLegacyFlag({ key: 'beta', tenantId: null, enabled: true });
    await insertLegacyFlag({ key: 'alpha', tenantId: null, enabled: false });
    await insertLegacyFlag({ key: 'alpha', tenantId: 'acme', enabled: true });

    const flags = await svc.listAll();

    // Postgres sorts NULL last in ascending order by default, so a
    // tenant-scoped row (real string tenantId) sorts before the global
    // (NULL tenantId) row for the same key.
    expect(flags).toHaveLength(3);
    expect(flags.map((f) => [f.key, f.tenantId])).toEqual([
      ['alpha', 'acme'],
      ['alpha', null],
      ['beta', null],
    ]);
  });

  it('two legacy rows with the same key and different tenant_id coexist', async () => {
    await insertLegacyFlag({
      key: 'shared-key',
      tenantId: null,
      enabled: true,
    });

    const scoped = await insertLegacyFlag({
      key: 'shared-key',
      tenantId: 'acme',
      enabled: false,
    });

    expect(scoped.tenantId).toBe('acme');
    expect(await svc.listAll()).toHaveLength(2);
  });

  it('the legacy (key, tenant_id) unique still fires through the canonical create path as DuplicateFeatureFlagError', async () => {
    await insertLegacyFlag({ key: 'dup', tenantId: 'acme', enabled: true });

    // A canonical org-owned create whose VERBATIM legacy tenant_id ('acme')
    // collides with the historical row above on `uq_feature_flags_key_tenant` --
    // the legacy unique stays authoritative and still maps to the typed error.
    await expect(
      svc.create({ key: 'dup', tenantId: 'acme', enabled: false }, orgLegFacts),
    ).rejects.toThrow(DuplicateFeatureFlagError);
  });

  it('throws FeatureFlagNotFoundError when updating a nonexistent id', async () => {
    await expect(
      svc.update(
        '00000000-0000-4000-8000-000000000000',
        { enabled: true },
        null,
      ),
    ).rejects.toThrow(FeatureFlagNotFoundError);
  });

  it('updates enabled and description independently (unscoped / platform admin)', async () => {
    const created = await insertLegacyFlag({
      key: 'togglable',
      tenantId: null,
      enabled: false,
      description: 'original',
    });

    const toggled = await svc.update(created.id, { enabled: true }, null);
    expect(toggled.enabled).toBe(true);
    expect(toggled.description).toBe('original');

    const described = await svc.update(
      created.id,
      { description: 'updated' },
      null,
    );
    expect(described.enabled).toBe(true);
    expect(described.description).toBe('updated');
  });

  it('deletes a flag (unscoped / platform admin)', async () => {
    const created = await insertLegacyFlag({
      key: 'deletable',
      tenantId: null,
      enabled: true,
    });

    await svc.delete(created.id, null);

    expect(await svc.listAll()).toHaveLength(0);
  });

  it('throws FeatureFlagNotFoundError when deleting a nonexistent id', async () => {
    await expect(
      svc.delete('00000000-0000-4000-8000-000000000000', null),
    ).rejects.toThrow(FeatureFlagNotFoundError);
  });

  describe('tenant scoping (SEC-26 regression coverage)', () => {
    it('listForTenant returns global rows plus only the given tenant’s own rows', async () => {
      await insertLegacyFlag({
        key: 'global-flag',
        tenantId: null,
        enabled: true,
      });
      await insertLegacyFlag({
        key: 'acme-flag',
        tenantId: 'acme',
        enabled: true,
      });
      await insertLegacyFlag({
        key: 'globex-flag',
        tenantId: 'globex',
        enabled: true,
      });

      const acmeView = await svc.listForTenant('acme');

      expect(acmeView.map((f) => [f.key, f.tenantId]).sort()).toEqual(
        [
          ['global-flag', null],
          ['acme-flag', 'acme'],
        ].sort(),
      );
      expect(acmeView.some((f) => f.tenantId === 'globex')).toBe(false);
    });

    it('rejects updating another tenant’s row when scoped to a different tenant', async () => {
      const created = await insertLegacyFlag({
        key: 'scoped-update',
        tenantId: 'acme',
        enabled: false,
      });

      await expect(
        svc.update(created.id, { enabled: true }, { tenantId: 'globex' }),
      ).rejects.toThrow(FeatureFlagNotFoundError);
    });

    it('rejects updating a global row when scoped to any tenant', async () => {
      const created = await insertLegacyFlag({
        key: 'scoped-update-global',
        tenantId: null,
        enabled: false,
      });

      await expect(
        svc.update(created.id, { enabled: true }, { tenantId: 'acme' }),
      ).rejects.toThrow(FeatureFlagNotFoundError);
    });

    it('allows updating a row scoped to the caller’s own tenant', async () => {
      const created = await insertLegacyFlag({
        key: 'scoped-update-own',
        tenantId: 'acme',
        enabled: false,
      });

      const updated = await svc.update(
        created.id,
        { enabled: true },
        { tenantId: 'acme' },
      );
      expect(updated.enabled).toBe(true);
    });

    it('rejects deleting another tenant’s row when scoped to a different tenant', async () => {
      const created = await insertLegacyFlag({
        key: 'scoped-delete',
        tenantId: 'acme',
        enabled: false,
      });

      await expect(
        svc.delete(created.id, { tenantId: 'globex' }),
      ).rejects.toThrow(FeatureFlagNotFoundError);

      // The row must still exist -- the rejected delete must not have run.
      expect(await svc.listForTenant('acme')).toHaveLength(1);
    });

    it('allows deleting a row scoped to the caller’s own tenant', async () => {
      const created = await insertLegacyFlag({
        key: 'scoped-delete-own',
        tenantId: 'acme',
        enabled: false,
      });

      await svc.delete(created.id, { tenantId: 'acme' });

      expect(await svc.listForTenant('acme')).toHaveLength(0);
    });
  });
});

describe('DrizzleFeatureFlagAdminService — FF·B explicit platform-global create (real DB)', () => {
  it('creates an intentional_global row with organization_id NULL for tenantId: null', async () => {
    const created = await svc.create(
      { key: 'g', tenantId: null, enabled: true, description: 'a test flag' },
      { kind: 'global' },
    );

    expect(created).toMatchObject({
      key: 'g',
      tenantId: null,
      enabled: true,
      description: 'a test flag',
    });

    const rows = await testDb.db.select().from(featureFlagsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
    });
  });

  it('rejects {kind:"global"} with a non-null legacy tenant_id (invariant, zero rows)', async () => {
    await expect(
      svc.create(
        { key: 'bad', tenantId: 'acme', enabled: true },
        {
          kind: 'global',
        },
      ),
    ).rejects.toBeInstanceOf(FeatureFlagCanonicalWriteInvariantError);

    expect(await testDb.db.select().from(featureFlagsTable)).toHaveLength(0);
  });

  it('the legacy (key, NULL tenant_id) unique still rejects a duplicate intentional_global', async () => {
    await svc.create(
      { key: 'dg', tenantId: null, enabled: true },
      {
        kind: 'global',
      },
    );

    await expect(
      svc.create(
        { key: 'dg', tenantId: null, enabled: false },
        {
          kind: 'global',
        },
      ),
    ).rejects.toThrow(DuplicateFeatureFlagError);
  });
});
