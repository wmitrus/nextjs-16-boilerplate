# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/0418a035-683c-4178-944f-dfb3d239ec79/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/0418a035-683c-4178-944f-dfb3d239ec79/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/0418a035-683c-4178-944f-dfb3d239ec79/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/0418a035-683c-4178-944f-dfb3d239ec79/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

---

## Implementation Tasks

> Execute in order. Each task is independently verifiable. Do not skip ahead.
> Ask user to confirm before starting the next PHASE (not individual tasks).

---

### PHASE 1 — Identity Axis Finalization

#### [x] Task 1.1 — Install Drizzle dependencies

Install `drizzle-orm`, `postgres` (production), `drizzle-kit` (dev):

```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit
```

Verify: `pnpm typecheck` still passes.

#### [x] Task 1.2 — Add AUTH_PROVIDER to env

In `src/core/env.ts` (server section), add:

```typescript
AUTH_PROVIDER: z.enum(['clerk', 'authjs', 'supabase']).default('clerk'),
```

Add to `runtimeEnv`:

```typescript
AUTH_PROVIDER: process.env.AUTH_PROVIDER,
```

Update `.env.example`:

```
AUTH_PROVIDER=clerk
```

Verify: `pnpm env:check && pnpm typecheck`

#### [x] Task 1.3 — Create SystemIdentitySource

Create `src/modules/auth/infrastructure/system/SystemIdentitySource.ts`:

- Implements `RequestIdentitySource`
- Returns `{ userId: 'system', orgId: 'system', email: undefined }`
- No external imports (no Clerk, no env)

Create co-located test `SystemIdentitySource.test.ts`:

- Assert `get()` returns `{ userId: 'system', orgId: 'system', email: undefined }`

Verify: `pnpm test && pnpm typecheck`

#### [x] Task 1.4 — Create AuthJS + Supabase placeholder adapters

Create `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts`:

- Implements `RequestIdentitySource`
- `get()` throws `Error('AuthJsRequestIdentitySource: not implemented')`

Create `src/modules/auth/infrastructure/supabase/SupabaseRequestIdentitySource.ts`:

- Same pattern as AuthJS

No tests required (placeholder — throws on call).

Verify: `pnpm typecheck`

#### [x] Task 1.5 — Relocate ClerkRequestIdentitySource

Move `src/modules/auth/infrastructure/ClerkRequestIdentitySource.ts`
→ `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`

Move co-located test file too:
`ClerkRequestIdentitySource.test.ts` → `clerk/ClerkRequestIdentitySource.test.ts`

Update all imports in:

- `src/modules/auth/index.ts`
- `src/modules/auth/infrastructure/RequestScopedIdentityProvider.ts` (if imported there)

Verify: `pnpm test && pnpm typecheck`

#### [x] Task 1.6 — Update auth/index.ts with AUTH_PROVIDER switch

Modify `src/modules/auth/index.ts`:

- Import all four identity sources (Clerk, AuthJS, Supabase, System)
- Add `buildIdentitySource(authProvider: string): RequestIdentitySource` function:
  ```
  'clerk'   → ClerkRequestIdentitySource
  'authjs'  → AuthJsRequestIdentitySource
  'supabase'→ SupabaseRequestIdentitySource
  default   → throw Error(`Unknown AUTH_PROVIDER: ${authProvider}`)
  ```
- Read `env.AUTH_PROVIDER`, pass to `buildIdentitySource`
- Wire result into `RequestScopedIdentityProvider` and `RequestScopedTenantResolver`

Verify: `pnpm test && pnpm typecheck && pnpm lint`

**⬇ PHASE 1 complete — ask user to confirm before Phase 2**

---

### PHASE 2 — DB Setup & Drizzle Schema

> **PGlite addition**: Tasks updated to support dual-driver setup:
>
> - `DATABASE_URL` set → `postgres` driver (Supabase / any real PostgreSQL)
> - `DATABASE_URL` NOT set → `@electric-sql/pglite` (local offline dev, in-process PostgreSQL)
>   Both drivers are used via Drizzle ORM. Repositories are unaware of which driver is active.

#### [x] Task 2.0 — Install PGlite

```bash
pnpm add @electric-sql/pglite
```

Add `.pglite/` to `.gitignore` (local PGlite data directory).

Verify: `pnpm typecheck`

#### [x] Task 2.1 — Add DATABASE_URL and DB_PROVIDER to env

In `src/core/env.ts` (server section), add:

```typescript
DATABASE_URL: z.string().optional(),
DB_PROVIDER: z.enum(['drizzle']).default('drizzle'),
```

Add to `runtimeEnv`:

```typescript
DATABASE_URL: process.env.DATABASE_URL,
DB_PROVIDER: process.env.DB_PROVIDER,
```

Update `.env.example`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
DB_PROVIDER=drizzle
```

Verify: `pnpm env:check && pnpm typecheck`

#### [x] Task 2.2 — Create Drizzle DB client (dual-driver)

Create `src/core/db/client.ts`:

- Exports `DrizzleDb` type alias: `PgDatabase<any, any>` from `drizzle-orm/pg-core`
- Exports `getDb(): DrizzleDb` lazy factory:
  - If `process.env.DATABASE_URL` is set → `drizzle-orm/postgres-js` + `postgres` driver
  - Otherwise → `drizzle-orm/pglite` + `@electric-sql/pglite` (local offline dev)
  - Singleton: initialized once, cached in module-level variable
- Exports `db: DrizzleDb` (calls `getDb()` immediately for server modules)

Create `src/core/db/index.ts`:

- Re-exports `db` and `DrizzleDb` from `./client`

Note: PGlite stores data in `.pglite/` directory (gitignored, persistent across dev restarts).

Verify: `pnpm typecheck`

#### [x] Task 2.3 — Create drizzle.config.ts

Create `drizzle.config.ts` at project root:

```typescript
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/authorization/infrastructure/drizzle/schema.ts',
  out: './src/migrations',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Add scripts to `package.json`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

Verify: `pnpm typecheck`

#### [x] Task 2.4 — Create Drizzle schema

Create `src/modules/authorization/infrastructure/drizzle/schema.ts` with all table definitions per spec §5.1:

- `subscriptionStatusEnum`, `contractTypeEnum` (pgEnum)
- `usersTable`, `tenantsTable`, `rolesTable`, `membershipsTable`
- `policiesTable`, `tenantAttributesTable`, `subscriptionsTable`
- All indexes and constraints as specified in PRD §6.2

Rules:

- Use `uuid('id').primaryKey()` — do NOT call `.default(sql\`gen_random_uuid()\`)` — IDs generated in application layer
- Use `timestamp({ withTimezone: true }).notNull().defaultNow()`
- Use `jsonb().$type<T>()` for JSON columns

Verify: `pnpm typecheck`

#### [x] Task 2.5 — Generate initial migration

Run:

```bash
DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder pnpm db:generate
```

This generates `src/migrations/0000_initial.sql` without requiring a live DB.

Commit the generated migration file.

Verify: Migration file exists at `src/migrations/`. `pnpm typecheck`.

**⬇ PHASE 2 complete — ask user to confirm before Phase 3**

---

### PHASE 3 — Drizzle Repository Implementations

#### [x] Task 3.1 — DrizzleMembershipRepository

Create `src/modules/authorization/infrastructure/drizzle/DrizzleMembershipRepository.ts`:

- Constructor: `constructor(private readonly db: DrizzleDb)`
- Method `isMember(subjectId, tenantId)`:
  ```
  SELECT 1 FROM memberships
  WHERE user_id = subjectId AND tenant_id = tenantId
  LIMIT 1
  ```
  Returns `true` if row exists, `false` otherwise.
- Imports ONLY from `drizzle-orm`, `./schema`, `@/core/contracts/repositories`
- Does NOT return ORM row types

Create co-located test `DrizzleMembershipRepository.test.ts`:

- Unit tests with mocked db (or integration if test DB available)
- Tests: member found → true, not found → false

Verify: `pnpm typecheck && pnpm lint`

#### [x] Task 3.2 — DrizzleRoleRepository

Create `src/modules/authorization/infrastructure/drizzle/DrizzleRoleRepository.ts`:

- Constructor: `constructor(private readonly db: DrizzleDb)`
- Method `getRoles(subjectId, tenantId)`:
  ```
  SELECT roles.name FROM memberships
  JOIN roles ON roles.id = memberships.role_id
  WHERE memberships.user_id = subjectId
    AND memberships.tenant_id = tenantId
  ```
  Returns `string[]` (role names = domain RoleId)
- No ORM types exposed

Create co-located test `DrizzleRoleRepository.test.ts`:

- No membership → empty array
- Membership with role → returns role name string

Verify: `pnpm typecheck && pnpm lint`

#### [x] Task 3.3 — DrizzleTenantAttributesRepository

Create `src/modules/authorization/infrastructure/drizzle/DrizzleTenantAttributesRepository.ts`:

- Constructor: `constructor(private readonly db: DrizzleDb)`
- Method `getTenantAttributes(tenantId)`:
  ```
  SELECT * FROM tenant_attributes WHERE tenant_id = tenantId LIMIT 1
  ```
  Maps result to `TenantAttributes`:
  ```
  plan, contractType, features, maxUsers → userLimit
  subscriptionStatus: not in DB → omit (optional field)
  ```
  On not found: return neutral defaults `{ plan: 'free', contractType: 'standard', features: [], userLimit: 5 }`

Create co-located test `DrizzleTenantAttributesRepository.test.ts`:

- Not found → default attributes
- Found → maps correctly (plan, contractType, features, userLimit)

Verify: `pnpm typecheck && pnpm lint`

#### [x] Task 3.4 — Condition deserializer helper

Create `src/modules/authorization/infrastructure/drizzle/deserializeCondition.ts`:

- Exported function: `deserializeCondition(conditions: Record<string, unknown> | null | undefined): Policy['condition']`
- Maps stored JSON condition descriptors to callable functions using existing `ConditionEvaluator` helpers
- Supported condition types (from ConditionEvaluator.ts):
  - `{ type: 'hasAttribute', key: string, value: unknown }` → `hasAttribute(ctx, key, value)`
  - `{ type: 'isOwner' }` → `isOwner(ctx)`
  - `{ type: 'isFromAllowedIp', ips: string[] }` → `isFromAllowedIp(ctx, ips)`
  - `{ type: 'isNotFromBlockedIp', ips: string[] }` → `isNotFromBlockedIp(ctx, ips)`
  - null/undefined → `undefined` (no condition function)
- Must NOT import from `drizzle-orm` or any ORM

Create co-located test `deserializeCondition.test.ts`:

- null input → undefined output
- hasAttribute → calls ConditionEvaluator helper correctly

Verify: `pnpm typecheck && pnpm lint`

#### [x] Task 3.5 — DrizzlePolicyRepository

Create `src/modules/authorization/infrastructure/drizzle/DrizzlePolicyRepository.ts`:

- Constructor: `constructor(private readonly db: DrizzleDb)`
- Method `getPolicies(context: AuthorizationContext)`:
  - Extract `tenantId` and `roles` from context
  - Query:
    ```
    SELECT * FROM policies
    WHERE (tenant_id = tenantId OR tenant_id IS NULL)
    ORDER BY created_at ASC
    ```
  - For each row: map to `Policy` domain type
    - `effect`, `resource`, `actions` map directly
    - `conditions` → use `deserializeCondition(row.conditions)`
  - Returns `Policy[]`
- No ORM types in return value

Create co-located test `DrizzlePolicyRepository.test.ts`:

- Empty DB → empty array
- Global policy (tenant_id NULL) → returned for any tenant
- Tenant-specific policy → returned for matching tenant
- Condition JSON → deserialized to callable

Verify: `pnpm typecheck && pnpm lint`

**⬇ PHASE 3 complete — ask user to confirm before Phase 4**

---

### PHASE 4 — Container Wiring & InMemory Removal

#### [x] Task 4.1 — Update authorization/index.ts with DB_PROVIDER switch

Modify `src/modules/authorization/index.ts`:

- Add imports for all 4 Drizzle repositories
- Import `db` from `@/core/db`
- Replace `buildRepositories` function:
  ```
  if (nodeEnv === 'test') → MockRepositories (unchanged)
  switch (dbProvider):
    'drizzle' → DrizzleRepositories
    default   → throw Error
  ```
- Read `env.DB_PROVIDER` and pass to `buildRepositories`
- Remove `InMemoryRepositories` imports

Verify: `pnpm typecheck`

#### [x] Task 4.2 — Remove InMemoryRepositories

Delete `src/modules/authorization/infrastructure/memory/InMemoryRepositories.ts`.

Confirm no remaining imports of `InMemoryRepositories` anywhere in codebase.

Verify: `pnpm typecheck && pnpm test`

#### [x] Task 4.3 — Update container tests

Update `src/core/container/index.test.ts` if it references env vars or InMemory repos:

- Ensure test env has `DB_PROVIDER` mock set (test env uses MockRepositories, not Drizzle)
- Ensure `AUTH_PROVIDER` mock is set if needed

Verify: `pnpm test && pnpm typecheck && pnpm lint`

**⬇ PHASE 4 complete — ask user to confirm before Phase 5**

---

### PHASE 5 — Feature Flag Module

#### [x] Task 5.1 — Create FeatureFlagService contract

Create `src/core/contracts/feature-flags.ts`:

```typescript
import type { AuthorizationContext } from './authorization';

export interface FeatureFlagService {
  isEnabled(flag: string, context: AuthorizationContext): Promise<boolean>;
}
```

Update `src/core/contracts/index.ts`:

- Add `FEATURE_FLAGS` constant:
  ```typescript
  export const FEATURE_FLAGS = {
    SERVICE: Symbol('FeatureFlagService'),
  };
  ```

Verify: `pnpm typecheck`

#### [x] Task 5.2 — Create InMemoryFeatureFlagService

Create `src/modules/feature-flags/infrastructure/memory/InMemoryFeatureFlagService.ts`:

- Implements `FeatureFlagService`
- Constructor: `constructor(private readonly flags: Record<string, boolean> = {})`
- `isEnabled(flag, _context)`: returns `this.flags[flag] ?? false`

Create co-located test `InMemoryFeatureFlagService.test.ts`:

- Default (no flags) → all return false
- Flag set to true → returns true
- Flag set to false → returns false
- Unknown flag → returns false

Verify: `pnpm test && pnpm typecheck`

#### [x] Task 5.3 — Create OpenFeature placeholder adapter

Create `src/modules/feature-flags/infrastructure/openfeature/OpenFeatureFeatureFlagService.ts`:

- Implements `FeatureFlagService`
- `isEnabled()` throws `Error('OpenFeatureFeatureFlagService: not implemented')`

No tests (throws immediately).

Verify: `pnpm typecheck`

#### [x] Task 5.4 — Create feature-flags module index

Create `src/modules/feature-flags/index.ts`:

- Exports `InMemoryFeatureFlagService` and `OpenFeatureFeatureFlagService`
- Does NOT register in container yet (future task)

Verify: `pnpm typecheck && pnpm lint`

**⬇ PHASE 5 complete — ask user to confirm before Phase 6**

---

### PHASE 6 — Billing Module

#### [ ] Task 6.1 — Create billing domain types

Create `src/modules/billing/domain/SubscriptionStatus.ts`:

```typescript
export type SubscriptionStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid';
```

Create `src/modules/billing/domain/BillingService.ts`:

```typescript
export interface BillingService {
  handleWebhookEvent(event: unknown): Promise<void>;
  syncSubscription(
    tenantId: string,
    externalSubscriptionId: string,
  ): Promise<void>;
}
```

Rules:

- No imports from `AuthorizationService`
- No imports from ORM
- No imports from `env`

Verify: `pnpm typecheck`

#### [ ] Task 6.2 — Create Stripe placeholder

Create `src/modules/billing/infrastructure/stripe/StripeBillingService.ts`:

- Implements `BillingService`
- Both methods throw `Error('StripeBillingService: not implemented')`
- No Stripe SDK import (placeholder only)

Verify: `pnpm typecheck`

#### [ ] Task 6.3 — Create billing module index

Create `src/modules/billing/index.ts`:

- Exports `BillingService` (type), `SubscriptionStatus`, `StripeBillingService`
- Does NOT register in container (no active operations in this phase)

Verify: `pnpm typecheck && pnpm lint`

**⬇ PHASE 6 complete — ask user to confirm before Phase 7**

---

### PHASE 7 — Final Cleanup & Verification

#### [ ] Task 7.1 — Update .env.example

Ensure `.env.example` contains all new variables:

```
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
DB_PROVIDER=drizzle

# Auth Provider (clerk | authjs | supabase)
AUTH_PROVIDER=clerk
```

Verify: `pnpm env:check`

#### [ ] Task 7.2 — Update depcheck config

Check `.depcheckrc` — add any new packages that might be flagged as unused:

- `drizzle-kit` (devDep, used only via CLI)
- `postgres` (used in db client)

Verify: `pnpm depcheck`

#### [ ] Task 7.3 — Full verification suite

Run all quality gates in order:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm env:check
pnpm madge
pnpm skott:check:only
```

All must pass with 0 errors. Record results in this plan.

#### [ ] Task 7.4 — Guardrails audit

Manually verify guardrails checklist from spec §15:

- [ ] No domain file imports `drizzle-orm`
- [ ] No domain file imports `@clerk/nextjs`
- [ ] No domain file imports `@/core/env`
- [ ] Repositories return only domain types (no Drizzle row types exported)
- [ ] `InMemoryRepositories.ts` is deleted
- [ ] `MockRepositories.ts` is preserved
- [ ] `BillingService` has no import from `AuthorizationService`
- [ ] `AuthorizationService` has no import from billing module
- [ ] Circular dependencies: `pnpm madge` passes clean

**⬇ PHASE 7 complete — feature implementation done**

---

## Verification Results (filled in during implementation)

| Gate                    | Result  | Notes |
| ----------------------- | ------- | ----- |
| `pnpm typecheck`        | pending |       |
| `pnpm lint`             | pending |       |
| `pnpm test`             | pending |       |
| `pnpm env:check`        | pending |       |
| `pnpm madge`            | pending |       |
| `pnpm skott:check:only` | pending |       |
