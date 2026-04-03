# Incident Intake

## Incident Description

Three automated code review findings from Codex on PR commit `82606fa630`:

### Finding 1 — Lossy Multi-Tenant Export in `scripts/flags/export.ts`

**Reported by**: chatgpt-codex-connector  
**Severity**: HIGH  
**File**: `scripts/flags/export.ts` (also mirrored in `scripts/flags/migrate.ts`)

The `exportDb()` function iterates over all rows from `featureFlagsTable` and writes `flags[row.key] = {...}`. Because `FlagsFile.flags` is typed as `Record<string, FlagEntry>` (one entry per flag key), any flag that has both a global entry (`tenantId = null`) and one or more tenant-specific entries will be silently overwritten by the last DB row encountered. This makes `flags:export` / `flags:migrate` lossy for multi-tenant environments, potentially dropping tenant overrides on re-import.

The same `readDbFlags()` function in `scripts/flags/migrate.ts` contains the identical bug.

### Finding 2 — GrowthBook Client Cache Keyed Only by `clientKey`

**Reported by**: chatgpt-codex-connector  
**Severity**: HIGH  
**File**: `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts`

The module-level `clientCache` is a `Map<string, ClientEntry>` keyed only by `clientKey`. The `getOrCreateClient(clientKey, apiHost)` function ignores `apiHost` for cache lookup. If two `GrowthBookFeatureFlagService` instances are created with the same `clientKey` but different `apiHost` values, the second instance silently reuses the first cached client (pointing to the wrong backend), evaluating flags against an incorrect GrowthBook server.

### Finding 3 — SQL `NULLS NOT DISTINCT` Flagged as Non-ANSI

**Reported by**: SQLint / Codex connector  
**Severity**: Flagged as "HIGH — Compatibility"  
**File**: `src/core/db/migrations/generated/0007_zippy_gorilla_man.sql`

```sql
ALTER TABLE "feature_flags" ADD CONSTRAINT "uq_feature_flags_key_tenant" UNIQUE NULLS NOT DISTINCT("key","tenant_id");
```

SQLint reports this as non-ANSI SQL syntax. The `NULLS NOT DISTINCT` modifier is PostgreSQL 15+ syntax and is Drizzle-generated output from the `.nullsNotDistinct()` constraint builder, which is the repository-mandated pattern (SEC-08 in `SECURITY_CODING_PATTERNS.md`). This is expected to be a false positive for this Postgres-only codebase.

---

## Suspected Severity

| Finding                        | Functional Risk                      | Security Risk                                                                                        |
| ------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Lossy multi-tenant export      | HIGH — silent data loss on re-import | LOW — no auth bypass; affects script tooling                                                         |
| GrowthBook cache key collision | MEDIUM — wrong backend queried       | LOW-MEDIUM — could cause wrong feature flag evaluation, potentially bypassing a flag-guarded feature |
| SQL NULLS NOT DISTINCT         | NONE — valid PG15+ syntax            | NONE — false positive                                                                                |

---

## Affected Surface

- `scripts/flags/export.ts` — flags:export script
- `scripts/flags/migrate.ts` — `readDbFlags()` function (same bug)
- `scripts/flags/types.ts` — `FlagsFile` type definition (root cause of the lossy format)
- `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts` — GrowthBook SDK adapter
- `src/core/db/migrations/generated/0007_zippy_gorilla_man.sql` — Drizzle-generated migration

---

## Known Symptoms

- Finding 1: Silent data loss when exporting from a multi-tenant DB and re-importing (backup/restore or environment seeding). The last row with a given `key` wins; all earlier rows for that key are dropped.
- Finding 2: Wrong GrowthBook backend queried if two service instances use the same `clientKey` with different hosts. In practice, this is unlikely in the current single-host setup but would silently corrupt feature evaluation in a multi-region or staged rollout scenario.
- Finding 3: No runtime symptom — the SQL executes correctly on PostgreSQL 15+.

---

## Known Constraints

- The `FlagsFile` format (`Record<string, FlagEntry>`) is used in import, export, and migrate scripts. Fixing the lossy export requires either changing the format or making the key composite.
- The GrowthBook module-level cache was introduced to comply with SEC-09 (do not share mutable SDK instances per request — cache feature definitions, evaluate per-request). The fix must preserve this intent.
- The migration file `0007_zippy_gorilla_man.sql` is Drizzle-generated and should NOT be manually edited. The source of truth is the Drizzle schema + `.nullsNotDistinct()` builder.

---

## Initial Unknowns

- Whether any production or staging environment already has multi-tenant flag rows that would be affected by the lossy export.
- Whether the `FlagsFile` format change would be backward-compatible with the import script.
- Whether `clientKey` is ever reused with different `apiHost` values in the current deployment configuration.

---

## Source of Findings

Automated PR code review by chatgpt-codex-connector and SQLint, triggered on commit `82606fa630`.
