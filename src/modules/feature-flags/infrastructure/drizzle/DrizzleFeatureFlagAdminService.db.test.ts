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
  type FeatureFlagAdminScope,
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

// OZI-71 FF·D topology for list/update/delete scope regressions.
// TENANT_C ┬ ORG_C1        TENANT_D ── ORG_D1
//          └ ORG_C2
const TENANT_C = '5c5c5c5c-5c5c-4c5c-8c5c-5c5c5c5c5c5c';
const TENANT_D = '6d6d6d6d-6d6d-4d6d-8d6d-6d6d6d6d6d6d';
const ORG_C1 = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const ORG_C2 = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';
const ORG_D1 = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';

// The composition seam brands these through the audited provenance
// constructors; a direct test fixture asserts the shape only (mirrors
// DrizzleFeatureFlagAdminService.canonical.db.test.ts's `org()` helper).
const scopeC1 = {
  kind: 'organization',
  organizationId: ORG_C1,
  tenantId: TENANT_C,
} as FeatureFlagAdminScope;
const scopeC2 = {
  kind: 'organization',
  organizationId: ORG_C2,
  tenantId: TENANT_C,
} as FeatureFlagAdminScope;
// A REAL organization (ORG_C1) paired with the WRONG tenant (TENANT_D) --
// the invalid-tuple negative case.
const invalidTupleScope = {
  kind: 'organization',
  organizationId: ORG_C1,
  tenantId: TENANT_D,
} as FeatureFlagAdminScope;
const platformScope: FeatureFlagAdminScope = { kind: 'platform-global' };

/**
 * Thin wrapper for tests that only care about row containment, not
 * pagination itself (which has its own dedicated real-Postgres suite —
 * `route.db.test.ts`'s pagination describe block). A generous default page
 * keeps every existing containment assertion exercising the SAME `list()`
 * implementation the paginated route uses, without threading `{ limit,
 * offset }` through call sites that aren't testing pagination.
 */
async function listFlags(scope: FeatureFlagAdminScope) {
  const { flags } = await svc.list(scope, { limit: 50, offset: 0 });
  return flags;
}

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

/** Seed a row with an explicit ownership state, for FF·D scope regressions. */
async function insertFlag(input: {
  key: string;
  tenantId: string | null;
  organizationId: string | null;
  ownershipState:
    | 'canonical_organization'
    | 'intentional_global'
    | 'unresolved_legacy'
    | 'quarantined';
  enabled: boolean;
}) {
  const [row] = await testDb.db
    .insert(featureFlagsTable)
    .values(input)
    .returning();
  if (!row) throw new Error('insertFlag: no row returned');
  return row;
}

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleFeatureFlagAdminService(testDb.db);
  await testDb.db.execute(
    sql`INSERT INTO tenants (id, name) VALUES
        (${TENANT_LEG}, 'Tenant Leg'),
        (${TENANT_C}, 'Tenant C'),
        (${TENANT_D}, 'Tenant D')`,
  );
  await testDb.db.execute(
    sql`INSERT INTO organizations (id, tenant_id, name) VALUES
        (${ORG_LEG}, ${TENANT_LEG}, 'Org Leg'),
        (${ORG_C1}, ${TENANT_C}, 'Org C1'),
        (${ORG_C2}, ${TENANT_C}, 'Org C2'),
        (${ORG_D1}, ${TENANT_D}, 'Org D1')`,
  );
});

afterEach(async () => {
  await testDb.db.delete(featureFlagsTable);
});

afterAll(async () => {
  await testDb.db.execute(
    sql`DELETE FROM organizations WHERE id IN (${ORG_LEG}, ${ORG_C1}, ${ORG_C2}, ${ORG_D1})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM tenants WHERE id IN (${TENANT_LEG}, ${TENANT_C}, ${TENANT_D})`,
  );
  await testDb.cleanup();
});

describe('DrizzleFeatureFlagAdminService — list() (real DB, OZI-71 FF·D)', () => {
  it('organization scope: returns own canonical rows plus intentional_global overlay, excludes unresolved/quarantined', async () => {
    await insertFlag({
      key: 'own-canonical',
      tenantId: 'legacy-c1',
      organizationId: ORG_C1,
      ownershipState: 'canonical_organization',
      enabled: true,
    });
    await insertFlag({
      key: 'sibling-canonical',
      tenantId: 'legacy-c2',
      organizationId: ORG_C2,
      ownershipState: 'canonical_organization',
      enabled: true,
    });
    await insertFlag({
      key: 'a-global-flag',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: true,
    });
    await insertFlag({
      key: 'still-unresolved',
      tenantId: 'legacy-unresolved',
      organizationId: null,
      ownershipState: 'unresolved_legacy',
      enabled: true,
    });
    await insertFlag({
      key: 'still-quarantined',
      tenantId: 'legacy-quarantined',
      organizationId: null,
      ownershipState: 'quarantined',
      enabled: true,
    });

    const flags = await listFlags(scopeC1);

    expect(flags.map((f) => f.key).sort()).toEqual([
      'a-global-flag',
      'own-canonical',
    ]);
    expect(flags.some((f) => f.key === 'sibling-canonical')).toBe(false);
    expect(flags.some((f) => f.key === 'still-unresolved')).toBe(false);
    expect(flags.some((f) => f.key === 'still-quarantined')).toBe(false);
  });

  it('CRITICAL: invalid tuple (real org, wrong tenant) -> zero rows, including zero intentional_global overlay', async () => {
    await insertFlag({
      key: 'own-canonical',
      tenantId: 'legacy-c1',
      organizationId: ORG_C1,
      ownershipState: 'canonical_organization',
      enabled: true,
    });
    await insertFlag({
      key: 'a-global-flag',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: true,
    });

    expect(await listFlags(invalidTupleScope)).toHaveLength(0);
  });

  it('sibling isolation: ORG_C2 sees its own row, not ORG_C1’s', async () => {
    await insertFlag({
      key: 'c1-only',
      tenantId: 'legacy-c1',
      organizationId: ORG_C1,
      ownershipState: 'canonical_organization',
      enabled: true,
    });
    await insertFlag({
      key: 'c2-only',
      tenantId: 'legacy-c2',
      organizationId: ORG_C2,
      ownershipState: 'canonical_organization',
      enabled: true,
    });

    const c2Flags = await listFlags(scopeC2);
    expect(c2Flags.map((f) => f.key)).toEqual(['c2-only']);
  });

  it('cross-tenant isolation: ORG_D1’s row is invisible to ORG_C1', async () => {
    await insertFlag({
      key: 'd1-only',
      tenantId: 'legacy-d1',
      organizationId: ORG_D1,
      ownershipState: 'canonical_organization',
      enabled: true,
    });

    expect(await listFlags(scopeC1)).toHaveLength(0);
  });

  it('platform-global scope: intentional_global only, NOT an unbounded dump', async () => {
    await insertFlag({
      key: 'global-only',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: true,
    });
    await insertFlag({
      key: 'org-owned',
      tenantId: 'legacy-c1',
      organizationId: ORG_C1,
      ownershipState: 'canonical_organization',
      enabled: true,
    });
    await insertFlag({
      key: 'still-unresolved',
      tenantId: 'legacy-unresolved',
      organizationId: null,
      ownershipState: 'unresolved_legacy',
      enabled: true,
    });

    const flags = await listFlags(platformScope);
    expect(flags.map((f) => f.key)).toEqual(['global-only']);
  });
});

describe('DrizzleFeatureFlagAdminService — list() pagination (real DB, OZI-71 FF·D review)', () => {
  const PAGE_LIMIT = 4;

  /**
   * 9 rows ORG_C1 is entitled to see (7 own canonical + 2 global overlay),
   * plus one row each of sibling-org (ORG_C2), foreign-tenant (ORG_D1),
   * unresolved_legacy, and quarantined -- none of which may EVER appear on
   * any page. 9 rows over a 4-row page crosses three pages (4 + 4 + 1),
   * giving a real partial last page in addition to two full ones.
   */
  async function seedPaginationFixture(): Promise<{
    ownKeys: string[];
    excludedKeys: string[];
  }> {
    const ownKeys: string[] = [];
    for (let i = 0; i < 7; i++) {
      const key = `own-${String(i).padStart(2, '0')}`;
      ownKeys.push(key);
      await insertFlag({
        key,
        tenantId: `legacy-own-${i}`,
        organizationId: ORG_C1,
        ownershipState: 'canonical_organization',
        enabled: true,
      });
    }
    for (let i = 0; i < 2; i++) {
      const key = `global-${String(i).padStart(2, '0')}`;
      ownKeys.push(key);
      await insertFlag({
        key,
        tenantId: null,
        organizationId: null,
        ownershipState: 'intentional_global',
        enabled: true,
      });
    }

    const excludedKeys = [
      'excluded-sibling-org',
      'excluded-foreign-tenant',
      'excluded-unresolved',
      'excluded-quarantined',
    ];
    await insertFlag({
      key: excludedKeys[0]!,
      tenantId: 'legacy-sibling',
      organizationId: ORG_C2,
      ownershipState: 'canonical_organization',
      enabled: true,
    });
    await insertFlag({
      key: excludedKeys[1]!,
      tenantId: 'legacy-foreign',
      organizationId: ORG_D1,
      ownershipState: 'canonical_organization',
      enabled: true,
    });
    await insertFlag({
      key: excludedKeys[2]!,
      tenantId: 'legacy-unresolved-pg',
      organizationId: null,
      ownershipState: 'unresolved_legacy',
      enabled: true,
    });
    await insertFlag({
      key: excludedKeys[3]!,
      tenantId: 'legacy-quarantined-pg',
      organizationId: null,
      ownershipState: 'quarantined',
      enabled: true,
    });

    return { ownKeys: ownKeys.sort(), excludedKeys };
  }

  it('paginates organization scope across 3 pages: total is stable, pages partition exactly the entitled rows, excluded rows never appear on any page', async () => {
    const { ownKeys, excludedKeys } = await seedPaginationFixture();

    const page1 = await svc.list(scopeC1, { limit: PAGE_LIMIT, offset: 0 });
    const page2 = await svc.list(scopeC1, { limit: PAGE_LIMIT, offset: 4 });
    const page3 = await svc.list(scopeC1, { limit: PAGE_LIMIT, offset: 8 });

    // total uses the EXACT SAME containment predicate as row retrieval --
    // stable across every page of the same query.
    expect(page1.total).toBe(9);
    expect(page2.total).toBe(9);
    expect(page3.total).toBe(9);

    expect(page1.flags).toHaveLength(4);
    expect(page2.flags).toHaveLength(4);
    expect(page3.flags).toHaveLength(1); // the real partial last page

    const allKeys = [...page1.flags, ...page2.flags, ...page3.flags].map(
      (f) => f.key,
    );
    // No duplicates and no gaps across the page boundary -- the union of all
    // pages is exactly the 9 entitled rows, each exactly once.
    expect(allKeys.sort()).toEqual(ownKeys);
    expect(new Set(allKeys).size).toBe(9);

    // The excluded rows (sibling org, foreign tenant, unresolved, quarantined)
    // never surface on ANY page, at ANY offset.
    for (const excluded of excludedKeys) {
      expect(allKeys).not.toContain(excluded);
    }
  });

  it('page 2 preserves the same containment guarantees as page 1: invalid tuple -> empty page, total 0, on every offset', async () => {
    await seedPaginationFixture();

    const page1 = await svc.list(invalidTupleScope, {
      limit: PAGE_LIMIT,
      offset: 0,
    });
    const page2 = await svc.list(invalidTupleScope, {
      limit: PAGE_LIMIT,
      offset: 4,
    });

    expect(page1).toEqual({ flags: [], total: 0 });
    expect(page2).toEqual({ flags: [], total: 0 });
  });

  it('page 2 preserves sibling/foreign-tenant/unresolved/quarantined exclusion, not just page 1', async () => {
    const { excludedKeys } = await seedPaginationFixture();

    const page2 = await svc.list(scopeC1, { limit: PAGE_LIMIT, offset: 4 });

    for (const excluded of excludedKeys) {
      expect(page2.flags.map((f) => f.key)).not.toContain(excluded);
    }
  });

  it('ordering is stable and deterministic: the same page requested twice returns identical rows in the same order', async () => {
    await seedPaginationFixture();

    const first = await svc.list(scopeC1, { limit: PAGE_LIMIT, offset: 0 });
    const second = await svc.list(scopeC1, { limit: PAGE_LIMIT, offset: 0 });

    expect(first.flags.map((f) => f.id)).toEqual(second.flags.map((f) => f.id));
  });

  it('platform-global scope paginates intentional_global only, excluding canonical_organization/unresolved/quarantined on every page', async () => {
    const { excludedKeys } = await seedPaginationFixture();

    const page1 = await svc.list(platformScope, {
      limit: PAGE_LIMIT,
      offset: 0,
    });

    expect(page1.total).toBe(2); // only the 2 intentional_global rows
    expect(page1.flags.map((f) => f.key).sort()).toEqual([
      'global-00',
      'global-01',
    ]);
    for (const excluded of excludedKeys) {
      expect(page1.flags.map((f) => f.key)).not.toContain(excluded);
    }
    // No `own-*` (canonical_organization) row leaks into platform-global.
    expect(page1.flags.some((f) => f.key.startsWith('own-'))).toBe(false);
  });
});

describe('DrizzleFeatureFlagAdminService — update()/delete() scope containment (real DB, OZI-71 FF·D)', () => {
  it('allows updating a row within the caller’s own organization scope', async () => {
    const created = await insertFlag({
      key: 'own-update',
      tenantId: 'legacy-c1',
      organizationId: ORG_C1,
      ownershipState: 'canonical_organization',
      enabled: false,
    });

    const updated = await svc.update(created.id, { enabled: true }, scopeC1);
    expect(updated.enabled).toBe(true);
  });

  it('sibling organization cannot mutate ORG_C1’s row', async () => {
    const created = await insertFlag({
      key: 'sibling-update',
      tenantId: 'legacy-c1',
      organizationId: ORG_C1,
      ownershipState: 'canonical_organization',
      enabled: false,
    });

    await expect(
      svc.update(created.id, { enabled: true }, scopeC2),
    ).rejects.toThrow(FeatureFlagNotFoundError);
  });

  it('cross-tenant mismatched tuple cannot mutate (fails closed, no global fallback)', async () => {
    const created = await insertFlag({
      key: 'cross-tenant-update',
      tenantId: 'legacy-c1',
      organizationId: ORG_C1,
      ownershipState: 'canonical_organization',
      enabled: false,
    });

    await expect(
      svc.update(created.id, { enabled: true }, invalidTupleScope),
    ).rejects.toThrow(FeatureFlagNotFoundError);

    // The row must still be unchanged -- the rejected update must not have run.
    const rows = await testDb.db
      .select()
      .from(featureFlagsTable)
      .where(sql`id = ${created.id}`);
    expect(rows[0]?.enabled).toBe(false);
  });

  it('foreign row id cannot mutate anything', async () => {
    await expect(
      svc.update(
        '00000000-0000-4000-8000-000000000000',
        { enabled: true },
        scopeC1,
      ),
    ).rejects.toThrow(FeatureFlagNotFoundError);
  });

  it('platform-global scope cannot mutate a canonical_organization row', async () => {
    const created = await insertFlag({
      key: 'org-owned-untouchable',
      tenantId: 'legacy-c1',
      organizationId: ORG_C1,
      ownershipState: 'canonical_organization',
      enabled: false,
    });

    await expect(
      svc.update(created.id, { enabled: true }, platformScope),
    ).rejects.toThrow(FeatureFlagNotFoundError);
  });

  it('organization scope cannot mutate an intentional_global row', async () => {
    const created = await insertFlag({
      key: 'global-untouchable-by-org',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: false,
    });

    await expect(
      svc.update(created.id, { enabled: true }, scopeC1),
    ).rejects.toThrow(FeatureFlagNotFoundError);
  });

  it('platform-global scope can mutate an intentional_global row', async () => {
    const created = await insertFlag({
      key: 'global-mutable',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: false,
    });

    const updated = await svc.update(
      created.id,
      { enabled: true },
      platformScope,
    );
    expect(updated.enabled).toBe(true);
  });

  it('deletes a row within the caller’s own organization scope', async () => {
    const created = await insertFlag({
      key: 'own-delete',
      tenantId: 'legacy-c1',
      organizationId: ORG_C1,
      ownershipState: 'canonical_organization',
      enabled: true,
    });

    await svc.delete(created.id, scopeC1);
    expect(await listFlags(scopeC1)).toHaveLength(0);
  });

  it('sibling organization cannot delete ORG_C1’s row', async () => {
    const created = await insertFlag({
      key: 'sibling-delete',
      tenantId: 'legacy-c1',
      organizationId: ORG_C1,
      ownershipState: 'canonical_organization',
      enabled: true,
    });

    await expect(svc.delete(created.id, scopeC2)).rejects.toThrow(
      FeatureFlagNotFoundError,
    );
    // Still present -- the rejected delete must not have run.
    expect(await listFlags(scopeC1)).toHaveLength(1);
  });

  it('platform-global scope cannot delete a canonical_organization row', async () => {
    const created = await insertFlag({
      key: 'org-owned-delete-guard',
      tenantId: 'legacy-c1',
      organizationId: ORG_C1,
      ownershipState: 'canonical_organization',
      enabled: true,
    });

    await expect(svc.delete(created.id, platformScope)).rejects.toThrow(
      FeatureFlagNotFoundError,
    );
    expect(await listFlags(scopeC1)).toHaveLength(1);
  });
});

describe('DrizzleFeatureFlagAdminService — legacy create()/duplicate regressions (real DB)', () => {
  it('the legacy (key, tenant_id) unique still fires through the canonical create path as DuplicateFeatureFlagError', async () => {
    await insertLegacyFlag({ key: 'dup', tenantId: 'acme', enabled: true });

    // A canonical org-owned create whose VERBATIM legacy tenant_id ('acme')
    // collides with the historical row above on `uq_feature_flags_key_tenant` --
    // the legacy unique stays authoritative and still maps to the typed error.
    await expect(
      svc.create({ key: 'dup', tenantId: 'acme', enabled: false }, orgLegFacts),
    ).rejects.toThrow(DuplicateFeatureFlagError);
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
      organizationId: null,
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
