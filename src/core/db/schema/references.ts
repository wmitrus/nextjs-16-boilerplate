import { pgTable, uuid } from 'drizzle-orm/pg-core';

export const usersReferenceTable = pgTable('users', {
  id: uuid('id').primaryKey(),
});

export const tenantsReferenceTable = pgTable('tenants', {
  id: uuid('id').primaryKey(),
});
