# Phase 3: DB Layer – Drizzle ORM, Drivers, Migrations

## Objective

Establish the database layer. The DB layer is **entirely framework-agnostic** and is reused from the Next.js boilerplate with zero or minimal changes.

**Prerequisite**: Phase 2 (Core Layer) complete.

---

## Why This Phase is Separate

The DB layer must be established before any module can be wired (auth, authorization, provisioning all depend on DB). Establishing it as its own phase:

1. Ensures DB schema and migrations are correct before auth schema is added
2. Allows the PGLite dev driver to be verified in Vite context
3. Provides a clear checkpoint: DB works, schema migrates, basic CRUD works

---

## What Changes

| File/Dir                             | Status               | Change                                                        |
| ------------------------------------ | -------------------- | ------------------------------------------------------------- |
| `src/core/db/schema/`                | **Reused as-is**     | Framework-agnostic Drizzle schema                             |
| `src/core/db/migrations/`            | **Reused**           | Migration files copy over; Better Auth schema added           |
| `src/core/db/drivers/`               | **Reused as-is**     | PGLite + Postgres drivers                                     |
| `src/core/db/create-db.ts`           | **Reused as-is**     | DB factory function                                           |
| `src/core/db/types.ts`               | **Reused as-is**     | `DrizzleDb`, `DbConfig` types                                 |
| `src/core/db/index.ts`               | **Reused as-is**     | Re-exports                                                    |
| `src/core/runtime/infrastructure.ts` | **Reused as-is**     | Process-scoped DB lifecycle                                   |
| `drizzle.config.ts`                  | **Minor adaptation** | Output path and schema path                                   |
| `src/core/db/schema/auth.ts`         | **New**              | Better Auth schema (users, sessions, accounts, verifications) |

---

## 1. DB Layer Files (All Reused)

### `src/core/db/types.ts`

```ts
export type DbConfig = {
  provider: 'drizzle';
  driver: 'pglite' | 'postgres';
  url?: string;
};

export type DrizzleDb = ReturnType<typeof createDb>;
```

No change. `prisma` removed as `provider` option (already removed in Phase 2 env simplification).

### `src/core/db/create-db.ts`

```ts
import { createPGliteDriver } from './drivers/pglite';
import { createPostgresDriver } from './drivers/postgres';
import type { DbConfig } from './types';

export function createDb(config: DbConfig) {
  if (config.driver === 'pglite') {
    return createPGliteDriver();
  }
  return createPostgresDriver(config.url!);
}
```

No change. Purely function-based, no framework imports.

### `src/core/db/drivers/pglite.ts`

```ts
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../schema';

export function createPGliteDriver() {
  const client = new PGlite();
  return drizzle(client, { schema });
}
```

No change. PGLite works identically in Vite/Node context.

### `src/core/runtime/infrastructure.ts`

Process-scoped DB lifecycle. No change. The singleton pattern works identically in Node.js Nitro server context.

```ts
let dbRuntime: DbRuntime | undefined;

export function getInfrastructure(config: AppConfig): { dbRuntime: DbRuntime } {
  if (!dbRuntime) {
    dbRuntime = { db: createDb(config.db) };
  }
  return { dbRuntime };
}
```

**Important**: In TanStack Start's Node server mode (long-running process), this singleton correctly reuses the DB connection pool. In Vercel serverless mode, each cold start creates a new pool – identical behavior to Next.js on Vercel.

---

## 2. DB Schema Adaptation

### Existing schema (reused)

The current schema in `src/core/db/schema/` includes tables for:

- `users` (internal user records with internal UUID)
- `tenants`
- `memberships`
- `auth_user_identities` (Clerk external ID mapping)
- `auth_tenant_identities` (Clerk external tenant mapping)

### Better Auth schema (new)

Better Auth requires specific tables managed by its Drizzle adapter. These replace or supplement the identity mapping tables.

**Better Auth core tables** (auto-managed by Better Auth):

- `ba_user` – Better Auth user record (with internal UUID)
- `ba_session` – Session records
- `ba_account` – OAuth accounts (if social login used)
- `ba_verification` – Email verification tokens

**Schema strategy**:

Option A: Better Auth manages its own tables; internal `users` table remains as the domain user table linked via Better Auth user ID.

Option B: Better Auth `ba_user` IS the domain user record; no separate `users` table.

**Recommended: Option A** – preserves the existing `User` domain contract. The `users` table is the domain record. Better Auth user ID is stored in `users.betterAuthId` as a foreign key.

```ts
// src/core/db/schema/auth.ts (new – Better Auth tables)
import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const baUser = pgTable('ba_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const baSession = pgTable('ba_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => baUser.id, { onDelete: 'cascade' }),
});

export const baAccount = pgTable('ba_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => baUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const baVerification = pgTable('ba_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});
```

**Removed**: `auth_user_identities`, `auth_tenant_identities` – these were Clerk external ID mapping tables that are not needed with Better Auth (self-hosted identity).

### Updated `users` table

```ts
// src/core/db/schema/users.ts (adapted)
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { baUser } from './auth';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  betterAuthId: text('better_auth_id')
    .unique()
    .references(() => baUser.id, { onDelete: 'set null' }),
  email: text('email').notNull().unique(),
  name: text('name'),
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

---

## 3. `drizzle.config.ts`

```ts
import { defineConfig } from 'drizzle-kit';
import { env } from './src/core/env';

export default defineConfig({
  schema: './src/core/db/schema/index.ts',
  out: './src/core/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL ?? 'file:.pglite',
  },
});
```

Minor changes:

- Schema export path updated if schema structure changes
- PGLite fallback for local dev (`file:.pglite`)

---

## 4. PGLite in Vite Context

**Important consideration**: PGLite (`@electric-sql/pglite`) uses WASM and must be handled correctly in Vite.

```ts
// vite.config.ts – add optimizeDeps exclusion
export default defineConfig({
  plugins: [...],
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
})
```

PGLite in Vite context works identically to Next.js as long as:

1. It is only instantiated on the server side (inside `createServerFn`, route loaders, or middleware)
2. The WASM file is excluded from Vite's pre-bundling

---

## 5. Migration Strategy

### Initial migration

When setting up a new project from this boilerplate:

```bash
# Generate migration from schema
pnpm db:generate

# Run migration
pnpm db:migrate
```

Better Auth migrations can be generated automatically:

```bash
# Better Auth CLI (generates SQL for its tables)
npx better-auth@latest generate --config src/modules/auth/lib/auth.ts
```

Or use the Drizzle adapter's built-in migration support which handles it automatically on first startup.

### Migration for existing Next.js projects switching to this boilerplate

If someone has an existing Next.js + Clerk project and wants to adopt the TanStack Start boilerplate:

1. Export users from Clerk (`/api/v1/users` Clerk API)
2. Create migration that:
   - Creates `ba_user`, `ba_session`, `ba_account`, `ba_verification` tables
   - Populates `ba_user` from exported Clerk users
   - Links existing `users` records via `better_auth_id`
   - Drops `auth_user_identities`, `auth_tenant_identities`

This is a data migration concern, not a boilerplate concern. The boilerplate assumes greenfield.

---

## 6. Test DB Setup

`src/testing/db/create-test-db.ts` is reused as-is:

```ts
import { createPGliteDriver } from '@/core/db/drivers/pglite';

export function createTestDb() {
  return createPGliteDriver();
}
```

PGLite creates an in-memory DB per test suite. Schema migrations run at test setup time. Identical pattern to Next.js boilerplate.

---

## Risks

| Risk                                                                               | Severity | Mitigation                                                                           |
| ---------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| PGLite WASM handling in Vite requires `optimizeDeps.exclude`                       | MAJOR    | Document in `vite.config.ts` with comment explaining why                             |
| Better Auth generates its own schema; must be kept in sync with Drizzle migrations | MAJOR    | Use Better Auth's Drizzle adapter migration support; generate schema once and commit |
| `ba_user.id` is `text` (not UUID) – linking to `users.id` (UUID) requires care     | MINOR    | `betterAuthId` stored as `text` reference; internal `users.id` remains UUID          |
| Connection pool behavior differs between Vercel (serverless) and Node (persistent) | MINOR    | Document recommended pool settings per target                                        |

---

## Validation

Phase 3 is complete when:

- [ ] `pnpm db:generate` produces valid migration files
- [ ] `pnpm db:migrate` runs without error against PGLite
- [ ] `pnpm db:migrate` runs without error against Postgres (local)
- [ ] Better Auth schema tables exist in DB after migration
- [ ] `src/testing/db/create-test-db.ts` works in Vitest context
- [ ] PGLite does not cause Vite build/dev errors
- [ ] `pnpm typecheck` passes with updated schema imports
