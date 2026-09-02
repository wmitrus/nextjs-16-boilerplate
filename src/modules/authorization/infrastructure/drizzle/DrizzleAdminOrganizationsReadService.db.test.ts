/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  internalOrganizationIdFromOrgRow,
  parentTenantIdFromOrgRow,
  tenantIdFromTenantsRow,
} from '@/core/contracts/canonical-ids.provenance';

import {
  DrizzleAdminOrganizationsReadService,
  type OrganizationsAdminDataScope,
} from './DrizzleAdminOrganizationsReadService';
import { DrizzleAdminRolesMutationService } from './DrizzleAdminRolesMutationService';
import { organizationsTable } from './schema';
import { seedAuthorization } from './seed';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let acmeOrgId: string;
let acmeSiblingOrgId: string;
let globexOrgId: string;
let acmeTenantId: string;
let globexTenantId: string;

/**
 * OZI-71 Slice 3 — the read service now consumes ONLY the canonical narrowed
 * `organization` / `tenant` `DataScope`. `platform-global` is a compile-time
 * invalid argument (see `DrizzleAdminOrganizations.scope-type.test.ts`).
 */
function organizationScope(
  organizationId: string,
  tenantId: string,
): OrganizationsAdminDataScope {
  return {
    kind: 'organization',
    organizationId: internalOrganizationIdFromOrgRow(organizationId),
    tenantId: parentTenantIdFromOrgRow(tenantId),
  };
}

function tenantScope(tenantId: string): OrganizationsAdminDataScope {
  return {
    kind: 'tenant',
    tenantId: tenantIdFromTenantsRow(tenantId),
  };
}

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  acmeOrgId = auth.orgs.acmeHq.id;
  globexOrgId = auth.orgs.globexHq.id;
  acmeTenantId = auth.tenants.acme.id;
  globexTenantId = auth.tenants.globex.id;
  acmeSiblingOrgId = '15000000-0000-4000-8000-000000000003';

  await testDb.db.insert(organizationsTable).values({
    id: acmeSiblingOrgId,
    tenantId: auth.tenants.acme.id,
    name: 'Acme Education',
    slug: 'acme-education',
  });
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleAdminOrganizationsReadService (real DB, canonical DataScope)', () => {
  it('(1) organization scope: authorized read succeeds and is contained to that organization', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);
    const scope = organizationScope(acmeOrgId, acmeTenantId);

    const list = await readService.listInActiveScope({
      scope,
      activeOrganizationId: acmeOrgId,
      limit: 20,
      offset: 0,
    });
    const detail = await readService.getDetailInActiveScope({
      scope,
      organizationId: acmeOrgId,
    });

    expect(list.organizations.map((organization) => organization.id)).toEqual([
      acmeOrgId,
    ]);
    expect(list.total).toBe(1);
    expect(list.organizations[0]?.isActive).toBe(true);
    expect(detail?.organization.id).toBe(acmeOrgId);
  });

  it('(3) organization scope: a sibling organization is denied', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);
    const scope = organizationScope(acmeOrgId, acmeTenantId);

    const list = await readService.listInActiveScope({
      scope,
      activeOrganizationId: acmeOrgId,
      limit: 20,
      offset: 0,
    });
    const sibling = await readService.getDetailInActiveScope({
      scope,
      organizationId: acmeSiblingOrgId,
    });

    expect(
      list.organizations.map((organization) => organization.id),
    ).not.toContain(acmeSiblingOrgId);
    expect(sibling).toBeNull();
  });

  it('(5/6) organization scope: correct organizationId + WRONG tenantId matches no row (defence in depth — the canonical variant carries both ids)', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);
    const forgedScope = organizationScope(acmeOrgId, globexTenantId);

    const list = await readService.listInActiveScope({
      scope: forgedScope,
      activeOrganizationId: acmeOrgId,
      limit: 20,
      offset: 0,
    });
    const detail = await readService.getDetailInActiveScope({
      scope: forgedScope,
      organizationId: acmeOrgId,
    });

    expect(list.organizations).toEqual([]);
    expect(list.total).toBe(0);
    expect(detail).toBeNull();
  });

  it('(11) organization scope: a requested resource organization id cannot override the scope', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);

    const detail = await readService.getDetailInActiveScope({
      scope: organizationScope(acmeOrgId, acmeTenantId),
      organizationId: acmeSiblingOrgId,
    });

    expect(detail).toBeNull();
  });

  it('(5) organization scope: the granted scope carries the real organizations.tenant_id', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);

    // The true parent tenant (seed) — a scope built with any other tenant id
    // (previous test) matched nothing.
    const detail = await readService.getDetailInActiveScope({
      scope: organizationScope(acmeOrgId, acmeTenantId),
      organizationId: acmeOrgId,
    });

    expect(detail?.organization.id).toBe(acmeOrgId);
    expect(acmeTenantId).toBe('10000000-0000-4000-8000-000000000001');
  });

  it('(7) tenant scope: reads siblings in the SAME tenant, never another tenant', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);
    const scope = tenantScope(acmeTenantId);

    const list = await readService.listInActiveScope({
      scope,
      activeOrganizationId: acmeOrgId,
      limit: 20,
      offset: 0,
    });
    const sibling = await readService.getDetailInActiveScope({
      scope,
      organizationId: acmeSiblingOrgId,
    });
    const outsideTenant = await readService.getDetailInActiveScope({
      scope,
      organizationId: globexOrgId,
    });

    expect(list.organizations.map((organization) => organization.id)).toEqual(
      expect.arrayContaining([acmeOrgId, acmeSiblingOrgId]),
    );
    expect(
      list.organizations.map((organization) => organization.id),
    ).not.toContain(globexOrgId);
    expect(list.total).toBe(2);
    // Presentation-only: the working-context org (acme) is flagged; siblings
    // in the same tenant scope are not — platform-admin user-facing semantic.
    const byId = new Map(list.organizations.map((o) => [o.id, o.isActive]));
    expect(byId.get(acmeOrgId)).toBe(true);
    expect(byId.get(acmeSiblingOrgId)).toBe(false);
    expect(sibling?.organization.id).toBe(acmeSiblingOrgId);
    expect(outsideTenant).toBeNull();
  });

  it('(9) tenant scope: a cross-tenant read is denied', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);

    const outside = await readService.getDetailInActiveScope({
      scope: tenantScope(acmeTenantId),
      organizationId: globexOrgId,
    });

    expect(outside).toBeNull();
  });

  it('(A) tenant scope: the authorized row set is identical regardless of the same-request activeOrganizationId', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);
    const scope = tenantScope(acmeTenantId);

    const withActiveAcme = await readService.listInActiveScope({
      scope,
      activeOrganizationId: acmeOrgId,
      limit: 20,
      offset: 0,
    });
    const withActiveSibling = await readService.listInActiveScope({
      scope,
      activeOrganizationId: acmeSiblingOrgId,
      limit: 20,
      offset: 0,
    });

    const ids = (r: { organizations: { id: string }[] }) =>
      r.organizations.map((o) => o.id).sort();

    expect(ids(withActiveAcme)).toEqual(ids(withActiveSibling));
    expect(withActiveAcme.total).toBe(withActiveSibling.total);
  });

  it('(B) tenant scope: activeOrganizationId changes ONLY which returned row is isActive', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);
    const scope = tenantScope(acmeTenantId);

    const a = await readService.listInActiveScope({
      scope,
      activeOrganizationId: acmeOrgId,
      limit: 20,
      offset: 0,
    });
    const b = await readService.listInActiveScope({
      scope,
      activeOrganizationId: acmeSiblingOrgId,
      limit: 20,
      offset: 0,
    });

    expect(a.organizations.find((o) => o.isActive)?.id).toBe(acmeOrgId);
    expect(b.organizations.find((o) => o.isActive)?.id).toBe(acmeSiblingOrgId);
    expect(a.organizations.filter((o) => o.isActive)).toHaveLength(1);
    expect(b.organizations.filter((o) => o.isActive)).toHaveLength(1);
  });

  it('(C) an activeOrganizationId outside the tenant scope never adds that organization to the result', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);

    const list = await readService.listInActiveScope({
      scope: tenantScope(acmeTenantId),
      activeOrganizationId: globexOrgId,
      limit: 20,
      offset: 0,
    });

    expect(
      list.organizations.map((organization) => organization.id),
    ).not.toContain(globexOrgId);
    expect(
      list.organizations.some((organization) => organization.isActive),
    ).toBe(false);
  });

  it('(D/E) organization scope returns only scope.organizationId even when activeOrganizationId points at a sibling', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);

    const list = await readService.listInActiveScope({
      scope: organizationScope(acmeOrgId, acmeTenantId),
      activeOrganizationId: acmeSiblingOrgId,
      limit: 20,
      offset: 0,
    });

    expect(list.organizations.map((organization) => organization.id)).toEqual([
      acmeOrgId,
    ]);
    expect(list.total).toBe(1);
    // Presentation-only id points elsewhere → the one authorized row is not
    // flagged, but the row SET is unchanged.
    expect(list.organizations[0]?.isActive).toBe(false);
  });

  it('returns custom roles on the members page with UUID ids intact', async () => {
    const rolesService = new DrizzleAdminRolesMutationService(testDb.db);
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);

    const created = await rolesService.createCustomRole({
      organizationId: acmeOrgId,
      name: 'billing_manager_probe',
    });

    const page = await readService.getMembersInActiveScope({
      scope: organizationScope(acmeOrgId, acmeTenantId),
      organizationId: acmeOrgId,
    });

    const customRole = page?.roles.find((role) => role.name === created.name);

    expect(customRole).toBeDefined();
    expect(customRole?.id).toBe(created.id);
    expect(customRole?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
