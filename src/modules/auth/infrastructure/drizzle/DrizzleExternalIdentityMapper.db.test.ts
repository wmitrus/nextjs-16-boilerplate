/** @vitest-environment node */
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleExternalIdentityMapper } from './DrizzleExternalIdentityMapper';

import {
  membershipsTable,
  policiesTable,
  rolesTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleExternalIdentityMapper (real DB)', () => {
  it('provisions tenant access idempotently with member role and no policy bootstrap', async () => {
    const mapper = new DrizzleExternalIdentityMapper(testDb.db);

    const internalUserId = await mapper.resolveOrCreateInternalUserId({
      provider: 'clerk',
      externalUserId: 'user_bootstrap_001',
      email: 'bootstrap-user@example.com',
    });

    const internalTenantId = await mapper.resolveOrCreateInternalTenantId({
      provider: 'clerk',
      externalTenantId: 'org_bootstrap_001',
    });

    await mapper.ensureTenantAccess({
      internalUserId,
      internalTenantId,
    });

    await mapper.ensureTenantAccess({
      internalUserId,
      internalTenantId,
    });

    const roles = await testDb.db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.tenantId, internalTenantId),
          eq(rolesTable.name, 'member'),
        ),
      );

    expect(roles).toHaveLength(1);

    const policies = await testDb.db
      .select({ id: policiesTable.id, actions: policiesTable.actions })
      .from(policiesTable)
      .where(eq(policiesTable.tenantId, internalTenantId));

    expect(policies).toHaveLength(0);

    const memberships = await testDb.db
      .select({
        userId: membershipsTable.userId,
        tenantId: membershipsTable.tenantId,
        roleId: membershipsTable.roleId,
      })
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.userId, internalUserId),
          eq(membershipsTable.tenantId, internalTenantId),
        ),
      );

    expect(memberships).toHaveLength(1);
    expect(memberships[0].roleId).toBe(roles[0].id);
  });

  it('attaches membership to existing member role without creating policies', async () => {
    const mapper = new DrizzleExternalIdentityMapper(testDb.db);

    const internalUserId = await mapper.resolveOrCreateInternalUserId({
      provider: 'clerk',
      externalUserId: 'user_bootstrap_002',
      email: 'bootstrap-user-2@example.com',
    });

    const internalTenantId = await mapper.resolveOrCreateInternalTenantId({
      provider: 'clerk',
      externalTenantId: 'org_bootstrap_002',
    });

    const existingRoleId = crypto.randomUUID();
    await testDb.db.insert(rolesTable).values({
      id: existingRoleId,
      tenantId: internalTenantId,
      name: 'member',
      isSystem: true,
    });

    await mapper.ensureTenantAccess({
      internalUserId,
      internalTenantId,
    });

    await mapper.ensureTenantAccess({
      internalUserId,
      internalTenantId,
    });

    const roles = await testDb.db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.tenantId, internalTenantId),
          eq(rolesTable.name, 'member'),
        ),
      );

    expect(roles).toHaveLength(1);

    const policies = await testDb.db
      .select({ id: policiesTable.id, actions: policiesTable.actions })
      .from(policiesTable)
      .where(eq(policiesTable.tenantId, internalTenantId));

    expect(policies).toHaveLength(0);

    const memberships = await testDb.db
      .select({
        userId: membershipsTable.userId,
        tenantId: membershipsTable.tenantId,
        roleId: membershipsTable.roleId,
      })
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.userId, internalUserId),
          eq(membershipsTable.tenantId, internalTenantId),
        ),
      );

    expect(memberships).toHaveLength(1);
    expect(memberships[0].roleId).toBe(existingRoleId);
  });

  it('does not escalate existing membership role', async () => {
    const mapper = new DrizzleExternalIdentityMapper(testDb.db);

    const internalUserId = await mapper.resolveOrCreateInternalUserId({
      provider: 'clerk',
      externalUserId: 'user_bootstrap_003',
      email: 'bootstrap-user-3@example.com',
    });

    const internalTenantId = await mapper.resolveOrCreateInternalTenantId({
      provider: 'clerk',
      externalTenantId: 'org_bootstrap_003',
    });

    const memberRoleId = crypto.randomUUID();
    await testDb.db.insert(rolesTable).values({
      id: memberRoleId,
      tenantId: internalTenantId,
      name: 'member',
      isSystem: true,
    });

    await testDb.db.insert(membershipsTable).values({
      userId: internalUserId,
      tenantId: internalTenantId,
      roleId: memberRoleId,
    });

    await mapper.ensureTenantAccess({
      internalUserId,
      internalTenantId,
    });

    const adminRoles = await testDb.db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.tenantId, internalTenantId),
          eq(rolesTable.name, 'admin'),
        ),
      );

    expect(adminRoles).toHaveLength(0);

    const memberRoles = await testDb.db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.tenantId, internalTenantId),
          eq(rolesTable.name, 'member'),
        ),
      );

    expect(memberRoles).toHaveLength(1);

    const memberships = await testDb.db
      .select({
        userId: membershipsTable.userId,
        tenantId: membershipsTable.tenantId,
        roleId: membershipsTable.roleId,
      })
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.userId, internalUserId),
          eq(membershipsTable.tenantId, internalTenantId),
        ),
      );

    expect(memberships).toHaveLength(1);
    expect(memberships[0].roleId).toBe(memberRoleId);

    const policies = await testDb.db
      .select({ id: policiesTable.id, actions: policiesTable.actions })
      .from(policiesTable)
      .where(eq(policiesTable.tenantId, internalTenantId));

    expect(policies).toHaveLength(0);
  });
});
