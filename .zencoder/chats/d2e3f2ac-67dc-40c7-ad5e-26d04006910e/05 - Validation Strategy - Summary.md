# 05 - Validation Strategy - Summary

## Task Context

- Task ID: d2e3f2ac-67dc-40c7-ad5e-26d04006910e
- Task Objective: Define minimum validation for three code review findings
- Current Run Scope: FlagsFile format change, GrowthBook cache key fix, SQL false positive
- Mode: CHANGE VALIDATION
- Status: COMPLETED
- Last Updated: 2026-04-02
- Related Control Artifacts: `constraints.md`, `02 - Security & Auth - Summary.md`

---

## Scope Handled

- change surfaces assessed: `scripts/flags/` type + 3 scripts, `GrowthBookFeatureFlagService.ts`
- validation questions in scope: Multi-tenant data preservation, cache key isolation, type safety
- excluded validation areas: Auth/authorization flow, DB schema, migration SQL, proxy behavior

---

## Validation-Risk Assessment

- primary risks:
  1. FlagsFile format change breaks existing tests that use `Record<string, FlagEntry>` format — `migrate.test.ts` must be updated
  2. Round-trip lossy export not caught by current tests — no test covers multi-tenant (same key, different tenantId) scenario
  3. GrowthBook cache key test: module-level cache persists across test runs; testing requires careful isolation (dynamic imports or `vi.resetModules()`)
- confidence gaps: No existing test validates multi-tenant export round-trip
- over-validation concerns: Do not need E2E or DB integration tests for the cache key fix or type change

---

## Recommended Validation Scope

### Minimum Required Validation

1. **Update `migrate.test.ts`** — all existing tests use `Record<string, FlagEntry>` format; update to use `FlagEntry[]` array format after the type change
2. **Add multi-tenant test in `migrate.test.ts`** — `readStaticFlags()` and `writeToStaticFormat()` with both global and tenant rows; confirm `writeToStaticFormat` only outputs global rows
3. **Add cache key isolation test in `GrowthBookFeatureFlagService.test.ts`** — same `clientKey`, different `apiHost` must produce different cache entries; use `vi.resetModules()` and dynamic imports to isolate the module-level cache
4. **`pnpm typecheck`** — must pass with no errors after `FlagEntry` now has `key: string` as required field
5. **`pnpm lint --fix`** — must pass clean

### Optional Additional Validation

- Add `export.test.ts` unit test for `exportDb()` (not currently tested) covering:
  - single global row → single array entry
  - multiple rows with same key + different tenantId → two array entries (the core regression test)
- Add `import.test.ts` unit test for `upsertFlags()` confirming it iterates the array format

### Validation Explicitly Not Required

- E2E Playwright tests — no UI is involved
- DB integration tests — the DB schema and query logic are unchanged; `upsertFlags` already uses `(key, tenantId)` composite identity correctly
- Auth/authorization validation — no auth code is touched
- Migration SQL validation — the SQL is correct PG15+ syntax; SQLint finding is a false positive

---

## Validation Commands / Checks

```shell
# After implementation — run from repo root
pnpm typecheck
pnpm lint --fix
pnpm test --reporter=verbose scripts/flags
pnpm test --reporter=verbose GrowthBookFeatureFlagService
```

- environment prerequisites: None beyond standard dev setup
- expected evidence:
  - `pnpm typecheck` exits 0
  - `pnpm lint --fix` exits 0
  - All tests in `scripts/flags/migrate.test.ts` pass
  - New multi-tenant tests in `migrate.test.ts` pass
  - Cache key isolation test in `GrowthBookFeatureFlagService.test.ts` passes

---

## Open Questions / Blockers

- None blocking validation

---

## Handoff Notes

- what the next agent should rely on: Update existing tests alongside the type change; do not leave `migrate.test.ts` in a broken state post-format-change
- what should not be re-decided without new evidence: The GrowthBook cache key test approach (dynamic imports / module reset) is the standard pattern for module-level state in Vitest
- recommended next specialist or step: Implementation

---

## Update Log

### Update Entry — Initial Validation Strategy

- Date: 2026-04-02
- Trigger: Incident workflow step 6
- Summary of change: Defined minimum validation including test updates and new multi-tenant scenarios
- Sections refreshed: All
