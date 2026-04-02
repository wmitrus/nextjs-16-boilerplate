# Feature Flags Implementation Plan

## Task ID

feature-flags-use-case

## Context Artifacts

- `intake.md` — task brief (same directory)
- `01 - Architecture Guard - Summary.md` — binding architecture decisions (same directory)

## Provider Order

Static (C) → DB / Drizzle (A) → GrowthBook (B)

## Design Decisions (binding — from Architecture Guard)

### Adapter switching

`FEATURE_FLAG_PROVIDER=static|db|growthbook` (default: `static`)

### Static adapter config

`FEATURE_FLAGS_STATIC=flag1=true,flag2=false,flag3=true`
Parsed as comma-separated `key=value` pairs. Unknown keys default to `false`.

### Canonical migration format (flags.json)

```json
{
  "flags": {
    "flag-key": {
      "enabled": true,
      "tenantId": null,
      "description": "optional human note"
    }
  }
}
```

### Migration scripts (package.json)

- `pnpm flags:export` — reads current static config and writes `flags.json` to stdout
- `pnpm flags:import` — reads `flags.json` from stdin or `--file` arg, upserts into DB
- `pnpm flags:migrate` — chains export from one adapter + import into another
  - `pnpm flags:migrate --from=static --to=db` (most common migration path)
  - `pnpm flags:migrate --from=db --to=static` (outputs env-var format)

### DB schema location

`src/modules/feature-flags/infrastructure/drizzle/schema.ts`
(matches Drizzle schema glob: `./src/modules/**/infrastructure/drizzle/schema.ts`)

### Server helper location

`src/modules/feature-flags/lib/isFeatureEnabled.ts`

### GrowthBook caching

GrowthBook SDK instance must be cached per process (singleton pattern via module-level cache), not instantiated per request.

### Contract shape (unchanged, not extended)

`FeatureFlagService.isEnabled(flag: string, context: AuthorizationContext): Promise<boolean>`
No `getVariant()`. No `FeatureFlagContext`. `AuthorizationContext` is the evaluation context.

---

## Steps

### [x] Step 1: Cleanup

**Subagent task**: Remove the non-functional OpenFeature stub.

Files to delete:

- `src/modules/feature-flags/infrastructure/openfeature/OpenFeatureFeatureFlagService.ts`

Files to update:

- `src/modules/feature-flags/index.ts` — remove `OpenFeatureFeatureFlagService` export

No new files. No other changes.

---

### [x] Step 2: Env Schema

**Subagent task**: Add feature-flag env vars to `src/core/env.ts` and `.env.example`.

New server-side env vars to add to `src/core/env.ts` `server` block and `runtimeEnv` block:

- `FEATURE_FLAG_PROVIDER`: `z.enum(['static', 'db', 'growthbook']).default('static')`
- `FEATURE_FLAGS_STATIC`: `z.string().optional()` — comma-separated `key=value` pairs
- `GROWTHBOOK_CLIENT_KEY`: `z.string().optional()` — required when provider is `growthbook`
- `GROWTHBOOK_API_HOST`: `z.url().optional()` — required when provider is `growthbook`, default `https://cdn.growthbook.io`

Add matching entries to `.env.example` with comments explaining each var and valid values.

---

### [x] Step 3: Static Adapter (Provider C)

**Subagent task**: Implement `StaticFeatureFlagService`.

New file: `src/modules/feature-flags/infrastructure/static/StaticFeatureFlagService.ts`

- Constructor takes `Record<string, boolean>` (pre-parsed flags map)
- `isEnabled(flag, _context)` — returns map value or `false`
- Parser utility (same file or adjacent): `parseStaticFlagsEnv(raw: string | undefined): Record<string, boolean>`
  - Parses `"flag1=true,flag2=false"` → `{ flag1: true, flag2: false }`
  - Empty/undefined input → `{}` (all flags off)
  - Malformed pairs are skipped (no throw)
- Update `src/modules/feature-flags/index.ts` to export `StaticFeatureFlagService` and `parseStaticFlagsEnv`

---

### [x] Step 4: Provider Factory + Bootstrap Wiring

**Subagent task**: Create the provider factory and wire `FEATURE_FLAGS.SERVICE` into the bootstrap.

New file: `src/modules/feature-flags/factory.ts`

Function signature:

```typescript
export function createFeatureFlagService(
  provider: 'static' | 'db' | 'growthbook',
  opts: {
    staticFlags?: string;
    db?: DrizzleDb;
    growthbookClientKey?: string;
    growthbookApiHost?: string;
  },
): FeatureFlagService;
```

- `static` → `new StaticFeatureFlagService(parseStaticFlagsEnv(opts.staticFlags))`
- `db` → `new DrizzleFeatureFlagService(db)` — throw if `db` is missing
- `growthbook` → `new GrowthBookFeatureFlagService({ clientKey, apiHost })` — throw if `clientKey` is missing
- Unknown provider → fall back to `StaticFeatureFlagService({})` and log a warning

Update `src/core/runtime/bootstrap.ts` `createRequestContainer()`:

- Import `FEATURE_FLAGS` from `@/core/contracts`
- Import `createFeatureFlagService` from `@/modules/feature-flags/factory`
- Register: `container.register(FEATURE_FLAGS.SERVICE, createFeatureFlagService(env.FEATURE_FLAG_PROVIDER, { staticFlags: env.FEATURE_FLAGS_STATIC, db: dbRuntime.db, growthbookClientKey: env.GROWTHBOOK_CLIENT_KEY, growthbookApiHost: env.GROWTHBOOK_API_HOST }))`

**Note**: Step 4 depends on Steps 2 and 3. DrizzleFeatureFlagService and GrowthBookFeatureFlagService are referenced but not yet implemented — the factory can import the class names and they will be provided in later steps. Alternatively, use lazy imports or type-only stubs to avoid circular issues during implementation. The factory throws a clear runtime error if the chosen provider's adapter is not yet implemented.

---

### [x] Step 5: DB Schema + Drizzle Adapter (Provider A)

**Subagent task**: Add `feature_flags` Drizzle table and implement `DrizzleFeatureFlagService`.

New file: `src/modules/feature-flags/infrastructure/drizzle/schema.ts`

Table `feature_flags`:

- `key`: `text('key').notNull()` — flag name
- `tenantId`: `uuid('tenant_id').nullable()` — null = global flag
- `enabled`: `boolean('enabled').notNull().default(false)`
- `description`: `text('description')` — optional human note
- `createdAt`: `timestamp(...).notNull().defaultNow()`
- `updatedAt`: `timestamp(...).notNull().defaultNow()`
- Primary key: composite `(key, tenant_id)` — a flag can have different values per tenant
- Index: `idx_feature_flags_key` on `key`

New file: `src/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagService.ts`

- Constructor takes `DrizzleDb`
- `isEnabled(flag, context)`:
  - First tries tenant-scoped lookup: `key = flag AND tenant_id = context.tenant.tenantId`
  - Falls back to global: `key = flag AND tenant_id IS NULL`
  - Returns `enabled` or `false` if not found
- Import `DrizzleDb` from `@/core/db`

Update `src/modules/feature-flags/index.ts` to export `DrizzleFeatureFlagService`.

**After implementation**: run `pnpm db:generate` to create the migration file. Commit the generated migration alongside the schema change.

---

### [x] Step 6: Server Helper

**Subagent task**: Create a convenience `isFeatureEnabled()` server-side helper.

New file: `src/modules/feature-flags/lib/isFeatureEnabled.ts`

```typescript
export async function isFeatureEnabled(
  flag: string,
  context: AuthorizationContext,
  service: FeatureFlagService,
): Promise<boolean>;
```

- Thin wrapper — calls `service.isEnabled(flag, context)`
- Takes `service` as a parameter (injected, not resolved from global) — keeps it testable and DI-correct
- No direct container access

Also export from `src/modules/feature-flags/index.ts`.

---

### [x] Step 7: Migration Scripts + Package.json

**Subagent task**: Implement flag migration scripts and add package.json entries.

Create directory: `scripts/flags/`

**`scripts/flags/types.ts`** — shared canonical format:

```typescript
export interface FlagEntry {
  enabled: boolean;
  tenantId: string | null;
  description?: string;
}
export interface FlagsFile {
  flags: Record<string, FlagEntry>;
}
```

**`scripts/flags/export.ts`** — reads flags from a source and outputs `FlagsFile` JSON to stdout:

- `--adapter=static` (default): reads `FEATURE_FLAGS_STATIC` env var, outputs JSON
- `--adapter=db`: connects to DB (uses `DATABASE_URL`), reads `feature_flags` table, outputs JSON
- `--out=path/to/flags.json` optional: writes to file instead of stdout

**`scripts/flags/import.ts`** — reads `FlagsFile` JSON and upserts into a target adapter:

- `--adapter=db` (only DB import makes sense; static is read-only env var)
- `--file=path/to/flags.json` or reads from stdin
- Uses `drizzle-orm` + `DATABASE_URL` directly (no bootstrap needed in script)
- Uses upsert (insert + `onConflictDoUpdate`)

**`scripts/flags/migrate.ts`** — chains export + import:

- `--from=static --to=db` (primary use case)
- `--from=db --to=static` (prints env-var format to stdout as `FEATURE_FLAGS_STATIC=...`)
- Internally calls export and import logic

Add to `package.json` scripts:

```json
"flags:export": "tsx scripts/flags/export.ts",
"flags:import": "tsx scripts/flags/import.ts",
"flags:migrate": "tsx scripts/flags/migrate.ts"
```

Scripts use `tsx` (already used in `db:seed`).

---

### [x] Step 8: GrowthBook Adapter (Provider B)

**Subagent task**: Install `@growthbook/growthbook` and implement `GrowthBookFeatureFlagService`.

Install:

```shell
pnpm add @growthbook/growthbook
```

New file: `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts`

Design:

- Module-level `GrowthBook` instance cache (singleton per process, keyed by clientKey)
- Constructor takes `{ clientKey: string; apiHost: string }`
- `isEnabled(flag, context)`:
  - Gets or creates cached `GrowthBook` instance
  - Calls `gb.setAttributes({ id: context.subject.id, company: context.tenant.tenantId })`
  - Returns `gb.isOn(flag)`
- If `gb.init()` has not yet been called, call it with `{ timeout: 2000 }` and cache the promise

**Important**: GrowthBook `init()` must only be called once per instance. The cache must handle concurrent requests without double-initialisation. Use a module-level `Map<string, { gb: GrowthBook; ready: Promise<void> }>`.

Update `src/modules/feature-flags/index.ts` to export `GrowthBookFeatureFlagService`.

---

### [x] Step 9: Unit Tests

**Subagent task**: Write unit tests for the new adapters and the factory.

Files to create:

- `src/modules/feature-flags/infrastructure/static/StaticFeatureFlagService.test.ts`
  - `parseStaticFlagsEnv`: empty string, undefined, valid pairs, malformed pairs
  - `isEnabled`: flag on, flag off, unknown flag, context is ignored (static)
- `src/modules/feature-flags/factory.test.ts`
  - Returns `StaticFeatureFlagService` when provider is `static`
  - Returns `DrizzleFeatureFlagService` when provider is `db` and db is provided
  - Throws when provider is `db` and db is missing
  - Returns `GrowthBookFeatureFlagService` when provider is `growthbook` and clientKey is provided
  - Throws when provider is `growthbook` and clientKey is missing

`DrizzleFeatureFlagService` integration tests are out of scope for unit suite (need DB). GrowthBook tests mock the SDK.

---

### [x] Step 10: DB Migration Generation

**Subagent task**: Generate the Drizzle migration for the `feature_flags` table.

Run:

```shell
pnpm db:generate
```

Verify:

- A new migration file appears in `src/core/db/migrations/generated/`
- The migration SQL creates `feature_flags` table with the correct columns and constraints

This step depends on Step 5 being complete.

---

### [x] Step 11: Docs Cleanup

**Subagent task**: Fix docs drift from `docs/tanstack-migration/14-feature-flags.md`.

Add a deprecation notice at the top of the file stating:

- This document describes a TanStack Start migration, not the Next.js boilerplate implementation
- The live Next.js contract is `FeatureFlagService` (not `FeatureFlagProvider`)
- `AuthorizationContext` is the evaluation context (not `FeatureFlagContext`)
- `getVariant()` is not in the contract
- Refer to `src/modules/feature-flags/` for the current implementation

Do not delete the file — it is useful historical reference.

---

### [x] Step 12: Final Validation

**Subagent task**: Run all gates and report results.

Commands to run in order:

1. `pnpm typecheck`
2. `pnpm lint --fix`
3. `pnpm test`
4. `pnpm skott:check:only`
5. `pnpm madge`
6. `pnpm depcheck`

Boundary scans:

```shell
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/shared || true
grep -RInE "from ['\"]@/(app|features|security)/" src/modules || true
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/core || true
```

Report each result. List any failures and what must be fixed before the task is done.

---

## Demo Phase — Feature Flags Showcase

### [x] Step 13: Architecture Guard — Demo Design Review

**Subagent task**: Architecture Guard reviews the proposed demo design and produces binding decisions before any implementation begins.

**Proposed design for review:**

#### Route

`/feature-flags-demo` — a new public page at `src/app/feature-flags-demo/page.tsx`.
Mirrors the security-showcase pattern.

#### RSC pattern

- `page.tsx` is an `async` React Server Component
- Resolves `FEATURE_FLAGS.SERVICE` from `getAppContainer().createChild()` (same as security-showcase uses for auth services)
- Evaluates 3 predefined demo flags server-side
- Renders feature components based on flag state

#### Guest `AuthorizationContext`

Since the demo is public (no auth required) and the static adapter ignores context:

```typescript
const guestContext: AuthorizationContext = {
  tenant: { tenantId: 'demo' },
  subject: { id: 'anonymous' },
  resource: { type: 'demo' },
  action: 'demo:view',
};
```

The page uses this synthetic guest context explicitly labeled as demo-only.

#### Demo flags (3 predefined)

- `demo.new-dashboard-ui` — when `true`, shows a "New Design" panel; when `false`, shows "Legacy Layout"
- `demo.beta-exports` — when `true`, shows "Beta Exports" feature badge; when `false`, shows "Coming Soon"
- `demo.experimental-analytics` — when `true`, shows analytics widget; when `false`, shows placeholder

Flags pre-configured in `.env.example`:

```bash
FEATURE_FLAGS_STATIC=demo.new-dashboard-ui=true,demo.beta-exports=false,demo.experimental-analytics=true
```

#### Feature components location

`src/features/feature-flags-showcase/components/`

- `FeatureFlagStatusCard.tsx` — shows flag name, current value, active provider
- `NewDashboardUiDemo.tsx` — renders different UI based on `demo.new-dashboard-ui`
- `BetaExportsDemo.tsx` — renders feature vs coming-soon based on `demo.beta-exports`
- `ExperimentalAnalyticsDemo.tsx` — renders widget vs placeholder based on `demo.experimental-analytics`

#### Homepage link

The homepage (`src/app/page.tsx` or `FeaturesGrouped.tsx`) gets a link to `/feature-flags-demo` so users can discover it.

#### What the page must NOT do

- Must not import any adapter class directly (`StaticFeatureFlagService`, `GrowthBookFeatureFlagService`, etc.)
- Must not import `parseStaticFlagsEnv` or any infrastructure code
- Must not read `env.FEATURE_FLAG_PROVIDER` directly in the component
- Must not use client components for flag evaluation

#### Architecture Guard must assess

1. Is resolving `FEATURE_FLAGS.SERVICE` via `getAppContainer().createChild()` the correct pattern for RSC?
2. Is constructing a synthetic `AuthorizationContext` for a public demo page architecturally correct?
3. Should the page expose the active provider name (from the container-resolved service) to demonstrate switching? If yes, how — without leaking infrastructure knowledge into the app layer?
4. Is `src/features/feature-flags-showcase/` the correct module location for the demo components?
5. Any other concerns or corrections to the design?

**Pause after this step**: Architecture Guard produces binding decisions before Step 14 begins.

---

### [x] Step 14: Demo Implementation

**Subagent task**: Implement the feature-flags demo page and components following the Architecture Guard's approved design from Step 13.

Files to create:

- `src/app/feature-flags-demo/page.tsx` — RSC page
- `src/features/feature-flags-showcase/components/FeatureFlagStatusCard.tsx`
- `src/features/feature-flags-showcase/components/NewDashboardUiDemo.tsx`
- `src/features/feature-flags-showcase/components/BetaExportsDemo.tsx`
- `src/features/feature-flags-showcase/components/ExperimentalAnalyticsDemo.tsx`

Files to update:

- `.env.example` — add demo flag defaults if not already present
- `src/app/page.tsx` or `FeaturesGrouped.tsx` — add link to `/feature-flags-demo`

This step must follow the Architecture Guard's decisions from Step 13 exactly.

---

### [x] Step 15: Demo Validation

**Subagent task**: Validate that the demo compiles and all quality gates pass.

Commands:

1. `pnpm typecheck`
2. `pnpm lint --fix`
3. `pnpm test`

Boundary scans:

```shell
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/shared || true
grep -RInE "from ['\"]@/(app|features|security)/" src/modules || true
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/core || true
```

Report each result. List any failures and what must be fixed.

---

## Fix Phase — Script Regression & Unit Tests

### [x] Step 16: Fix flags scripts + add unit tests

**Context**: The `flags:export`, `flags:import`, and `flags:migrate` package.json commands were changed from `tsx scripts/flags/*.ts` to `node --env-file-if-exists=.env.local node_modules/.bin/tsx scripts/flags/*.ts`. This is broken: `node_modules/.bin/tsx` is a shell script (#!/bin/sh), not a JS module — Node.js `--env-file` cannot exec shell wrappers.

**Architecture Guard binding decisions** (do not deviate):

1. **Revert package.json scripts** to plain `tsx`:

   ```json
   "flags:export": "tsx scripts/flags/export.ts",
   "flags:import": "tsx scripts/flags/import.ts",
   "flags:migrate": "tsx scripts/flags/migrate.ts"
   ```

   This matches the existing `db:seed` pattern (`tsx scripts/db-seed.ts`).

2. **Create `scripts/load-env.ts`** — a shared utility that is the **first import** in each flags script:
   - Reads `.env.local` from `process.cwd()` using `fs.readFileSync` + `path.resolve`
   - Parses `KEY=VALUE` lines (skip blank lines, skip `#` comments, handle inline comments)
   - Sets `process.env[KEY] = VALUE` **only if the key is not already set** (don't override CI/shell env)
   - Silently does nothing if `.env.local` does not exist
   - No new npm dependencies — Node.js `fs` + `path` only

3. **Update all three scripts** to import `../load-env` as their **absolute first import**:

   ```typescript
   import '../load-env';
   // all other imports after
   ```

4. **Improve DB error message** in `migrate.ts` and `import.ts`: when `feature_flags` table doesn't exist (postgres error containing "relation ... does not exist"), emit a clear error: `[flags:migrate] DB schema not ready. Run 'pnpm db:migrate:dev' first to apply the feature_flags migration.` then `process.exit(1)`.

5. **Add unit tests** for pure functions in the scripts:
   - Create `scripts/flags/load-env.test.ts` — tests the env loader utility:
     - does not override already-set vars
     - loads KEY=VALUE pairs correctly
     - ignores blank lines and `#` comments
     - is a no-op when file is absent
   - Create `scripts/flags/migrate.test.ts` — tests pure helper functions:
     - `parseArg()` — extracts arg value by name
     - `writeToStaticFormat()` — correct output format, skips tenant-scoped flags

**Validation**:

1. `pnpm typecheck`
2. `pnpm lint --fix`
3. `pnpm test`
4. Manually verify: `pnpm flags:migrate` runs without the `SyntaxError` crash

---

## Bug Fix + Test Coverage + AI Doc Phase

### [x] Step 17: Fix feature_flags.tenant_id schema type (UUID → TEXT) + unique index NULL behavior

**Root cause**: `feature_flags.tenant_id` is declared as `uuid` type in Drizzle schema. Postgres rejects any non-UUID tenant ID (e.g. `'demo'`, Clerk org IDs like `org_xxx`, string slugs) with error `22P02: invalid input syntax for type uuid`.

**Architecture Guard binding decision**: `tenant_id` MUST be `text` type. UUID must only be used for DB-generated PKs or FK references to UUID-typed PKs. Tenant scope identifiers for feature flags are application-level string keys, not database UUIDs.

**Debug/Investigation Agent amendment**: The `uniqueIndex('uq_feature_flags_key_tenant').on(t.key, t.tenantId)` uses a standard BTree index. In Postgres, `NULL != NULL` in BTree indexes — meaning multiple global flags (tenant_id IS NULL) with the same key can coexist. This must be fixed with `.nullsNotDistinct()` (Postgres 15+).

**Files to change**:

- `src/modules/feature-flags/infrastructure/drizzle/schema.ts`:
  - Change `tenantId: uuid('tenant_id')` to `tenantId: text('tenant_id')`
  - Remove `uuid` from imports if unused after change
  - Add `.nullsNotDistinct()` to `uniqueIndex('uq_feature_flags_key_tenant').on(t.key, t.tenantId)`

**Then run**:

1. `pnpm db:generate` — generates new Drizzle migration for both changes
2. Verify the generated SQL: `ALTER COLUMN tenant_id TYPE text` AND `NULLS NOT DISTINCT` in the unique index
3. `pnpm typecheck`
4. `pnpm lint --fix`
5. `pnpm test`

**Note**: Do NOT apply the migration to dev postgres — the user will run that manually. Just generate it.

---

### [x] Step 18: DB integration test for DrizzleFeatureFlagService

**Subagent task**: Add a real-DB integration test file following the existing `*.db.test.ts` pattern.

**Reference pattern**: `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.db.test.ts`

**Key pattern**:

- Filename: `src/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagService.db.test.ts`
- `/** @vitest-environment node */` at top
- Uses `resolveTestDb()` from `@/testing/db/create-test-db`
- `beforeAll`: create testDb, seed test data directly into `featureFlagsTable`
- `afterAll`: `testDb.cleanup()`
- Tests must cover:
  - Returns `false` when flag does not exist in DB
  - Returns `true` for a global flag (tenantId=null) with `enabled=true`
  - Returns `false` for a global flag with `enabled=false`
  - Tenant-scoped flag takes priority over global flag (enabled=false tenant beats enabled=true global)
  - Returns `false` for a flag scoped to a different tenant

**Important**: The `tenant_id` column is `text` (after Step 17 fix). Use string tenant IDs like `'acme'`, `'demo'`, not UUIDs.

**Validation**: Run `pnpm test` — new test file must pass.

---

### [x] Step 19: MSW mock for GrowthBook HTTP calls

**Subagent task**: Add MSW request handler for GrowthBook SDK HTTP calls.

**Context**: `GrowthBookFeatureFlagService` calls `https://cdn.growthbook.io` (or the configured API host) to fetch feature definitions. The MSW server in `src/shared/lib/mocks/server.ts` handles test-time HTTP interception.

**Reference pattern**: Look at `src/testing/integration/outbound.test.ts` for how MSW is used.

**Tasks**:

1. Inspect `GrowthBookFeatureFlagService.ts` to understand what HTTP request it makes (the GrowthBook SDK calls `{apiHost}/api/features/{clientKey}`)
2. Add a named MSW handler (e.g. `growthbookHandlers`) to a new file: `src/modules/feature-flags/infrastructure/growthbook/__mocks__/handlers.ts`
3. Handler pattern: intercept `GET https://cdn.growthbook.io/api/features/:clientKey` and return a valid GrowthBook features response body
4. Register the handlers in the existing MSW server setup if there is a global handler registration point; otherwise document how to use them per-test
5. Update `GrowthBookFeatureFlagService.test.ts` to use the MSW handler instead of mocking the entire `@growthbook/growthbook` SDK (if the current test only mocks the module, replace with MSW-based test that exercises the real SDK HTTP call)

**Validation**: `pnpm typecheck`, `pnpm lint --fix`, `pnpm test`

---

### [x] Step 20: E2E test for /feature-flags-demo page

**Subagent task**: Add a Playwright E2E spec for the `/feature-flags-demo` page.

**Reference pattern**: Look at `e2e/home.spec.ts` and `e2e/security.spec.ts` for existing patterns.

**New file**: `e2e/feature-flags-demo.spec.ts`

**Test cases**:

1. Page loads successfully (status 200, no error boundary shown)
2. Page title contains "Feature Flags Demo"
3. At least one feature flag status card is visible on the page
4. The page shows the active provider name somewhere
5. (Skip or conditional) If `FEATURE_FLAG_PROVIDER=static` and flags are configured, verify specific flag UI states

**Note**: The demo page is public (no auth required). Tests must NOT depend on Clerk credentials. Use `test.skip` conditions appropriately if env-dependent.

**Validation**: `pnpm typecheck`, `pnpm lint --fix` — E2E tests do not run in unit suite.

---

### [x] Step 21: Update AI agent docs — all discovered patterns

**Subagent task**: Update all AI agent instruction files with the patterns uncovered during this feature-flags implementation. These patterns were missing and caused real bugs and design gaps.

**Files to update** (all must be updated — these are the canonical locations per AGENTS.md):

1. `AGENTS.md` — primary always-applied context
2. `docs/ai/general/03 - Next.js Runtime Agent.md`
3. `docs/ai/general/04 - Implementation Agents.md`
4. `docs/ai/general/05 - Validation Strategy Agent.md`
5. `.github/agents/implementation-agent.agent.md`
6. `.github/agents/validation-strategy.agent.md`
7. `.github/agents/nextjs-runtime.agent.md`
8. `docs/ai/general/SECURITY_CODING_PATTERNS.md`

**Patterns to add** (add each to the relevant files — do NOT add everything to every file, route to the right authority):

**Pattern A — Schema Type Discipline** (add to AGENTS.md, Implementation Agent, Security Patterns):

- UUID columns must only be used for: (1) DB-generated PKs via `defaultRandom()`, (2) FK references to other UUID-typed PKs.
- Externally-sourced string identifiers — Clerk org IDs (`org_xxx`), tenant slugs, string scope keys, feature flag tenant scope keys — MUST use `text` type.
- Misuse of UUID for external IDs causes `22P02` runtime errors that are silent in development but crash production queries.

**Pattern B — `*.db.test.ts` Integration Tests Required for All Drizzle Adapters** (add to Validation Strategy Agent, Implementation Agent):

- Every `Drizzle*Service` / `Drizzle*Repository` class MUST have a companion `*.db.test.ts` integration test.
- Pattern: `resolveTestDb()` from `@/testing/db/create-test-db`, `beforeAll` / `afterAll` with `testDb.cleanup()`.
- Unit tests with mocked DB (like `DrizzleFeatureFlagService.test.ts`) are NOT sufficient alone — they cannot catch schema type errors.

**Pattern C — MSW for External HTTP Adapters** (add to Implementation Agent, Validation Strategy Agent):

- Any adapter that makes external HTTP calls (GrowthBook, external APIs) MUST have a companion MSW handler in `__mocks__/handlers.ts`.
- Handlers belong in `src/modules/{module}/infrastructure/{adapter}/__mocks__/handlers.ts`.
- Register via the MSW `server` from `src/shared/lib/mocks/server.ts`.

**Pattern D — `isMain` Guard for Exported Script Functions** (add to Implementation Agent):

- Scripts that export functions AND call a main function at module level MUST use an `isMain` guard.
- Pattern:
  ```typescript
  const isMain = typeof process.argv[1] === 'string' &&
    process.argv[1].endsWith('/script-name.ts');
  if (isMain) { run().catch(...) }
  ```
- Without this guard, importing the script in tests triggers the side-effectful `run()` call.

**Pattern E — `load-env.ts` for tsx scripts** (add to Implementation Agent):

- `tsx` scripts do NOT auto-load `.env.local`.
- Scripts that need env vars from `.env.local` must import the shared `scripts/load-env.ts` as their absolute first import.
- `node --env-file ... node_modules/.bin/tsx` is BROKEN — tsx CLI is a shell wrapper, not a Node.js module.
- The canonical command in `package.json` is `tsx scripts/your-script.ts` (plain, no `--env-file`).

**Pattern F — E2E tests for all public demo/showcase pages** (add to Validation Strategy Agent, Playwright E2E Agent):

- Every showcase/demo page added to the boilerplate MUST have a Playwright spec.
- At minimum: page loads without error boundary, title is correct, key elements are visible.
- Demo pages are public (no auth) — tests must NOT depend on Clerk credentials.

**Validation**: `pnpm typecheck` — no TypeScript errors in updated docs (they are markdown, so just verify the files were written without syntax errors in any code blocks).
