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
