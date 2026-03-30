# Technical Specification – Modular Monolith Architecture Correction

## 1. Technical Context

- **Language / Runtime**: TypeScript 5, Node 24, Next.js 16 App Router.
- **ORM**: Drizzle ORM (drizzle-orm ^0.45), drizzle-kit ^0.31.
- **DB Drivers**: `@electric-sql/pglite` (dev/test), `postgres` package (prod).
- **Auth**: Clerk (`@clerk/nextjs` ^6).
- **DI Container**: custom `Container` class in `src/core/container/index.ts`.
- **Testing**: Vitest, unit config (`vitest.unit.config.ts`), integration config (`vitest.integration.config.ts`).
- **Path aliases**: `@/core/*`, `@/modules/*`, `@/security/*`, `@/features/*`, `@/shared/*`.

## 2. Dependency Direction (Enforced)

```
app → features/modules/security/shared/core
features → modules/security/shared/core
modules → core/shared
security → core/shared
core → (nothing in modules/security/features/app)
```

After this change, `src/core/container/index.ts` will no longer import from `src/modules/*`. The composition root (`src/core/runtime/bootstrap.ts`) handles module wiring.

## 3. New Files

### 3.1 `src/core/db/types.ts`

```ts
export type DbDriver = 'pglite' | 'postgres';

export interface DbConfig {
  driver: DbDriver;
  url?: string;
}
```

### 3.2 `src/core/db/drivers/create-pglite.ts`

```ts
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { DrizzleDb } from '../types';

const DEFAULT_PGLITE_PATH = './data/pglite';
const PGLITE_URL_PREFIX = 'pglite://';
const FILE_URL_PREFIX = 'file:';

function resolvePglitePath(url?: string): string {
  if (!url?.trim()) return DEFAULT_PGLITE_PATH;
  const u = url.trim();
  if (u.startsWith(PGLITE_URL_PREFIX))
    return u.slice(PGLITE_URL_PREFIX.length).trim() || DEFAULT_PGLITE_PATH;
  if (u.startsWith(FILE_URL_PREFIX))
    return u.slice(FILE_URL_PREFIX.length).trim() || DEFAULT_PGLITE_PATH;
  return u;
}

export function createPglite(url?: string): DrizzleDb {
  return drizzle(new PGlite(resolvePglitePath(url))) as unknown as DrizzleDb;
}
```

### 3.3 `src/core/db/drivers/create-postgres.ts`

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { DrizzleDb } from '../types';

export function createPostgres(url: string): DrizzleDb {
  return drizzle(postgres(url)) as unknown as DrizzleDb;
}
```

### 3.4 `src/core/db/create-db.ts`

```ts
import type { DbConfig } from './types';
import type { DrizzleDb } from './types';
import { createPglite } from './drivers/create-pglite';
import { createPostgres } from './drivers/create-postgres';

export function createDb(config: DbConfig): DrizzleDb {
  if (config.driver === 'pglite') return createPglite(config.url);
  if (config.driver === 'postgres') {
    if (!config.url)
      throw new Error('DATABASE_URL required for postgres driver');
    return createPostgres(config.url);
  }
  throw new Error(`Unsupported DB driver: ${String(config.driver)}`);
}
```

> Note: `DrizzleDb` type is re-exported from `types.ts` after refactor (see section 4.2).

### 3.5 `src/core/runtime/bootstrap.ts`

```ts
import { env } from '@/core/env';
import { Container } from '@/core/container';
import { INFRASTRUCTURE } from '@/core/contracts';
import { createDb } from '@/core/db/create-db';
import type { DbConfig } from '@/core/db/types';
import { createAuthModule } from '@/modules/auth';
import type { AuthModuleConfig } from '@/modules/auth';
import { createAuthorizationModule } from '@/modules/authorization';

export interface AppConfig {
  db: DbConfig;
  auth: AuthModuleConfig;
}

export function createApp(config: AppConfig): Container {
  const container = new Container();

  const db = createDb(config.db);
  container.register(INFRASTRUCTURE.DB, db);

  container.registerModule(createAuthModule(config.auth));
  container.registerModule(createAuthorizationModule());

  return container;
}

function buildConfig(): AppConfig {
  return {
    db: {
      driver: env.NODE_ENV === 'production' ? 'postgres' : 'pglite',
      url: env.DATABASE_URL,
    },
    auth: {
      authProvider: env.AUTH_PROVIDER,
    },
  };
}

export const appContainer: Container = createApp(buildConfig());
```

### 3.6 `src/modules/user/infrastructure/drizzle/schema.ts`

```ts
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
```

### 3.7 `src/modules/billing/infrastructure/drizzle/schema.ts`

```ts
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenantsTable } from '@/modules/authorization/infrastructure/drizzle/schema';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
]);

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
```

> Note: `billing/schema.ts` imports `tenantsTable` from `authorization/schema.ts`. This is an accepted infrastructure-layer cross-module reference for FK constraints.

## 4. Modified Files

### 4.1 `src/core/contracts/index.ts`

Add `INFRASTRUCTURE` token for DB registration:

```ts
export const INFRASTRUCTURE = {
  DB: Symbol('Database'),
};
```

### 4.2 `src/core/db/types.ts`

Also export `DrizzleDb` type here (moved from `client.ts`):

```ts
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, never>>;
export type DbDriver = 'pglite' | 'postgres';
export interface DbConfig {
  driver: DbDriver;
  url?: string;
}
```

### 4.3 `src/core/db/index.ts`

```ts
export { createDb } from './create-db';
export type { DrizzleDb, DbConfig, DbDriver } from './types';
```

`db` and `getDb` are no longer exported. Any consumer that used `import { db } from '@/core/db'` must be updated.

### 4.4 `src/core/container/index.ts`

- Remove `import { authModule } from '@/modules/auth'`.
- Remove `import { authorizationModule } from '@/modules/authorization'`.
- Remove `function registerCoreModules()`.
- Remove `export const container`.
- Remove `export function bootstrap()`.
- Remove `onResolveMissing` parameter from Container constructor and all related logic.
- Keep: `Container` class, `createContainer()` (simplified – creates empty container for per-request use or tests), `Module` type, `RegistryKey`, `ServiceFactory`.

Simplified `createContainer()`:

```ts
export function createContainer(): Container {
  return new Container();
}
```

### 4.5 `src/modules/auth/index.ts`

```ts
export interface AuthModuleConfig {
  authProvider: 'clerk' | 'authjs' | 'supabase';
}

export function createAuthModule(config: AuthModuleConfig): Module {
  return {
    register(container: Container) {
      const identitySource = buildIdentitySource(config.authProvider);
      container.register(AUTH.IDENTITY_SOURCE, identitySource);
      container.register(
        AUTH.IDENTITY_PROVIDER,
        new RequestScopedIdentityProvider(identitySource),
      );
      container.register(
        AUTH.TENANT_RESOLVER,
        new RequestScopedTenantResolver(identitySource),
      );
      container.register(AUTH.USER_REPOSITORY, new ClerkUserRepository());
    },
  };
}
```

Remove `env` import. Remove `export const authModule`.

### 4.6 `src/modules/authorization/index.ts`

```ts
export function createAuthorizationModule(): Module {
  return {
    register(container: Container) {
      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);

      const policyRepository = new DrizzlePolicyRepository(db);
      const roleRepository = new DrizzleRoleRepository(db);
      const membershipRepository = new DrizzleMembershipRepository(db);
      const tenantAttributesRepository = new DrizzleTenantAttributesRepository(
        db,
      );

      const engine = new PolicyEngine();

      container.register(AUTHORIZATION.POLICY_REPOSITORY, policyRepository);
      container.register(AUTHORIZATION.ROLE_REPOSITORY, roleRepository);
      container.register(
        AUTHORIZATION.MEMBERSHIP_REPOSITORY,
        membershipRepository,
      );
      container.register(
        AUTHORIZATION.TENANT_ATTRIBUTES_REPOSITORY,
        tenantAttributesRepository,
      );
      container.register(
        AUTHORIZATION.SERVICE,
        new DefaultAuthorizationService(
          policyRepository,
          membershipRepository,
          roleRepository,
          tenantAttributesRepository,
          engine,
        ),
      );
    },
  };
}
```

Remove `env` import. Remove direct `db` import. Remove `authorizationModule` const. Remove `buildRepositories()` function.

### 4.7 `src/modules/authorization/infrastructure/drizzle/schema.ts`

Remove `usersTable` (moves to user module) and `subscriptionsTable` + `subscriptionStatusEnum` (moves to billing module). Add import of `usersTable` from user module for `membershipsTable` FK.

Retained: `contractTypeEnum`, `tenantsTable`, `rolesTable`, `membershipsTable`, `policiesTable`, `tenantAttributesTable`.

`membershipsTable.userId` still references `usersTable.id` – import from `@/modules/user/infrastructure/drizzle/schema`.

### 4.8 `src/proxy.ts`

```ts
import { appContainer } from '@/core/runtime/bootstrap';

export default clerkMiddleware(async (auth, request) => {
  const requestContainer = appContainer.createChild();

  // register request-scoped identity source in requestContainer
  requestContainer.register(AUTH.IDENTITY_SOURCE, requestIdentitySource);
  requestContainer.register(
    AUTH.IDENTITY_PROVIDER,
    new RequestScopedIdentityProvider(requestIdentitySource),
  );
  requestContainer.register(
    AUTH.TENANT_RESOLVER,
    new RequestScopedTenantResolver(requestIdentitySource),
  );

  const securityDependencies: SecurityDependencies = {
    identityProvider: requestContainer.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    ),
    tenantResolver: requestContainer.resolve<TenantResolver>(
      AUTH.TENANT_RESOLVER,
    ),
    authorizationService: requestContainer.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    ),
  };
  // ...
});
```

Remove `import { createContainer }` from container. `createContainer` is no longer needed in proxy.ts.

### 4.9 `drizzle.config.ts`

```ts
schema: './src/modules/**/infrastructure/drizzle/schema.ts',
out: './src/core/db/migrations/generated',
```

Move existing migration files from `./src/migrations/` to `./src/core/db/migrations/generated/`.

## 5. Test Updates

### 5.1 `src/core/container/integration.test.ts`

Rewrite to use `createApp()` instead of `bootstrap()` + `container`. Since no DB is available in unit tests without setup, the test should use a mock DB or verify only service resolution.

New approach:

- Create a test container via `createApp()` with a mock DB (using `MockRepositories` for authorization).
- Or: verify that services resolve without null-checking business behavior.

Simpler approach: create a `createTestApp()` helper that registers mock repositories directly.

Actually, the cleanest approach: the test creates a container manually (without `createApp`) and registers what it needs:

```ts
it('should resolve identity provider', () => {
  const container = new Container();
  container.registerModule(createAuthModule({ authProvider: 'clerk' }));
  const identityProvider = container.resolve<IdentityProvider>(
    AUTH.IDENTITY_PROVIDER,
  );
  expect(identityProvider).toBeDefined();
});

it('should resolve authorization service with mock db', () => {
  const mockDb = {} as DrizzleDb; // DrizzleRepositories only query, not construct
  const container = new Container();
  container.register(INFRASTRUCTURE.DB, mockDb);
  container.registerModule(createAuthorizationModule());
  const authzService = container.resolve<AuthorizationService>(
    AUTHORIZATION.SERVICE,
  );
  expect(authzService).toBeDefined();
});
```

### 5.2 `src/proxy.test.ts` and `src/testing/integration/proxy-runtime.integration.test.ts`

These tests mock `@/core/env` with `NODE_ENV: 'test'`. The `appContainer` from bootstrap is created at module import time with env mocked. Since proxy tests don't exercise authorization behavior (requests are unauthenticated), no DB queries are made. Tests should continue to pass without modification.

If issues arise, add `vi.mock('@/core/runtime/bootstrap', ...)` to replace `appContainer` with a test container.

## 6. Migrations

- Move `./src/migrations/` → `./src/core/db/migrations/generated/`.
- Update `drizzle.config.ts` `out` path.
- Update `scripts/db-migrate.mjs` if it references migration path.
- Since only table file ownership changes (not table structures), no new migration diff is expected.

## 7. Package.json Scripts

No changes required for existing `db:generate`, `db:migrate` etc. – drizzle.config.ts is still the single config file.

## 8. Architecture After Refactor

```
core/runtime/bootstrap.ts
  ↓ reads: core/env.ts
  ↓ calls: core/db/create-db.ts
  ↓ calls: modules/auth/index.ts (createAuthModule)
  ↓ calls: modules/authorization/index.ts (createAuthorizationModule)
  → builds: appContainer (immutable)

proxy.ts
  ↓ imports: appContainer from core/runtime/bootstrap
  → per request: appContainer.createChild()
  → registers request-scoped identity source in child

modules/authorization/index.ts
  ↓ resolves: INFRASTRUCTURE.DB from container (injected)
  → creates: DrizzleRepositories(db)

core/container/index.ts
  → NO imports from modules/*
  → exports: Container, createContainer, Module type only
```

## 9. Verification

1. `pnpm typecheck` – must pass.
2. `pnpm lint` – must pass.
3. `pnpm test` – all unit tests pass.
4. `pnpm test:integration` – all integration tests pass.
5. `pnpm skott:check:only` – no circular dependencies.
6. `pnpm madge` – no circular dependencies.
7. Verify `core/container/index.ts` has no imports from `modules/*`.
8. `pnpm db:generate` – no new migration diff (schema structure unchanged).
