/** @vitest-environment node */
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  DuplicateFeatureFlagError,
  FeatureFlagCanonicalWriteInvariantError,
} from '../../domain/errors';

import {
  DrizzleFeatureFlagAdminService,
  type CanonicalFeatureFlagWriteFacts,
} from './DrizzleFeatureFlagAdminService';
import { featureFlagsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 FF·B — real-PostgreSQL proof that the canonical organization-owned
 * create binds the FULL `(organization_id, tenant_id)` tuple inside the same
 * INSERT (invariant #11): a mismatched / sibling / cross-tenant / deleted
 * tuple inserts ZERO rows and fails closed — never a NULL-owned row, never an
 * `intentional_global` reclassification. Legacy `tenant_id` is written
 * verbatim and is deliberately independent of the canonical id (§10).
 *
 * Topology:  TENANT_A ┬ ORG_A1        TENANT_B ── ORG_B1
 *                     └ ORG_A2
 */

let testDb: TestDb;
let svc: DrizzleFeatureFlagAdminService;

const TENANT_A = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const TENANT_B = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b';
const ORG_A1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const ORG_A2 = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
const ORG_B1 = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const ORG_MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TENANT_MISSING = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

// The composition seam brands these through the audited provenance
// constructors; a direct test fixture asserts the shape only.
const org = (
  organizationId: string,
  tenantId: string,
): CanonicalFeatureFlagWriteFacts =>
  ({
    kind: 'organization',
    organizationId,
    tenantId,
  }) as CanonicalFeatureFlagWriteFacts;

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleFeatureFlagAdminService(testDb.db);
  await testDb.db.execute(
    sql`INSERT INTO tenants (id, name) VALUES
        (${TENANT_A}, 'Tenant A'), (${TENANT_B}, 'Tenant B')`,
  );
  await testDb.db.execute(
    sql`INSERT INTO organizations (id, tenant_id, name) VALUES
        (${ORG_A1}, ${TENANT_A}, 'Org A1'),
        (${ORG_A2}, ${TENANT_A}, 'Org A2'),
        (${ORG_B1}, ${TENANT_B}, 'Org B1')`,
  );
});

afterEach(async () => {
  await testDb.db.delete(featureFlagsTable);
});

afterAll(async () => {
  await testDb.db.execute(
    sql`DELETE FROM organizations WHERE id IN (${ORG_A1}, ${ORG_A2}, ${ORG_B1})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM tenants WHERE id IN (${TENANT_A}, ${TENANT_B})`,
  );
  await testDb.cleanup();
});

const allRows = () =>
  testDb.db
    .select()
    .from(featureFlagsTable)
    .orderBy(asc(featureFlagsTable.key));

describe('DrizzleFeatureFlagAdminService — FF·B canonical dual-write (real DB)', () => {
  it('valid tuple: inserts exactly one canonical organization-owned row and writes legacy tenant_id verbatim', async () => {
    const flag = await svc.create(
      { key: 'k1', tenantId: 'legacy-str-a1', enabled: true },
      org(ORG_A1, TENANT_A),
    );

    // The DTO stays legacy-shaped (no canonical fields leak to the client).
    expect(flag).toMatchObject({ key: 'k1', tenantId: 'legacy-str-a1' });

    const rows = await allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'k1',
      tenantId: 'legacy-str-a1', // §10: NOT normalized to the canonical uuid
      organizationId: ORG_A1,
      ownershipState: 'canonical_organization',
    });
  });

  it('mismatched tuple (ORG_A1 + TENANT_B): inserts zero rows and fails closed', async () => {
    await expect(
      svc.create(
        { key: 'k2', tenantId: 'legacy', enabled: true },
        org(ORG_A1, TENANT_B),
      ),
    ).rejects.toBeInstanceOf(FeatureFlagCanonicalWriteInvariantError);

    const rows = await allRows();
    expect(rows).toHaveLength(0); // no row at all — not NULL-owned, not global
  });

  it('sibling isolation: a tuple for ORG_A2 with the wrong parent tenant inserts zero rows', async () => {
    await expect(
      svc.create(
        { key: 'k3', tenantId: 'legacy', enabled: true },
        org(ORG_A2, TENANT_B),
      ),
    ).rejects.toBeInstanceOf(FeatureFlagCanonicalWriteInvariantError);
    expect(await allRows()).toHaveLength(0);

    // ...and the correct sibling tuple lands on exactly ORG_A2.
    await svc.create(
      { key: 'k3', tenantId: 'legacy', enabled: true },
      org(ORG_A2, TENANT_A),
    );
    const rows = await allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.organizationId).toBe(ORG_A2);
  });

  it('cross-tenant isolation: TENANT_A parent for ORG_B1 inserts zero rows', async () => {
    await expect(
      svc.create(
        { key: 'k4', tenantId: 'legacy', enabled: true },
        org(ORG_B1, TENANT_A),
      ),
    ).rejects.toBeInstanceOf(FeatureFlagCanonicalWriteInvariantError);
    expect(await allRows()).toHaveLength(0);
  });

  it('deleted / nonexistent organization: inserts zero rows and fails closed', async () => {
    await expect(
      svc.create(
        { key: 'k5', tenantId: 'legacy', enabled: true },
        org(ORG_MISSING, TENANT_MISSING),
      ),
    ).rejects.toBeInstanceOf(FeatureFlagCanonicalWriteInvariantError);
    expect(await allRows()).toHaveLength(0);
  });

  it('update() leaves canonical ownership immutable (§15): only enabled/description change', async () => {
    const created = await svc.create(
      { key: 'imm', tenantId: 'legacy-imm', enabled: false },
      org(ORG_A1, TENANT_A),
    );

    await svc.update(created.id, { enabled: true, description: 'x' }, null);

    const rows = await allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      enabled: true,
      description: 'x',
      // unchanged by update
      tenantId: 'legacy-imm',
      organizationId: ORG_A1,
      ownershipState: 'canonical_organization',
    });
  });

  it('explicit global path: writes organization_id NULL + intentional_global without any organization tuple', async () => {
    await svc.create(
      { key: 'g1', tenantId: null, enabled: true },
      { kind: 'global' },
    );

    const rows = await allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'g1',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
    });
  });

  // Symmetric legacy/canonical semantic invariant: until FF·D `tenant_id IS
  // NULL` is the LEGACY global classification, so it must not carry a canonical
  // organization owner (the row would read as global via the legacy path while
  // being org-only canonically). See the inverse case (`{kind:'global'}` + a
  // non-null legacy key) in `DrizzleFeatureFlagAdminService.db.test.ts`.
  it('semantic mismatch: canonical organization + NULL legacy tenant_id -> invariant, zero rows', async () => {
    await expect(
      svc.create(
        { key: 'bad-org-null-legacy', tenantId: null, enabled: true },
        org(ORG_A1, TENANT_A),
      ),
    ).rejects.toBeInstanceOf(FeatureFlagCanonicalWriteInvariantError);

    expect(await allRows()).toHaveLength(0);
  });

  it('canonical scoped uniqueness: a second canonical row for the same (key, organization) is rejected; a different organization is allowed', async () => {
    await svc.create(
      { key: 'dup', tenantId: 'legacy-a', enabled: true },
      org(ORG_A1, TENANT_A),
    );

    await expect(
      svc.create(
        // distinct legacy tenant_id so the legacy unique does not mask the
        // canonical partial unique under test
        { key: 'dup', tenantId: 'legacy-b', enabled: false },
        org(ORG_A1, TENANT_A),
      ),
    ).rejects.toBeInstanceOf(DuplicateFeatureFlagError);

    await svc.create(
      { key: 'dup', tenantId: 'legacy-c', enabled: true },
      org(ORG_A2, TENANT_A),
    );

    const rows = await testDb.db
      .select()
      .from(featureFlagsTable)
      .where(eq(featureFlagsTable.key, 'dup'));
    expect(rows).toHaveLength(2);
  });

  it('CASCADE: a canonical row is removed when its organization is deleted (FF·A FK)', async () => {
    await testDb.db.execute(
      sql`INSERT INTO tenants (id, name) VALUES (${TENANT_MISSING}, 'Tenant tmp')`,
    );
    await testDb.db.execute(
      sql`INSERT INTO organizations (id, tenant_id, name) VALUES (${ORG_MISSING}, ${TENANT_MISSING}, 'Org tmp')`,
    );

    await svc.create(
      { key: 'casc', tenantId: 'legacy', enabled: true },
      org(ORG_MISSING, TENANT_MISSING),
    );
    expect(await allRows()).toHaveLength(1);

    await testDb.db.execute(
      sql`DELETE FROM organizations WHERE id = ${ORG_MISSING}`,
    );
    expect(await allRows()).toHaveLength(0);

    await testDb.db.execute(
      sql`DELETE FROM tenants WHERE id = ${TENANT_MISSING}`,
    );
  });
});
