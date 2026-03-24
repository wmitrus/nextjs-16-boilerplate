# Phase 2: Core Layer – DI Container, Contracts, Env, Logger

## Objective

Establish the stable foundation layer (`src/core/`) that all other layers depend on. This phase changes the minimal set of core files required by the framework switch while keeping all framework-agnostic code intact.

**Prerequisite**: Phase 1 (Foundation) complete.

---

## What changes in `src/core/`

| File/Dir                              | Status           | Change                                                              |
| ------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| `src/core/container/index.ts`         | **Reused as-is** | Zero changes – framework-agnostic                                   |
| `src/core/contracts/` (all files)     | **Reused as-is** | Zero changes – pure TypeScript interfaces                           |
| `src/core/db/` (all files)            | **Reused as-is** | Covered in Phase 3                                                  |
| `src/core/error/`                     | **Reused as-is** | Zero changes                                                        |
| `src/core/env.ts`                     | **Adapted**      | `@t3-oss/env-nextjs` → `@t3-oss/env-core`, `NEXT_PUBLIC_` → `VITE_` |
| `src/core/logger/server.ts`           | **Reused as-is** | Pino server logger – no framework coupling                          |
| `src/core/logger/browser.ts`          | **Reused as-is** | No framework coupling                                               |
| `src/core/logger/client.ts`           | **Reused as-is** | No framework coupling                                               |
| `src/core/logger/client-transport.ts` | **Reused as-is** | No framework coupling                                               |
| `src/core/logger/streams.ts`          | **Reused as-is** | No framework coupling                                               |
| `src/core/logger/utils.ts`            | **Reused as-is** | No framework coupling                                               |
| `src/core/logger/browser-utils.ts`    | **Reused as-is** | No framework coupling                                               |
| `src/core/logger/edge.ts`             | **Deleted**      | No edge runtime in TanStack Start                                   |
| `src/core/logger/edge-utils.ts`       | **Deleted**      | No edge runtime                                                     |
| `src/core/logger/di-edge.ts`          | **Deleted**      | No edge composition root                                            |
| `src/core/runtime/bootstrap.ts`       | **Adapted**      | Remove edge split, simplify for Better Auth                         |
| `src/core/runtime/infrastructure.ts`  | **Reused as-is** | DB lifecycle – framework-agnostic                                   |
| `src/core/runtime/edge.ts`            | **Deleted**      | No edge composition root                                            |

---

## 1. `src/core/env.ts` – Env Config Adaptation

### What changes

- Import: `@t3-oss/env-nextjs` → `@t3-oss/env-core`
- Client var prefix: `NEXT_PUBLIC_` → `VITE_`
- Client access pattern: `process.env.NEXT_PUBLIC_VAR` → `import.meta.env.VITE_VAR`
- Removed: all Clerk env vars (`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, all Clerk redirect URLs)
- Removed: `LOGFLARE_EDGE_ENABLED` (no edge runtime)
- Added: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- Removed: `AUTH_PROVIDER` enum (`clerk | authjs | supabase`) → simplified to `better-auth` only (or removed if single-provider)
- Removed: `validateAuthProviderConfigValues` / `validateAuthProviderConfig` (Clerk-specific logic)

### New `src/core/env.ts`

```ts
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    CHROMATIC_PROJECT_TOKEN: z.string().optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    LOG_DIR: z.string().default('logs'),
    LOG_TO_FILE_DEV: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    LOG_TO_FILE_PROD: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    LOGFLARE_API_KEY: z.string().optional(),
    LOGFLARE_SOURCE_TOKEN: z.string().optional(),
    LOGFLARE_SOURCE_NAME: z.string().optional(),
    LOGFLARE_SERVER_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    API_RATE_LIMIT_REQUESTS: z.coerce.number().default(10),
    API_RATE_LIMIT_WINDOW: z.string().default('60 s'),
    LOG_INGEST_SECRET: z.string().optional(),
    SENTRY_DSN: z.url().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
    INTERNAL_API_KEY: z.string().min(1).optional(),
    SECURITY_AUDIT_LOG_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(true),
    SECURITY_ALLOWED_OUTBOUND_HOSTS: z.string().default('api.example.com'),
    E2E_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url().optional(),
    DB_PROVIDER: z.enum(['drizzle']).default('drizzle'),
    DATABASE_URL: z.string().optional(),
    DB_DRIVER: z.enum(['pglite', 'postgres']).optional(),
    TENANCY_MODE: z.enum(['single', 'personal', 'org']).default('single'),
    DEFAULT_TENANT_ID: z.uuid().optional(),
    TENANT_CONTEXT_SOURCE: z.enum(['db']).optional(),
    TENANT_CONTEXT_HEADER: z.string().default('x-tenant-id'),
    TENANT_CONTEXT_COOKIE: z.string().default('active_tenant_id'),
    FREE_TIER_MAX_USERS: z.coerce.number().int().positive().default(5),
    DEPLOY_TARGET: z.enum(['node-server', 'vercel']).default('node-server'),
  },

  clientPrefix: 'VITE_',

  client: {
    VITE_APP_URL: z.url().optional(),
    VITE_LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    VITE_LOGFLARE_BROWSER_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    VITE_SENTRY_DSN: z.url().optional(),
    VITE_CSP_SCRIPT_EXTRA: z.string().default(''),
    VITE_CSP_CONNECT_EXTRA: z.string().default(''),
    VITE_CSP_FRAME_EXTRA: z.string().default(''),
    VITE_CSP_IMG_EXTRA: z.string().default(''),
    VITE_CSP_FONT_EXTRA: z.string().default(''),
    VITE_CSP_STYLE_EXTRA: z.string().default(''),
  },

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    // ... all server vars mapped from process.env
    // ... all client vars mapped from import.meta.env
    VITE_APP_URL: import.meta.env.VITE_APP_URL,
    VITE_LOG_LEVEL: import.meta.env.VITE_LOG_LEVEL,
    VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
    VITE_LOGFLARE_BROWSER_ENABLED: import.meta.env
      .VITE_LOGFLARE_BROWSER_ENABLED,
    VITE_CSP_SCRIPT_EXTRA: import.meta.env.VITE_CSP_SCRIPT_EXTRA,
    VITE_CSP_CONNECT_EXTRA: import.meta.env.VITE_CSP_CONNECT_EXTRA,
    VITE_CSP_FRAME_EXTRA: import.meta.env.VITE_CSP_FRAME_EXTRA,
    VITE_CSP_IMG_EXTRA: import.meta.env.VITE_CSP_IMG_EXTRA,
    VITE_CSP_FONT_EXTRA: import.meta.env.VITE_CSP_FONT_EXTRA,
    VITE_CSP_STYLE_EXTRA: import.meta.env.VITE_CSP_STYLE_EXTRA,
  },

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

/**
 * Cross-field tenancy configuration validation.
 * Identical logic to Next.js version – no framework coupling.
 */
export function validateTenancyConfigValues(
  tenancyMode: string | undefined,
  defaultTenantId: string | undefined,
  tenantContextSource: string | undefined,
): void {
  if (tenancyMode === 'single' && !defaultTenantId) {
    throw new Error(
      '[env] TENANCY_MODE=single requires DEFAULT_TENANT_ID to be set.',
    );
  }

  if (tenancyMode === 'org' && !tenantContextSource) {
    throw new Error(
      '[env] TENANCY_MODE=org requires TENANT_CONTEXT_SOURCE to be set (db).',
    );
  }
}

export function validateTenancyConfig(): void {
  validateTenancyConfigValues(
    env.TENANCY_MODE,
    env.DEFAULT_TENANT_ID,
    env.TENANT_CONTEXT_SOURCE,
  );
}
```

**Key removals**:

- `LOGFLARE_EDGE_ENABLED` – no edge runtime
- All Clerk vars (`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_*`)
- `AUTH_PROVIDER` enum (or simplified to `better-auth` only)
- `validateAuthProviderConfigValues` – Clerk-specific

**Key additions**:

- `BETTER_AUTH_SECRET` – required, minimum 32 chars
- `BETTER_AUTH_URL` – optional, Better Auth base URL
- `DEPLOY_TARGET` – `node-server | vercel`
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` – Vite plugin config

**Tenant context source simplification**: `TENANT_CONTEXT_SOURCE` removes `provider` option. Better Auth is self-hosted; tenant context always comes from DB or header/cookie.

---

## 2. `src/core/runtime/bootstrap.ts` – Composition Root

### What changes

- Remove `createEdgeRequestContainer` export
- Remove edge composition root reference
- Simplify `AppConfig.auth` – no `authProvider` field (single provider: Better Auth)
- Remove `validateAuthProviderConfigValues` call
- Remove `crossProviderEmailLinking` (Clerk-specific concept)

### New `src/core/runtime/bootstrap.ts`

```ts
import { Container } from '@/core/container';
import { INFRASTRUCTURE, PROVISIONING } from '@/core/contracts';
import type { DbConfig } from '@/core/db/types';
import { env, validateTenancyConfigValues } from '@/core/env';
import { getInfrastructure } from '@/core/runtime/infrastructure';

import { createAuthModule } from '@/modules/auth';
import type { AuthModuleConfig } from '@/modules/auth';
import { createAuthorizationModule } from '@/modules/authorization';
import { DrizzleMembershipRepository } from '@/modules/authorization/infrastructure/drizzle/DrizzleMembershipRepository';
import { DrizzleProvisioningService } from '@/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService';

export interface AppConfig {
  db: DbConfig;
  auth: AuthModuleConfig;
  provisioning: {
    freeTierMaxUsers: number;
  };
}

function resolveDbDriver(): DbConfig['driver'] {
  return (
    env.DB_DRIVER ?? (env.NODE_ENV === 'production' ? 'postgres' : 'pglite')
  );
}

export function createRequestContainer(config: AppConfig): Container {
  validateTenancyConfigValues(
    config.auth.tenancyMode,
    config.auth.defaultTenantId,
    config.auth.tenantContextSource,
  );

  const container = new Container();
  const { dbRuntime } = getInfrastructure(config);

  container.register(INFRASTRUCTURE.DB, dbRuntime.db);

  const membershipRepository =
    config.auth.tenancyMode === 'org' &&
    config.auth.tenantContextSource === 'db'
      ? new DrizzleMembershipRepository(dbRuntime.db)
      : undefined;

  container.registerModule(
    createAuthModule({ ...config.auth, membershipRepository }),
  );
  container.registerModule(createAuthorizationModule({ db: dbRuntime.db }));

  container.register(
    PROVISIONING.SERVICE,
    new DrizzleProvisioningService(
      dbRuntime.db,
      config.provisioning.freeTierMaxUsers,
    ),
  );

  return container;
}

function buildConfig(): AppConfig {
  return {
    db: {
      provider: 'drizzle',
      driver: resolveDbDriver(),
      url: env.DATABASE_URL,
    },
    auth: {
      tenancyMode: env.TENANCY_MODE,
      defaultTenantId: env.DEFAULT_TENANT_ID,
      tenantContextSource: env.TENANT_CONTEXT_SOURCE,
      tenantContextHeader: env.TENANT_CONTEXT_HEADER,
      tenantContextCookie: env.TENANT_CONTEXT_COOKIE,
    },
    provisioning: {
      freeTierMaxUsers: env.FREE_TIER_MAX_USERS,
    },
  };
}

export function getAppContainer(): Container {
  return createRequestContainer(buildConfig());
}
```

**Removed**:

- `export { createEdgeRequestContainer } from './edge'` – entire edge module gone
- `validateAuthProviderConfigValues` call
- `crossProviderEmailLinking` – Clerk-specific concept that disappears with Better Auth
- `prisma` as `DB_PROVIDER` option – simplified to `drizzle` only (can be re-added if needed)

**Simplification**: `authProvider` config field removed from `AppConfig.auth`. In this boilerplate, Better Auth is the only auth provider. The `AuthModuleConfig` type is simplified accordingly.

---

## 3. `src/core/logger/` – Edge Files Removed

**Deleted files**:

- `src/core/logger/edge.ts` – Edge Pino transport
- `src/core/logger/edge-utils.ts` – Edge-specific utilities
- `src/core/logger/di-edge.ts` – DI logger for edge context

**Unchanged files** (all reused as-is):

- `server.ts` – Pino server logger with streams
- `browser.ts` – Browser Pino transport
- `client.ts` – Client entry (imports browser)
- `client-transport.ts` – Browser log transport
- `streams.ts` – Logflare stream
- `utils.ts` – Log level utilities
- `browser-utils.ts` – Browser-specific utilities

**Logger usage**:

```ts
// Server-side (any server function, middleware, route handler)
import { logger } from '@/core/logger/server';

// Client-side (React components, hooks)
import { logger } from '@/core/logger/client';
```

No change in usage API. Only the edge variant disappears.

---

## 4. `src/core/contracts/` – No Changes

All contracts are reused without modification. They define framework-agnostic interfaces:

- `authorization.ts` – `AuthorizationService`, `Action`, `ResourceContext`, `AuthorizationContext`
- `identity.ts` – `IdentityProvider`, `RequestIdentitySource`, `InternalIdentityLookup`
- `tenancy.ts` – `TenantResolver`, tenancy errors
- `user.ts` – `UserRepository`, `User`
- `repositories.ts` – `MembershipRepository`
- `logger.ts` – `Logger` interface
- `primitives.ts` – base types
- `roles.ts` – `Role`, `Permission`
- `feature-flags.ts` – `FeatureFlagProvider`
- `resources-actions.ts` – resource/action registry
- `provisioning-access.ts` – `ProvisioningService` contract
- `index.ts` – DI token registry

**Architectural note**: The fact that zero contracts change validates the modular monolith boundary discipline. All delivery-layer changes stay above the contracts layer.

---

## 5. `src/core/container/index.ts` – No Changes

The DI container is fully framework-agnostic. Zero changes required.

It continues to support:

- `register()` – value registration
- `registerFactory()` – factory with singleton option
- `resolve()` – dependency resolution with parent container fallback
- `registerModule()` – module registration
- `createChild()` – child container for request scoping

---

## Dependency Direction Check

After Phase 2:

```
core/env.ts          → @t3-oss/env-core (external, framework-agnostic)
core/container/      → (no imports from src/)
core/contracts/      → (no imports from src/)
core/logger/server   → pino, pino-logflare (external)
core/logger/browser  → pino (external)
core/runtime/bootstrap → core/container, core/contracts, core/env, core/db, modules/*
```

`core/runtime/bootstrap.ts` imports from `modules/` – this is the explicit composition root exception documented in the architecture model. All other core files must not import from modules.

---

## Risks

| Risk                                                                        | Severity      | Mitigation                                                             |
| --------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| `import.meta.env` vs `process.env` confusion                                | MAJOR         | Enforce via ESLint rule: no `process.env` in client-side files         |
| `@t3-oss/env-core` API differs from `env-nextjs` in some edge cases         | MINOR         | Verify `runtimeEnv` mapping at integration test time                   |
| `BETTER_AUTH_SECRET` requirement (min 32 chars) breaks local dev if not set | MINOR         | Default in `.env.example`, runtime validation at startup               |
| Removing `prisma` as DB_PROVIDER option                                     | INFORMATIONAL | Can be re-added; Drizzle is the only supported ORM in this boilerplate |

---

## Validation

Phase 2 is complete when:

- [ ] `pnpm typecheck` passes with all core files updated
- [ ] `src/core/env.ts` imports `@t3-oss/env-core` (not `env-nextjs`)
- [ ] No `NEXT_PUBLIC_` references remain in `src/core/`
- [ ] No `edge.ts` files remain in `src/core/logger/`
- [ ] No `edge.ts` in `src/core/runtime/`
- [ ] `createEdgeRequestContainer` is not exported from anywhere in `src/core/`
- [ ] `getAppContainer()` runs without error (unit test)
- [ ] All contracts (`src/core/contracts/`) type-check without modification
