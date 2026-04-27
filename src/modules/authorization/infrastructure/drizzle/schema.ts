import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  organizationsReferenceTable,
  tenantsReferenceTable,
  usersReferenceTable,
} from '@/core/db/schema/references';

export const contractTypeEnum = pgEnum('contract_type', [
  'standard',
  'enterprise',
]);

export const tenantsTable = pgTable('tenants', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const organizationsTable = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenantsReferenceTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('unique_org_slug_per_tenant').on(t.tenantId, t.slug),
    index('idx_organizations_tenant').on(t.tenantId),
  ],
);

export const rolesTable = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsReferenceTable.id, {
        onDelete: 'cascade',
      }),
    name: text('name').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('unique_role_name_per_org').on(t.organizationId, t.name),
    index('idx_roles_organization').on(t.organizationId),
  ],
);

export const membershipsTable = pgTable(
  'memberships',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => usersReferenceTable.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsReferenceTable.id, {
        onDelete: 'cascade',
      }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => rolesTable.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.organizationId] }),
    index('idx_memberships_org_user').on(t.organizationId, t.userId),
    index('idx_memberships_user').on(t.userId),
  ],
);

export const policiesTable = pgTable(
  'policies',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').references(
      () => organizationsReferenceTable.id,
      { onDelete: 'cascade' },
    ),
    roleId: uuid('role_id').references(() => rolesTable.id, {
      onDelete: 'cascade',
    }),
    effect: text('effect', { enum: ['allow', 'deny'] }).notNull(),
    resource: text('resource').notNull(),
    actions: jsonb('actions').$type<string[]>().notNull(),
    conditions: jsonb('conditions')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_policies_organization').on(t.organizationId),
    index('idx_policies_role').on(t.roleId),
    index('idx_policies_resource').on(t.resource),
    unique('unique_policy_identity_per_role').on(
      t.organizationId,
      t.roleId,
      t.effect,
      t.resource,
      t.actions,
      t.conditions,
    ),
  ],
);

export const tenantAttributesTable = pgTable(
  'tenant_attributes',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenantsReferenceTable.id, { onDelete: 'cascade' }),
    plan: text('plan').notNull(),
    contractType: contractTypeEnum('contract_type')
      .notNull()
      .default('standard'),
    features: jsonb('features').$type<string[]>().notNull().default([]),
    maxUsers: integer('max_users').notNull().default(5),
    maxOrganizations: integer('max_organizations').notNull().default(1),
    policyTemplateVersion: integer('policy_template_version')
      .notNull()
      .default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_tenant_attributes_plan').on(t.plan)],
);

export const invitationsTable = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsReferenceTable.id, {
        onDelete: 'cascade',
      }),
    invitedByUserId: uuid('invited_by_user_id').references(
      () => usersReferenceTable.id,
      { onDelete: 'set null' },
    ),
    email: text('email').notNull(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => rolesTable.id, { onDelete: 'restrict' }),
    token: text('token').notNull().unique(),
    status: text('status', {
      enum: ['pending', 'accepted', 'revoked', 'expired'],
    })
      .notNull()
      .default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_invitations_organization').on(t.organizationId),
    index('idx_invitations_email').on(t.email),
    index('idx_invitations_token').on(t.token),
    uniqueIndex('uq_invitations_org_email_pending')
      .on(t.organizationId, t.email)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export const waitlistEntriesTable = pgTable(
  'waitlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name'),
    organizationId: uuid('organization_id').references(
      () => organizationsReferenceTable.id,
      { onDelete: 'set null' },
    ),
    tenantId: uuid('tenant_id').references(() => tenantsReferenceTable.id, {
      onDelete: 'set null',
    }),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_waitlist_status').on(t.status),
    index('idx_waitlist_organization').on(t.organizationId),
  ],
);
