# 02 - Security & Auth - Summary

## Task Context

- Task ID: d2e3f2ac-67dc-40c7-ad5e-26d04006910e
- Task Objective: Triage and remediate three automated code review findings on commit `82606fa630`
- Current Run Scope: Security classification, trust-boundary assessment, findings triage, remediation recommendation
- Status: IN PROGRESS
- Last Updated: 2026-04-02
- Related Control Artifacts: `incident-intake.md`

---

## Scope Handled

- auth surfaces reviewed: None directly affected — findings are in feature-flag tooling scripts and GrowthBook SDK adapter
- authorization surfaces reviewed: Feature flag evaluation path in `GrowthBookFeatureFlagService` (flags gate feature access indirectly)
- trust-boundary questions in scope: Module-level SDK instance caching, multi-tenant flag data serialization, Drizzle-generated migration SQL

---

## Inputs Reviewed

- code paths reviewed:
  - `scripts/flags/export.ts` — `exportDb()`
  - `scripts/flags/migrate.ts` — `readDbFlags()`, `writeToDb()`
  - `scripts/flags/import.ts` — `upsertFlags()`
  - `scripts/flags/types.ts` — `FlagsFile`, `FlagEntry`
  - `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts`
  - `src/modules/feature-flags/infrastructure/drizzle/schema.ts`
  - `src/core/db/migrations/generated/0007_zippy_gorilla_man.sql`
- security/auth docs reviewed: `SECURITY_CODING_PATTERNS.md`, `AGENTS.md` SEC-08, SEC-09
- earlier task artifacts reviewed: `incident-intake.md`

---

## Actions Performed

- identity flow tracing performed: N/A — findings do not affect authentication boundaries
- authorization enforcement review performed: Reviewed GrowthBook feature-flag evaluation path; flags are evaluated server-side with `AuthorizationContext` passed in
- tenant / org context review performed: Confirmed `tenantId` flows from `AuthorizationContext.tenant.tenantId` into GrowthBook attributes — not from client input
- sensitive-data exposure review performed: No tokens, secrets, or session identifiers exposed in affected code paths

---

## Current-State Findings

### FINDING 1 — MAJOR: Lossy Multi-Tenant Flag Export

**Files**: `scripts/flags/export.ts`, `scripts/flags/migrate.ts`, `scripts/flags/types.ts`

**Root Cause**: `FlagsFile.flags` is typed as `Record<string, FlagEntry>` — a flat map keyed by flag name alone. The DB table allows multiple rows per `key` (global `tenantId = null` + per-tenant overrides), but the serialization format can only hold one entry per `key`. The export loop `flags[row.key] = {...}` overwrites on collision.

**Affected operations**:

- `flags:export --adapter=db` (production backup)
- `flags:migrate --from=db --to=static` (DB→static migration)
- Any round-trip: export → import → DB restores only the last-written row per key

**Impact**: Silent loss of tenant-specific flag overrides during backup/restore or environment seeding. In a multi-tenant production environment, this could silently disable or enable a feature for specific tenants after a restore operation. No immediate security bypass, but incorrect feature-flag state could expose or hide features in unintended ways if flags guard feature access.

**Classification**: MAJOR — data integrity in tooling; indirect authorization impact through flag-gated features

**Evidence**: `FlagsFile` type at `scripts/flags/types.ts:1-8`; export loop at `scripts/flags/export.ts:54`; same pattern at `scripts/flags/migrate.ts:28`

---

### FINDING 2 — MAJOR: GrowthBook Client Cache Key Collision

**File**: `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts`

**Root Cause**: Module-level `clientCache: Map<string, ClientEntry>` uses only `clientKey` as the cache key. The `getOrCreateClient(clientKey, apiHost)` function ignores `apiHost` during cache lookup (`clientCache.get(clientKey)` — line 14). If two service instances share the same `clientKey` but target different hosts (self-hosted vs. cloud, staging vs. prod), the second instance silently reuses the first cached client.

**Impact**: Feature flags evaluated against the wrong GrowthBook backend. In a staged rollout or multi-region scenario, this could cause the wrong flags to be returned — potentially bypassing a flag-gated feature or incorrectly blocking access. The bug is silent; no error is thrown.

**Note on SEC-09**: The module-level cache was introduced to comply with SEC-09 ("cache only feature definitions, evaluate with per-request context"). The fix must preserve this — the cache is correct in principle; only the cache key is wrong.

**Classification**: MAJOR — incorrect flag evaluation; indirect authorization impact

**Evidence**: `getOrCreateClient` at `GrowthBookFeatureFlagService.ts:13-21`

---

### FINDING 3 — INFORMATIONAL (False Positive): SQL `NULLS NOT DISTINCT`

**File**: `src/core/db/migrations/generated/0007_zippy_gorilla_man.sql`

**Finding**: SQLint reports `UNIQUE NULLS NOT DISTINCT(...)` as non-ANSI SQL.

**Assessment**: This is Drizzle ORM-generated SQL from the `.nullsNotDistinct()` constraint builder on the `featureFlagsTable` schema. `NULLS NOT DISTINCT` is valid PostgreSQL 15+ syntax and is the repository-mandated pattern per **SEC-08** in `SECURITY_CODING_PATTERNS.md`. This codebase targets PostgreSQL exclusively. The migration file should not be manually edited.

**Classification**: INFORMATIONAL — confirmed false positive; aligns with SEC-08

**Action**: No code change required. Document as false positive in scanner ignore report.

---

## Trust Boundary Assessment

- where identity is established: Clerk via `src/modules/auth` — not affected by these findings
- where authorization is enforced: Server-side in route handlers and server actions — not affected
- where tenant or org context is derived: `AuthorizationContext.tenant.tenantId` is passed from server-side session into `GrowthBookFeatureFlagService.isEnabled()` — this path is correct and trusted
- what claims or inputs are trusted: No untrusted input flows into the affected code paths; `tenantId` in flag scripts comes from the DB rows themselves, not from user input

**GrowthBook trust boundary note**: The `apiHost` for GrowthBook comes from `config.apiHost`, which is provided at service construction time (DI-injected from env-backed config). The bug is not a trust-boundary violation — it is an internal cache implementation error.

---

## Sensitive Data And Exposure Notes

- logging / telemetry review: No tokens, session IDs, or private user data in the affected paths
- response exposure review: GrowthBook `isEnabled()` returns boolean only — no sensitive data returned to client
- client exposure review: `GrowthBookFeatureFlagService` is server-side only
- cache exposure review: The module-level `clientCache` holds GrowthBook SDK client instances (not user data). The bug is incorrect backend selection, not cross-user data leakage.

---

## Security Decisions / Constraints

- approved controls or constraints:
  - GrowthBook module-level client cache MUST be preserved (SEC-09 compliance)
  - `FlagsFile` format fix MUST be backward-compatible with import script (or import must be updated atomically)
  - Do not edit Drizzle-generated migration files directly
- rejected directions:
  - Do not add user-level data to the GrowthBook client cache
  - Do not move the GrowthBook cache to per-request scope (violates SEC-09)
- required enforcement points:
  - Cache key for GrowthBook must include both `clientKey` and `apiHost`
  - `FlagsFile.flags` format must represent the full composite identity `(key, tenantId)` without collision

---

## Artifact Synchronization

- `plan.md` updates: Findings do not affect auth middleware or route security — Runtime Review (Step 3) and Architecture Review (Step 4) are conditionally in scope only for the GrowthBook cache structure change
- specialist artifact updates: This file is the primary security artifact

---

## Open Questions / Blockers

- unresolved questions:
  - Is there a production DB with multi-tenant flag rows already? If yes, Finding 1 is a data-loss risk on next export/restore.
  - Is `clientKey` ever configured with different `apiHost` in current deployments? If not, Finding 2 is latent risk only.
- blockers: None — both fixes are well-defined
- evidence still needed: None for remediation decisions

---

## Handoff Notes

- what the next agent should rely on: Both MAJOR findings require code changes in scripts and the GrowthBook adapter
- what should not be re-decided without new evidence: The SQL finding is a confirmed false positive; do not attempt to change the migration
- recommended next specialist or step: Architecture Guard (Finding 1 affects `FlagsFile` type contract shared across three scripts); then Constraints Summary and Implementation

---

## Update Log

### Update Entry — Initial Review

- Date: 2026-04-02
- Trigger: Automated PR code review findings on commit 82606fa630
- Summary of change: Initial security classification of three findings
- Sections refreshed: All

---

## Post-Implementation Security Recheck

### Trust Boundary — Post-Fix Assessment

- **Finding 1 (FlagsFile format)**: The change is purely in serialization format for tooling scripts. No auth boundary, tenant context derivation, or trusted claim handling was modified. The fix correctly moves from a lossy format that could silently drop tenant-specific flag state to a lossless array format that preserves all `(key, tenantId)` pairs. No new trust-boundary risk introduced.

- **Finding 2 (GrowthBook cache key)**: The `clientKey|apiHost` composite cache key is derived entirely from server-side DI-injected configuration (env vars validated by `assertSafeGrowthBookApiHost()` with HTTPS enforcement). No user input participates in the cache key. The fix closes the risk of incorrect backend selection without introducing any new trust-boundary exposure. Module-level cache scope is preserved per SEC-09.

- **Finding 3 (SQL false positive)**: No code change. Migration SQL is Drizzle-generated and correct.

### No New Auth or Security Regressions

- Auth boundaries: unchanged
- Authorization enforcement: unchanged
- Tenant context derivation: unchanged (flows from `AuthorizationContext.tenant.tenantId` server-side)
- Provider isolation: unchanged (GrowthBook adapter stays within infrastructure layer)
- Sensitive data: no new exposure — cache holds SDK client instances only, no user data

### Residual Risks Explicitly Named

1. Existing pre-fix JSON flag export files (if any) use the old `Record<string, FlagEntry>` format. Re-importing them with the new code will produce wrong results. Operators should regenerate exports post-deploy.
2. Full `pnpm lint --fix` suite was not run due to environment timeout. Changed-file lint was clean.

### Status

Both real findings are **CLOSED — FIXED**. The SQL finding is **CLOSED — FALSE POSITIVE** (documented in scanner ignore report). No open security risks from this incident.

---

## Update Log

### Update Entry — Post-Implementation Recheck

- Date: 2026-04-03
- Trigger: Final Security Check step of incident workflow
- Summary of change: Added post-fix trust boundary confirmation; no new regressions found; residual risks named
- Sections refreshed: Post-Implementation Security Recheck, Update Log
