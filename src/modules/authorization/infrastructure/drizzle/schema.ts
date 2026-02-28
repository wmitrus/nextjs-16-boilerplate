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
  uuid,
} from 'drizzle-orm/pg-core';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
]);

export const contractTypeEnum = pgEnum('contract_type', [
  'standard',
  'enterprise',
]);

export const usersTable = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').unique().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_users_email').on(t.email)],
);

export const tenantsTable = pgTable('tenants', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rolesTable = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('unique_role_name_per_tenant').on(t.tenantId, t.name),
    index('idx_roles_tenant').on(t.tenantId),
  ],
);

export const membershipsTable = pgTable(
  'memberships',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => rolesTable.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tenantId] }),
    index('idx_memberships_tenant_user').on(t.tenantId, t.userId),
    index('idx_memberships_user').on(t.userId),
  ],
);

export const policiesTable = pgTable(
  'policies',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenantsTable.id, {
      onDelete: 'cascade',
    }),
    roleId: uuid('role_id').references(() => rolesTable.id, {
      onDelete: 'cascade',
    }),
    effect: text('effect', { enum: ['allow', 'deny'] }).notNull(),
    resource: text('resource').notNull(),
    actions: jsonb('actions').$type<string[]>().notNull(),
    conditions: jsonb('conditions').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_policies_tenant').on(t.tenantId),
    index('idx_policies_role').on(t.roleId),
    index('idx_policies_resource').on(t.resource),
  ],
);

export const tenantAttributesTable = pgTable(
  'tenant_attributes',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    plan: text('plan').notNull(),
    contractType: contractTypeEnum('contract_type')
      .notNull()
      .default('standard'),
    features: jsonb('features').$type<string[]>().notNull().default([]),
    maxUsers: integer('max_users').notNull().default(5),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_tenant_attributes_plan').on(t.plan)],
);

export const subscriptionsTable = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerSubscriptionId: text('provider_subscription_id').notNull(),
    status: subscriptionStatusEnum('status').notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('unique_provider_subscription').on(
      t.provider,
      t.providerSubscriptionId,
    ),
    index('idx_subscriptions_tenant').on(t.tenantId),
    index('idx_subscriptions_status').on(t.status),
  ],
);
