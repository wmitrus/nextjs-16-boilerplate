# Constraints Summary

## Task

Fix three automated code review findings from commit `82606fa630`:

1. Lossy multi-tenant flag export in `scripts/flags/` (FlagsFile type + export/import/migrate scripts)
2. GrowthBook client cache key missing `apiHost` in `GrowthBookFeatureFlagService.ts`
3. SQL `NULLS NOT DISTINCT` flagged by SQLint (confirmed false positive — no fix required)

---

## Scope

- `scripts/flags/types.ts` — change `FlagsFile.flags` from `Record<string, FlagEntry>` to `FlagEntry[]`; add `key: string` field to `FlagEntry`
- `scripts/flags/export.ts` — update `exportDb()` and `exportStatic()` to produce array format
- `scripts/flags/import.ts` — update `upsertFlags()` to iterate array instead of `Object.entries()`
- `scripts/flags/migrate.ts` — update `readDbFlags()`, `writeToStaticFormat()`, `readStaticFlags()` for array format
- `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts` — fix cache key to include `apiHost`

---

## Out of Scope

- `src/core/db/migrations/generated/0007_zippy_gorilla_man.sql` — do not edit; confirmed false positive
- Any application-layer code (`src/app/`, `src/modules/`, `src/core/` except the GrowthBook adapter)
- DB schema changes — the schema is correct
- Changes to `src/proxy.ts`, auth, or authorization logic

---

## Architecture Constraints

- `FlagsFile` type is internal to `scripts/flags/` — no application module imports it; type change is contained
- All three script consumers (export, import, migrate) must be updated atomically with the type change
- `writeToStaticFormat()` must filter to only `tenantId === null` rows when writing static format; this is already the intent and must be preserved in the new format
- GrowthBook cache key fix is internal to `getOrCreateClient()` — the `FeatureFlagService` contract and DI registration are unchanged

---

## Security/Auth Constraints

- Module-level `clientCache` in `GrowthBookFeatureFlagService` must remain at module scope (SEC-09 compliance)
- Cache entries must hold only SDK client + ready promise — no user data, no tenant data
- The `apiHost` for GrowthBook comes from DI-injected config (validated via `assertSafeGrowthBookApiHost` in factory.ts — HTTPS required); it is trusted server-side config, not user input
- `tenantId` in flag records flows from the DB via `AuthorizationContext` — not from client input; trust boundary is unchanged

---

## Runtime Constraints

- `GrowthBookFeatureFlagService` runs in Node.js runtime only — no Edge runtime changes needed
- Module-level cache is correct for Node.js (not per-request); do not move to request scope

---

## Validation Constraints

- Minimum required validation:
  - Unit tests for updated export, import, and migrate scripts covering multi-tenant scenarios (multiple entries with same key, different tenantId)
  - Unit test confirming GrowthBook cache uses composite key (same clientKey + different apiHost → different clients)
  - Typecheck pass (`pnpm typecheck`)
  - Lint pass (`pnpm lint --fix`)
- Optional additional validation:
  - Integration test for round-trip: export from multi-tenant DB → import back → verify all rows present
  - Check existing `migrate.test.ts` and update it to cover array format

---

## Explicitly Allowed Changes

1. Change `FlagEntry` to add `key: string` field; change `FlagsFile.flags` from `Record<string, FlagEntry>` to `FlagEntry[]`
2. Update `exportDb()` in `export.ts` to push array entries
3. Update `exportStatic()` in `export.ts` to push array entries
4. Update `upsertFlags()` in `import.ts` to iterate `data.flags` as array
5. Update `readDbFlags()` in `migrate.ts` to return array
6. Update `writeToStaticFormat()` in `migrate.ts` to iterate array, filter `tenantId === null`
7. Update `readStaticFlags()` in `migrate.ts` to return array
8. Change GrowthBook cache key to `` `${clientKey}|${apiHost}` ``
9. Update tests in `migrate.test.ts` and any tests for export/import to cover multi-tenant array format

---

## Explicitly Forbidden Changes

- Do not edit `src/core/db/migrations/generated/0007_zippy_gorilla_man.sql`
- Do not change the DB schema or migration
- Do not change `FeatureFlagService` contract in `src/core/contracts/feature-flags.ts`
- Do not change `factory.ts` or DI registration
- Do not move GrowthBook `clientCache` to per-request scope
- Do not add user or tenant data to the GrowthBook cache entries
- Do not change `src/proxy.ts` or any auth/authorization code
- Do not make the FlagsFile format change backward-compatible at the cost of correctness — the old format is wrong

---

## Protected Invariants

- `writeToStaticFormat()` writes only global (`tenantId === null`) rows to FEATURE_FLAGS_STATIC format
- `upsertFlags()` and `writeToDb()` correctly use `(key, tenantId)` composite identity for upsert logic — this is already correct and must remain unchanged
- `GrowthBookFeatureFlagService.isEnabled()` passes fresh per-request `AuthorizationContext` to flag evaluation — this must not change
- `assertSafeGrowthBookApiHost()` HTTPS validation in factory.ts remains in place

---

## Open Questions / Blocks

- None blocking implementation. The `writeToStaticFormat` already filters `tenantId === null`, so after the format change, it simply needs to iterate the array instead of `Object.entries()`.
