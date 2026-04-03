# Feature Flags Architecture, Implementation, Migration, Schema Fix & Agent Doc Updates

## Extended Session Summary

---

## Session Origin & Task Brief Authoring

The session began with building a feature-flags use-case for a production-grade Next.js 16 TypeScript modular monolith boilerplate. Architecture Guard approved a local multi-adapter pattern (Static, Drizzle/DB, GrowthBook), rejected OpenFeature as mandatory, and identified a DI wiring gap (since resolved).

---

## Phase 1–3 (Completed)

Full implementation across 15 plan steps:

- 3 adapters: `StaticFeatureFlagService`, `DrizzleFeatureFlagService`, `GrowthBookFeatureFlagService`
- `ResilientFeatureFlagService` decorator (fail-safe: returns `false` on any error)
- `factory.ts` with env-var-based adapter switching via `FEATURE_FLAG_PROVIDER`
- DB schema (`feature_flags` table), Drizzle migration
- Migration scripts (`flags:export`, `flags:import`, `flags:migrate`)
- `/feature-flags-demo` RSC page with 3 demo flags
- `connection()` prerender fix for RSC + `getAppContainer()` pattern
- All quality gates passing (typecheck ✅, lint ✅, 128 test files / 852 tests ✅)

---

## Phase 4 — Script Fix (Step 16, Completed)

Fixed broken `flags:migrate` command: `tsx` CLI is a shell script, `node --env-file` cannot execute it. Created `scripts/load-env.ts` shared utility, `scripts/flags/utils.ts` consolidated helpers, added `isMain` guards, reverted `package.json` to plain `tsx scripts/flags/migrate.ts`. Added 24 new unit tests.

---

## Phase 5 — Postgres UUID Error Investigation

The `/feature-flags-demo` page showed all flags as `false` with Postgres error `22P02: invalid input syntax for type uuid`. Root cause: `feature_flags.tenant_id` column was `uuid` type, but the demo page passed `tenantId: 'demo'` (non-UUID string) in the synthetic `AuthorizationContext`. The query fails at Postgres parameter binding time before any row evaluation.

---

## Architecture Guard Self-Correction & Schema Review

The Architecture Guard initially jumped to implementation before fully tracing the identity chain. A full investigation was done:

- `auth_tenant_identities.external_tenant_id` = TEXT (Clerk org ID like `org_xxx`)
- `auth_tenant_identities.tenant_id` = UUID FK → `tenants.id`
- `DrizzleProvisioningService.deterministicTenantId()` generates UUID-shaped hashes stored as `tenants.id`
- Real `AuthorizationContext.tenant.tenantId` in production = always UUID-shaped string
- Contract `TenantId = string` is intentionally loose
- `feature_flags.tenant_id` was `uuid` with NO FK — worst state (format validation cost, zero referential integrity)

Recommendation adopted: **Option D — `text` type** + documented convention that production values will always be UUIDs.

Schema review saved: `.zencoder/chats/.../feature-flags-schema-review.md`

---

## Debug/Investigation Agent — Independent Confirmation

Debug/Investigation Agent independently confirmed all findings AND discovered a critical additional finding: the `uniqueIndex('uq_feature_flags_key_tenant').on(t.key, t.tenantId)` uses a standard BTree index. In Postgres, `NULL != NULL` in BTree — meaning multiple global flags (`tenant_id IS NULL`) with the same key can coexist. The plan's Step 17 was amended to also fix this with `.nullsNotDistinct()`.

Investigation report saved: `.zencoder/chats/.../debug-investigation-feature-flags-schema.md`

---

## Step 17 — Schema Fix (Completed)

- Changed `tenantId: uuid('tenant_id')` → `tenantId: text('tenant_id')` in schema
- Switched from `uniqueIndex()` to `unique()` constraint builder (only `unique()` has `.nullsNotDistinct()` in drizzle-orm 0.45.1 — `uniqueIndex` does not expose this method)
- Added `.nullsNotDistinct()` to enforce global flag uniqueness at DB level
- Generated migration `0007_zippy_gorilla_man.sql`:
  ```sql
  DROP INDEX "uq_feature_flags_key_tenant";
  ALTER TABLE "feature_flags" ALTER COLUMN "tenant_id" SET DATA TYPE text;
  ALTER TABLE "feature_flags" ADD CONSTRAINT "uq_feature_flags_key_tenant" UNIQUE NULLS NOT DISTINCT("key","tenant_id");
  ```
- Typecheck ✅, lint ✅, 128 test files / 852 tests ✅

---

## Step 18 — DB Integration Test (Completed)

Created `DrizzleFeatureFlagService.db.test.ts` using the `*.db.test.ts` pattern with `resolveTestDb()` from `@/testing/db/create-test-db`. 7 tests covering: flag not found, global enabled/disabled, tenant override beats global, falls back to global, different tenant isolation, and critically — `text` type accepts non-UUID strings like `'demo'`. Test uses PGlite in-memory DB. 129 test files / 859 tests ✅.

---

## Step 19 — MSW Mock for GrowthBook (Completed)

Created `src/modules/feature-flags/infrastructure/growthbook/__mocks__/handlers.ts` with `growthbookHandlers` and `makeFeaturesResponse()` helper. MSW was confirmed to intercept GrowthBook SDK's `fetch` in Node.js (proven with isolated Node.js test). However, in the vitest unit test context, the module-level `instanceCache` singleton and `polyfills.fetch = globalThis.fetch.bind(globalThis)` in GrowthBook's `feature-repository.js` (captured at module import time before `server.listen()` in `beforeAll`) caused MSW-based tests to fail for positive (`true`) assertions.

Key finding: tests expecting `false` passed accidentally (GrowthBook SDK returning empty features = false for all), tests expecting `true` failed. Architectural decision: **keep the module mock for the unit test** (correctly tests adapter behavior, no singleton issues) and keep `__mocks__/handlers.ts` for future integration test use. Explanatory comment added to the test file. Typecheck ✅, lint ✅.

---

## Step 20 — E2E Test for /feature-flags-demo (Completed)

Created `e2e/feature-flags-demo.spec.ts` with 5 tests: page loads without error boundary, correct title, provider name visible, flag status cards visible, adapter switching instructions section visible. Page is public (no auth required) — no Clerk credentials needed. Typecheck ✅.

---

## Step 21 — AI Agent Documentation Updates (Completed)

Updated all AI agent instruction files with patterns uncovered during this feature-flags implementation:

### Files Updated

| File                                                | Patterns Added                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                         | A (UUID vs TEXT), D (isMain guard), E (load-env.ts), B (\*.db.test.ts), C (MSW handlers), F (E2E for demo pages), SEC-07+SEC-08 in table |
| `docs/ai/general/03 - Next.js Runtime Agent.md`     | RSC `connection()` dynamic rendering pattern                                                                                             |
| `docs/ai/general/04 - Implementation Agents.md`     | A, B, C, D, E                                                                                                                            |
| `docs/ai/general/05 - Validation Strategy Agent.md` | B, C, F                                                                                                                                  |
| `docs/ai/general/07 - Playwright E2E Agent.md`      | F                                                                                                                                        |
| `.github/agents/implementation-agent.agent.md`      | A, B, C, D, E                                                                                                                            |
| `.github/agents/validation-strategy.agent.md`       | B, C, F                                                                                                                                  |
| `.github/agents/nextjs-runtime.agent.md`            | RSC `connection()`, load-env                                                                                                             |
| `docs/ai/general/SECURITY_CODING_PATTERNS.md`       | SEC-07 (UUID vs TEXT), SEC-08 (NULLS NOT DISTINCT)                                                                                       |

### Patterns Added

- **Pattern A** — Schema Type Discipline: `uuid` only for DB-generated PKs and FK refs; `text` for external IDs
- **Pattern B** — `*.db.test.ts` required for all Drizzle adapters; unit test alone insufficient
- **Pattern C** — MSW `__mocks__/handlers.ts` for all external HTTP adapters
- **Pattern D** — `isMain` guard for scripts that export functions and run side effects
- **Pattern E** — `load-env.ts` as first import for tsx scripts; `node --env-file tsx` is broken
- **Pattern F** — Playwright E2E spec required for every demo/showcase page (public, no auth)
- **SEC-07** — SECURITY_CODING_PATTERNS: uuid vs text schema rule with 22P02 context
- **SEC-08** — SECURITY_CODING_PATTERNS: `unique().nullsNotDistinct()` vs `uniqueIndex()` for nullable columns

---

## Key Technical Findings (Permanent Record)

1. **`unique().nullsNotDistinct()` NOT `uniqueIndex().nullsNotDistinct()`** — only the constraint builder exposes this method in drizzle-orm 0.45.1
2. **GrowthBook SDK** uses `polyfills.fetch = globalThis.fetch.bind(globalThis)` at module-level — MSW interception works in Node.js but has timing issues in vitest with pre-imported modules
3. **`bootstrap.test.ts` is a known flaky test** in the full suite (timeouts under load but passes in isolation) — pre-existing issue, not introduced by this work
4. **Migration `0007_zippy_gorilla_man.sql` is generated but NOT applied** — user must run `pnpm db:migrate:dev` manually

---

## Final Test State

- 129 test files / 859 tests (all passing)
- typecheck ✅
- lint ✅ (5 pre-existing warnings, 0 errors)

---

## Pending User Action

```shell
pnpm db:migrate:dev
```

This applies migration `0007_zippy_gorilla_man.sql` to the local dev Postgres instance:

- Changes `feature_flags.tenant_id` from `uuid` to `text`
- Drops old `uq_feature_flags_key_tenant` BTree index
- Adds `UNIQUE NULLS NOT DISTINCT` constraint on `(key, tenant_id)`
