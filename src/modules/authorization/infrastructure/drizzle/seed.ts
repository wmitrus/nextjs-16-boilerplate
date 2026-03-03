import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import type { DrizzleDb } from '@/core/db';

import {
  membershipsTable,
  policiesTable,
  rolesTable,
  tenantAttributesTable,
  tenantsTable,
} from './schema';

import { POLICY_TEMPLATE_VERSION } from '@/modules/provisioning/policy/templates';
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
    acmeOwner: RoleRecord;
    acmeMember: RoleRecord;
    globexOwner: RoleRecord;
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
  acmeOwner: {
    id: '20000000-0000-0000-0000-000000000001',
    tenantId: TENANTS.acme.id,
    name: 'owner',
    isSystem: true,
  },
  acmeMember: {
    id: '20000000-0000-0000-0000-000000000002',
    tenantId: TENANTS.acme.id,
    name: 'member',
    isSystem: true,
  },
  globexOwner: {
    id: '20000000-0000-0000-0000-000000000003',
    tenantId: TENANTS.globex.id,
    name: 'owner',
    isSystem: true,
  },
};

const POLICIES = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    tenantId: TENANTS.acme.id,
    roleId: ROLES.acmeOwner.id,
    effect: 'allow' as const,
    resource: RESOURCES.ROUTE,
    actions: [ACTIONS.ROUTE_ACCESS],
    conditions: {},
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    tenantId: TENANTS.acme.id,
    roleId: ROLES.acmeOwner.id,
    effect: 'allow' as const,
    resource: RESOURCES.USER,
    actions: [
      ACTIONS.USER_READ,
      ACTIONS.USER_UPDATE,
      ACTIONS.USER_INVITE,
      ACTIONS.USER_DEACTIVATE,
    ],
    conditions: {},
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    tenantId: TENANTS.acme.id,
    roleId: ROLES.acmeOwner.id,
    effect: 'allow' as const,
    resource: RESOURCES.TENANT,
    actions: [
      ACTIONS.TENANT_READ,
      ACTIONS.TENANT_UPDATE,
      ACTIONS.TENANT_MANAGE_MEMBERS,
    ],
    conditions: {},
  },
  {
    id: '30000000-0000-0000-0000-000000000004',
    tenantId: TENANTS.acme.id,
    roleId: ROLES.acmeOwner.id,
    effect: 'allow' as const,
    resource: RESOURCES.BILLING,
    actions: [ACTIONS.BILLING_READ, ACTIONS.BILLING_UPDATE],
    conditions: {},
  },
  {
    id: '30000000-0000-0000-0000-000000000005',
    tenantId: TENANTS.acme.id,
    roleId: ROLES.acmeOwner.id,
    effect: 'allow' as const,
    resource: RESOURCES.SECURITY,
    actions: [ACTIONS.SECURITY_READ_AUDIT, ACTIONS.SECURITY_MANAGE_POLICIES],
    conditions: {},
  },
  {
    id: '30000000-0000-0000-0000-000000000006',
    tenantId: TENANTS.acme.id,
    roleId: ROLES.acmeMember.id,
    effect: 'allow' as const,
    resource: RESOURCES.ROUTE,
    actions: [ACTIONS.ROUTE_ACCESS],
    conditions: {},
  },
  {
    id: '30000000-0000-0000-0000-000000000007',
    tenantId: TENANTS.acme.id,
    roleId: ROLES.acmeMember.id,
    effect: 'allow' as const,
    resource: RESOURCES.USER,
    actions: [ACTIONS.USER_READ],
    conditions: { type: 'isOwner' },
  },
  {
    id: '30000000-0000-0000-0000-000000000008',
    tenantId: TENANTS.acme.id,
    roleId: ROLES.acmeMember.id,
    effect: 'allow' as const,
    resource: RESOURCES.USER,
    actions: [ACTIONS.USER_UPDATE],
    conditions: { type: 'isOwner' },
  },
  {
    id: '30000000-0000-0000-0000-000000000009',
    tenantId: TENANTS.acme.id,
    roleId: ROLES.acmeMember.id,
    effect: 'allow' as const,
    resource: RESOURCES.TENANT,
    actions: [ACTIONS.TENANT_READ],
    conditions: {},
  },
  {
    id: '30000000-0000-0000-0000-000000000010',
    tenantId: TENANTS.acme.id,
    roleId: ROLES.acmeMember.id,
    effect: 'allow' as const,
    resource: RESOURCES.BILLING,
    actions: [ACTIONS.BILLING_READ],
    conditions: {},
  },
  {
    id: '30000000-0000-0000-0000-000000000011',
    tenantId: TENANTS.globex.id,
    roleId: ROLES.globexOwner.id,
    effect: 'allow' as const,
    resource: RESOURCES.ROUTE,
    actions: [ACTIONS.ROUTE_ACCESS],
    conditions: {},
  },
  {
    id: '30000000-0000-0000-0000-000000000012',
    tenantId: TENANTS.globex.id,
    roleId: ROLES.globexOwner.id,
    effect: 'allow' as const,
    resource: RESOURCES.USER,
    actions: [
      ACTIONS.USER_READ,
      ACTIONS.USER_UPDATE,
      ACTIONS.USER_INVITE,
      ACTIONS.USER_DEACTIVATE,
    ],
    conditions: {},
  },
  {
    id: '30000000-0000-0000-0000-000000000013',
    tenantId: TENANTS.globex.id,
    roleId: ROLES.globexOwner.id,
    effect: 'allow' as const,
    resource: RESOURCES.TENANT,
    actions: [
      ACTIONS.TENANT_READ,
      ACTIONS.TENANT_UPDATE,
      ACTIONS.TENANT_MANAGE_MEMBERS,
    ],
    conditions: {},
  },
  {
    id: '30000000-0000-0000-0000-000000000014',
    tenantId: TENANTS.globex.id,
    roleId: ROLES.globexOwner.id,
    effect: 'allow' as const,
    resource: RESOURCES.BILLING,
    actions: [ACTIONS.BILLING_READ, ACTIONS.BILLING_UPDATE],
    conditions: {},
  },
  {
    id: '30000000-0000-0000-0000-000000000015',
    tenantId: TENANTS.globex.id,
    roleId: ROLES.globexOwner.id,
    effect: 'allow' as const,
    resource: RESOURCES.SECURITY,
    actions: [ACTIONS.SECURITY_READ_AUDIT, ACTIONS.SECURITY_MANAGE_POLICIES],
    conditions: {},
  },
];

const TENANT_ATTRIBUTES = [
  {
    tenantId: TENANTS.acme.id,
    plan: 'enterprise',
    contractType: 'enterprise' as const,
    features: ['advanced-analytics', 'sso', 'audit-log'],
    maxUsers: 100,
    policyTemplateVersion: POLICY_TEMPLATE_VERSION,
  },
  {
    tenantId: TENANTS.globex.id,
    plan: 'pro',
    contractType: 'standard' as const,
    features: ['advanced-analytics'],
    maxUsers: 25,
    policyTemplateVersion: POLICY_TEMPLATE_VERSION,
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
        roleId: ROLES.acmeOwner.id,
      },
      {
        userId: alice.id,
        tenantId: TENANTS.globex.id,
        roleId: ROLES.globexOwner.id,
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
      acmeOwner: ROLES.acmeOwner,
      acmeMember: ROLES.acmeMember,
      globexOwner: ROLES.globexOwner,
    },
  };
}
