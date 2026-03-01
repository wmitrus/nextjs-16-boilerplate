import type { DrizzleDb } from '@/core/db';

import {
  membershipsTable,
  policiesTable,
  rolesTable,
  tenantAttributesTable,
  tenantsTable,
} from './schema';

import type { UserSeedResult } from '@/modules/user/infrastructure/drizzle/seed';

export interface TenantRecord {
  id: string;
  name: string;
}

export interface RoleRecord {
  id: string;
  tenantId: string;
  name: string;
}

export interface AuthSeedResult {
  tenants: {
    acme: TenantRecord;
    globex: TenantRecord;
  };
  roles: {
    acmeAdmin: RoleRecord;
    acmeMember: RoleRecord;
    globexAdmin: RoleRecord;
  };
}

const TENANTS = {
  acme: {
    id: '10000000-0000-0000-0000-000000000001',
    name: 'Acme Corp',
  },
  globex: {
    id: '10000000-0000-0000-0000-000000000002',
    name: 'Globex Inc',
  },
} satisfies Record<string, TenantRecord>;

const ROLES = {
  acmeAdmin: {
    id: '20000000-0000-0000-0000-000000000001',
    tenantId: TENANTS.acme.id,
    name: 'admin',
    isSystem: true,
  },
  acmeMember: {
    id: '20000000-0000-0000-0000-000000000002',
    tenantId: TENANTS.acme.id,
    name: 'member',
    isSystem: true,
  },
  globexAdmin: {
    id: '20000000-0000-0000-0000-000000000003',
    tenantId: TENANTS.globex.id,
    name: 'admin',
    isSystem: true,
  },
};

const POLICIES = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    tenantId: TENANTS.acme.id,
    roleId: ROLES.acmeAdmin.id,
    effect: 'allow' as const,
    resource: '*',
    actions: ['*'],
    conditions: null,
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    tenantId: TENANTS.acme.id,
    roleId: ROLES.acmeMember.id,
    effect: 'allow' as const,
    resource: 'users',
    actions: ['read'],
    conditions: null,
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    tenantId: TENANTS.globex.id,
    roleId: ROLES.globexAdmin.id,
    effect: 'allow' as const,
    resource: '*',
    actions: ['*'],
    conditions: null,
  },
];

const TENANT_ATTRIBUTES = [
  {
    tenantId: TENANTS.acme.id,
    plan: 'enterprise',
    contractType: 'enterprise' as const,
    features: ['advanced-analytics', 'sso', 'audit-log'],
    maxUsers: 100,
  },
  {
    tenantId: TENANTS.globex.id,
    plan: 'pro',
    contractType: 'standard' as const,
    features: ['advanced-analytics'],
    maxUsers: 25,
  },
];

export async function seedAuthorization(
  db: DrizzleDb,
  deps: { users: UserSeedResult },
): Promise<AuthSeedResult> {
  const { alice, bob } = deps.users;

  await db
    .insert(tenantsTable)
    .values(Object.values(TENANTS))
    .onConflictDoNothing();

  await db
    .insert(rolesTable)
    .values(Object.values(ROLES))
    .onConflictDoNothing();

  await db
    .insert(membershipsTable)
    .values([
      {
        userId: alice.id,
        tenantId: TENANTS.acme.id,
        roleId: ROLES.acmeAdmin.id,
      },
      {
        userId: alice.id,
        tenantId: TENANTS.globex.id,
        roleId: ROLES.globexAdmin.id,
      },
      {
        userId: bob.id,
        tenantId: TENANTS.acme.id,
        roleId: ROLES.acmeMember.id,
      },
    ])
    .onConflictDoNothing();

  await db.insert(policiesTable).values(POLICIES).onConflictDoNothing();

  await db
    .insert(tenantAttributesTable)
    .values(TENANT_ATTRIBUTES)
    .onConflictDoNothing();

  return {
    tenants: TENANTS,
    roles: {
      acmeAdmin: ROLES.acmeAdmin,
      acmeMember: ROLES.acmeMember,
      globexAdmin: ROLES.globexAdmin,
    },
  };
}
