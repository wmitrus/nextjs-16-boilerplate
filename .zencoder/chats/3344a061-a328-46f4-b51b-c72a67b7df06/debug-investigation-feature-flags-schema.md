# Debug / Investigation Report — Feature Flags Schema & Plan Validation

**Agent**: Debug / Investigation Agent  
**Date**: 2026-04-01  
**Status**: COMPLETE — findings confirmed, one critical amendment added to plan

---

## 1. Objective

Independent investigation to confirm or refute the existing `feature-flags-schema-review.md` and plan steps 17–21, with specific focus on: the Postgres error root cause, the full identity resolution chain, schema design correctness, boundary integrity, and completeness of proposed fixes.

---

## 2. Symptom Summary

**Primary symptom**: `feature_flags` DB query fails with Postgres error `22P02: invalid input syntax for type uuid` when `tenant_id = 'demo'` is used as a query parameter.

**Secondary symptom**: All 3 flags on `/feature-flags-demo` render as `false`. `ResilientFeatureFlagService` catches the error silently and returns `false` — correct fail-safe behavior, but error is real.

**Trigger conditions**: `FEATURE_FLAG_PROVIDER=db` (or any postgres driver), demo page visits with synthetic `AuthorizationContext.tenant.tenantId = 'demo'`.

---

## 3. Confirmed Evidence

### E1 — UUID column type is the direct cause

**Confirmed.** Migration `0006_breezy_scarlet_spider.sql` shows:

```sql
"tenant_id" uuid
```

Postgres validates UUID format at parameter binding time. `'demo'` is not a valid UUID. The query fails before Postgres evaluates any row. The `OR tenant_id IS NULL` fallback is never reached.

### E2 — Identity chain always produces UUID-shaped strings in production

**Confirmed.** Traced end-to-end:

- `DrizzleInternalIdentityLookup.findInternalTenantId()` returns `authTenantIdentitiesTable.tenantId` (column type: `uuid`)
- `DrizzleProvisioningService.deterministicTenantId()` produces a UUID-shaped hash string used as `tenants.id`
- `tenants.id` is `uuid` PK in `tenantsReferenceTable`
- `AuthorizationContext.tenant.tenantId` in real auth flows is always a UUID-formatted string

### E3 — `TenantId = string` is the contract type

**Confirmed.** `src/core/contracts/primitives.ts`:

```typescript
export type TenantId = string;
```

The contract is intentionally loose. UUID formatting is a runtime convention in the provisioning path, not enforced at the type level.

### E4 — No FK exists on `feature_flags.tenant_id`

**Confirmed.** Migration SQL shows no `REFERENCES` or `FOREIGN KEY` constraint. UUID type provides format validation; referential integrity is zero. A deleted tenant's flags are orphaned.

### E5 — DI wiring for FEATURE_FLAGS.SERVICE is correct

**Confirmed.** `src/core/runtime/bootstrap.ts` lines 87–90:

```typescript
container.register(
  FEATURE_FLAGS.SERVICE,
  createFeatureFlagService(env.FEATURE_FLAG_PROVIDER, { ... }),
);
```

No wiring gap. This concern from the Architecture Guard's earlier review was already resolved.

### E6 — Unique index does NOT protect global flags from duplicates ← NEW CRITICAL FINDING

**Confirmed.** The migration generates:

```sql
CREATE UNIQUE INDEX "uq_feature_flags_key_tenant" ON "feature_flags" USING btree ("key","tenant_id");
```

Standard BTree unique indexes treat `NULL != NULL`. This means **multiple rows with the same `key` and `tenant_id IS NULL` can coexist**. The import script handles this at application level (explicit `isNull` check in the SELECT query), but the DB constraint does not prevent concurrent inserts or direct inserts from other code paths.

Drizzle ORM supports `.nullsNotDistinct()` on `uniqueIndex()` — generates `NULLS NOT DISTINCT` (Postgres 15+). This fix is required.

### E7 — No `*.db.test.ts` for `DrizzleFeatureFlagService`

**Confirmed.** Only `DrizzleFeatureFlagService.test.ts` exists using a mocked DB via `vi.fn()`. No real-DB integration test. The mocked test cannot catch schema type errors.

### E8 — GrowthBook tests mock entire SDK, not HTTP

**Confirmed.** `GrowthBookFeatureFlagService.test.ts` uses `vi.mock('@growthbook/growthbook')` — mocks the entire SDK class. The actual HTTP call from `gb.init()` to `https://cdn.growthbook.io/api/features/:clientKey` is never exercised in any test.

### E9 — No E2E spec for `/feature-flags-demo`

**Confirmed.** `e2e/` contains: `auth.spec.ts`, `error-boundary.spec.ts`, `home.spec.ts`, `provisioning-runtime.spec.ts`, `security.spec.ts`, `users.spec.ts`. No `feature-flags-demo.spec.ts`.

---

## 4. Execution Path (Failure Trace)

```
/feature-flags-demo (RSC page)
  → await connection()                           [opts into dynamic rendering]
  → getAppContainer().createChild()
  → container.resolve(FEATURE_FLAGS.SERVICE)     [returns ResilientFeatureFlagService]
  → flagService.isEnabled('demo.new-dashboard-ui', { tenant: { tenantId: 'demo' } })
    → ResilientFeatureFlagService.isEnabled()
      → DrizzleFeatureFlagService.isEnabled()
        → db.select()...where(
            eq(key, 'demo.new-dashboard-ui') AND
            (eq(tenant_id, 'demo') OR isNull(tenant_id))
          )
          → Postgres: parameter $2 = 'demo' cannot be cast to uuid
          → raises 22P02  ← FAILURE POINT
      → throws PostgresError
    → ResilientFeatureFlagService catches error
    → logs WARN, returns false    ← correct fail-safe, masks the real error
  → flag = false (all 3 flags)
```

---

## 5. Source-of-Truth Analysis

| Concern                         | Source of Truth                            | Current State                                      |
| ------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| `tenant_id` data type for flags | Contract `TenantId = string`               | Schema says `uuid` — **mismatch**                  |
| Real production tenant IDs      | `tenants.id` (UUID PK, deterministic hash) | Always UUID-shaped strings                         |
| Referential integrity for flags | Should be explicit constraint              | Not enforced — orphan risk                         |
| Global flag uniqueness          | DB unique constraint                       | Partially enforced — NULL escapes BTree uniqueness |
| GrowthBook HTTP behavior        | Real SDK call to CDN                       | Untested — fully mocked                            |

---

## 6. Likely Failure Points

**FP-1 — CONFIRMED**: `uuid` column rejects non-UUID strings at query binding. Affects demo page and any code path that passes non-UUID `tenantId` to `DrizzleFeatureFlagService`.

**FP-2 — CONFIRMED**: Unique index on `(key, tenant_id)` without `NULLS NOT DISTINCT` allows duplicate global flags. Application-level upsert guards this in `flags:import`, but direct DB inserts from any other code path (future admin API, seeding scripts, tests) can create silent duplicates. The `DrizzleFeatureFlagService.isEnabled()` fallback logic (`find(r => r.tenantId === null)`) returns the **first** matching global row — nondeterministic if duplicates exist.

**FP-3 — LIKELY**: When `FEATURE_FLAG_PROVIDER=db` is active, any code path passing a non-internal-UUID string as `tenantId` (Clerk org IDs like `org_xxx`, slug strings) to `isEnabled()` would also fail with `uuid` column type. Current production auth flows pass internal UUIDs so this is not triggered today — but it is a latent risk if Clerk org IDs ever reach the flag evaluation path before UUID resolution.

---

## 7. Hypotheses

### H1 — Schema review Option D (TEXT, no FK + documented convention) is architecturally correct

**Likely correct.** Evidence: `TenantId = string` contract, GrowthBook uses string tenant attributes, static adapter ignores tenant context, all 3 adapters need consistent behavior, loose coupling is intentional.

### H2 — The existing plan Step 17 is correct but incomplete

**Confirmed.** Step 17 changes `uuid → text` but does NOT fix the `uniqueIndex` NULL behavior bug (FP-2). Step 17 must also add `.nullsNotDistinct()` to the unique index definition.

### H3 — Step 18 (db.test.ts) is necessary and will catch real schema issues

**Confirmed.** The existing unit test with mocked DB cannot detect column type errors. A `*.db.test.ts` with PGlite would have caught the UUID issue during development.

### H4 — Step 19 (MSW for GrowthBook) is valuable but needs an amendment

**Likely correct as direction, needs care.** The plan asks to "replace" the module mock with MSW. The GrowthBook SDK's HTTP call is inside `gb.init()` which uses a module-level singleton cache (`instanceCache` Map). MSW will work for Node.js fetch interception, but tests must clear the `instanceCache` between runs to avoid singleton bleed. The step should specify: add MSW handler AND isolate/reset the `instanceCache` per test.

### H5 — The boundary is correct (feature-flags module stays isolated)

**Confirmed.** No cross-module boundary violations found. `DrizzleFeatureFlagService` only imports `@/core/db` and its own `schema.ts`. No leaks into auth, provisioning, or authorization modules.

---

## 8. Missing Evidence / Uncertainty

| Item                                                       | Status                                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Actual Postgres version in production                      | Unknown — `@testcontainers/postgresql@^11` suggests 15+ but not confirmed. `NULLS NOT DISTINCT` requires Postgres 15. |
| Whether `GrowthBook.init()` uses `fetch` or XHR in Node.js | Needs verification — MSW node server intercepts `fetch`, not XHR. Must confirm before Step 19.                        |

---

## 9. Recommended Next Action

### Critical amendment to Step 17

Step 17 must include this additional fix to `schema.ts`:

```typescript
// CURRENT (broken — allows duplicate global flags):
uniqueIndex('uq_feature_flags_key_tenant').on(t.key, t.tenantId),

// FIXED (correct — NULLs treated as equal for uniqueness):
uniqueIndex('uq_feature_flags_key_tenant')
  .on(t.key, t.tenantId)
  .nullsNotDistinct(),
```

Generates:

```sql
CREATE UNIQUE INDEX "uq_feature_flags_key_tenant" ON "feature_flags"
USING btree ("key","tenant_id") NULLS NOT DISTINCT;
```

Requires **Postgres 15+**.

### Step 19 amendment

Before implementing MSW for GrowthBook:

1. Confirm GrowthBook SDK uses `fetch` (not XHR) in Node.js
2. Add `instanceCache.clear()` or test-scoped key isolation between tests

### Sequencing: Steps 17 → 18 → 19 → 20 → 21 must be sequential

Step 18 must follow Step 17. Step 18 tests the fixed `text` column. Running Step 18 against current `uuid` schema in PGlite may or may not surface the issue (PGlite may be more lenient than Postgres).

---

## 10. Plan Confirmation Summary

| Plan item                             | Status                        | Note                                               |
| ------------------------------------- | ----------------------------- | -------------------------------------------------- |
| Schema review — UUID→TEXT diagnosis   | ✅ Confirmed correct          |                                                    |
| Schema review — identity chain trace  | ✅ Confirmed correct          |                                                    |
| Schema review — Option D recommended  | ✅ Confirmed correct          |                                                    |
| Step 17 (UUID→TEXT change)            | ⚠️ Incomplete                 | Must also add `.nullsNotDistinct()` to uniqueIndex |
| Step 18 (db.test.ts)                  | ✅ Confirmed necessary        | Must run after Step 17                             |
| Step 19 (MSW GrowthBook)              | ⚠️ Needs amendment            | Add instanceCache isolation + confirm fetch vs XHR |
| Step 20 (E2E spec)                    | ✅ Confirmed necessary        | No spec exists                                     |
| Step 21 (AI doc updates)              | ✅ Confirmed necessary        | Pattern gaps are real and documented               |
| **NEW: uniqueIndex nullsNotDistinct** | ❌ Missing from original plan | Must be added to Step 17                           |
