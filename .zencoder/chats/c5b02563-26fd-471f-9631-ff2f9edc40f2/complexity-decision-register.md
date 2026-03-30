# Complexity Decision Register

Generated from: Architecture Guard review of 51 MEDIUM Lizard issues (Groups A–J)  
Source summary: `01 - Architecture Guard - Summary.md`

---

## Decision Summary

| Category                                          | Count  |
| ------------------------------------------------- | ------ |
| **SUPPRESS** (false positive or inapplicable)     | **28** |
| **SKIP** (real metric, justified by architecture) | **17** |
| **FIX** (dead code removal, low blast radius)     | **1**  |
| **REFACTOR** (low priority, extraction only)      | **2**  |
| **Total**                                         | **51** |

---

## Actionable Items (3 total)

These are the only items that warrant any code change.

### 1. FIX — Remove dead PGlite branch in `resolve-bootstrap-outcome.ts`

**File**: `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`  
**Lines**: 76–88 (13-line block)  
**Priority**: Low  
**Blast radius**: Minimal — 13-line deletion in a single file, no callers affected, no imports change

**What to remove**: The `if (err instanceof PGliteWasmAbortError || ...)` block returns `{ type: 'error', error: 'db_error' }` — identical to the catch-all `return` on line 88. Dead code. Removing it drops cyclomatic from ~19 to ~11.

**Security note**: Typed error catches for `CrossProviderLinkingNotAllowedError`, `TenantUserLimitReachedError`, `TenantContextRequiredError` are unaffected and must be retained.

---

### 2. REFACTOR — Extract `assertCrossProviderLinkingAllowed` helper in `DrizzleProvisioningService.ts`

**File**: `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`  
**Function**: `resolveOrCreateUser` (lines 664–868)  
**Priority**: Low  
**Blast radius**: Same-file extraction, no new files, no behavior change, no transaction boundary impact

**What to extract**: The cross-provider linking policy gate appears twice in `resolveOrCreateUser` (pre-INSERT and post-INSERT race-condition paths). Extract to:

```ts
function assertCrossProviderLinkingAllowed(
  crossProviderEmailLinking: 'disabled' | 'verified-only',
  emailVerified: boolean | undefined,
): void {
  if (crossProviderEmailLinking === 'disabled') {
    throw new CrossProviderLinkingNotAllowedError('...');
  }
  if (emailVerified !== true) {
    throw new CrossProviderLinkingNotAllowedError('...');
  }
}
```

Eliminates ~12 lines of duplication. Cyclomatic drops ~4–6. Intent at call sites becomes clearer.

---

### 3. REFACTOR — Extract `sanitizeContext` from log route handler

**File**: `src/app/api/logs/route.ts` → new file `src/shared/lib/security/sanitize-log-context.ts`  
**Priority**: Low  
**Blast radius**: Minimal — move function, update import in route. No behavior change. Complexity stays the same (it's inherent to the function's purpose).

**Why**: `sanitizeContext` is a security utility (secret-scrubbing, depth-limiting, type-safe passthrough). It belongs in a shared security utility, not inside a route handler. Moving it makes it testable in isolation.

---

## Full Decision Register (all 51 issues)

### Group A — Documentation/Markdown (10 issues)

| #   | File                                                           | Issue                   | Decision     | Justification                                                             |
| --- | -------------------------------------------------------------- | ----------------------- | ------------ | ------------------------------------------------------------------------- |
| A-1 | `.copilot/IMPLEMENTATION_LOCKED.md`                            | Duplicate headings (3×) | **SUPPRESS** | Template-style multi-PR doc; heading repetition is intentional structure  |
| A-2 | `docs/tanstack-migration/09-features.md`                       | Duplicate headings (2×) | **SUPPRESS** | Before/After migration guide format; repetition is the format             |
| A-3 | `docs/audits/Instruction - Professional Audit - Example 01.md` | Duplicate headings (3×) | **SUPPRESS** | 30+ template repetitions — destroying them would break the audit template |
| A-4 | `.copilot/tasks/.../04 - Implementation Agent - Summary.md`    | Duplicate heading (1×)  | **SUPPRESS** | AI task artifact; markdown rules have no applicability here               |
| A-5 | `.zencoder/chats/.../turnstile-runtime-verification.md`        | Duplicate heading (1×)  | **SUPPRESS** | AI task artifact                                                          |
| A-6 | `docs/tanstack-migration/03-core-layer.md`                     | Duplicate heading (1×)  | **SUPPRESS** | Migration guide template format                                           |

_Note: 10 individual flagged instances across these 6 files, all suppressed._

---

### Group B — Test & Scripting Code (11 issues)

| #    | File                                              | Function                        | Violation     | Decision                      | Justification                                                                         |
| ---- | ------------------------------------------------- | ------------------------------- | ------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| B-1  | `scripts/e2e/load-env.mjs`                        | `parseEnvFile`                  | 95 LOC        | **SUPPRESS**                  | Scripting code with intentional security guards (path traversal, prototype pollution) |
| B-2  | `scripts/e2e/run-scenario.mjs`                    | `cleanupStaleLocalNextDevState` | cyclomatic 9  | **SUPPRESS**                  | E2E process-cleanup; proportional to OS-level task                                    |
| B-3  | `scripts/e2e/run-scenario.mjs`                    | `applySharedRuntimeEnv`         | cyclomatic 12 | **SUPPRESS**                  | E2E env wiring; each branch = distinct config path                                    |
| B-4  | `e2e/runtime-profile.ts`                          | `readValue`                     | cyclomatic 9  | **SUPPRESS**                  | 4-source env priority chain; inherent complexity                                      |
| B-5  | `e2e/runtime-profile.ts`                          | `tenancyMode`                   | cyclomatic 9  | **SUPPRESS — FALSE POSITIVE** | Object property key, not a function; Lizard misidentifies it                          |
| B-6  | `e2e/provisioning-runtime.spec.ts`                | _(file)_                        | 1300 LOC      | **SUPPRESS**                  | 4-scenario Playwright suite; splitting harms test locality                            |
| B-7  | `e2e/provisioning-runtime.spec.ts`                | `setActiveOrganization`         | cyclomatic 12 | **SUPPRESS**                  | Playwright UI automation helper; retry/assertion branching is normal                  |
| B-8  | `src/security/api/with-node-provisioning.test.ts` | anonymous async                 | 16 parameters | **SUPPRESS — FALSE POSITIVE** | Zero-parameter arrow function; Lizard counts returned object fields as parameters     |
| B-9  | `DrizzleProvisioningService.db.test.ts`           | anonymous function              | cyclomatic 9  | **SUPPRESS**                  | Drizzle ORM `.where(and(...))` chains counted as branches; test code                  |
| B-10 | `DrizzleProvisioningService.db.test.ts`           | anonymous function              | 95 LOC        | **SUPPRESS**                  | Idempotency integration test; explicit DB assertions drive LOC                        |
| B-11 | `DrizzleProvisioningService.db.test.ts`           | _(file)_                        | 861 LOC       | **SUPPRESS**                  | 4 tenancy modes × scenario coverage; proportional breadth                             |

---

### Group C — Provisioning Service Core (4 issues)

| #   | File                            | Function                   | Violation     | Decision                      | Justification                                                                                                                                   |
| --- | ------------------------------- | -------------------------- | ------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1 | `DrizzleProvisioningService.ts` | _(file)_                   | 1045 LOC      | **SKIP**                      | Not a god class; bulk is structured logging + race-safety patterns + cohesive transaction unit                                                  |
| C-2 | `DrizzleProvisioningService.ts` | `isSyntheticFallbackEmail` | cyclomatic 22 | **SUPPRESS — FALSE POSITIVE** | Function is 3 lines (`return ... && ...`); cyclomatic max 2. Lizard misattributes `ensureProvisioned`'s complexity across class/module boundary |
| C-3 | `DrizzleProvisioningService.ts` | `resolveOrCreateUser`      | cyclomatic 28 | **REFACTOR (low priority)**   | Real complexity; duplicate policy gate (race-safe pre/post-INSERT). Extract `assertCrossProviderLinkingAllowed()` helper                        |
| C-4 | `DrizzleProvisioningService.ts` | `resolveOrCreateUser`      | 168 LOC       | **SKIP**                      | LOC driven by race-safety comments, security invariant docs, logging                                                                            |

---

### Group D — Auth Bootstrap Critical Path (4 issues)

| #   | File                           | Function                  | Violation     | Decision               | Justification                                                                                                                        |
| --- | ------------------------------ | ------------------------- | ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| D-1 | `resolve-bootstrap-outcome.ts` | `resolveBootstrapOutcome` | 67 LOC        | **SKIP**               | Every line is real work; proportional to identity→provision→onboarding orchestration                                                 |
| D-2 | `resolve-bootstrap-outcome.ts` | `resolveBootstrapOutcome` | cyclomatic 19 | **FIX (low priority)** | Dead branch found: PGlite `instanceof` block (lines 76–88) returns identical value to catch-all. Remove 13 lines, drop cyclomatic ~6 |
| D-3 | `start/route.ts`               | `GET`                     | 67 LOC        | **SKIP**               | Route handler routing 5 typed outcomes; correct placement and size                                                                   |
| D-4 | `start/route.ts`               | `GET`                     | cyclomatic 9  | **SKIP**               | Inherent from 5 switch cases + minimal guards                                                                                        |

---

### Group E — Security Middleware (3 issues)

| #   | File                                   | Function                          | Violation     | Decision                      | Justification                                                                                                   |
| --- | -------------------------------------- | --------------------------------- | ------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| E-1 | `src/security/middleware/with-auth.ts` | `redirectForMissingTenantContext` | 10 parameters | **SUPPRESS — FALSE POSITIVE** | Actual function: 1 parameter. Lizard accumulates parameters across adjacent helper functions                    |
| E-2 | `src/security/middleware/with-auth.ts` | `redirectForMissingTenantContext` | cyclomatic 19 | **SUPPRESS — FALSE POSITIVE** | Actual function: cyclomatic 1 (no branches). Lizard attributes `withAuth` inner closure's real complexity to it |
| E-3 | `src/security/middleware/with-auth.ts` | `redirectForMissingTenantContext` | 70 LOC        | **SUPPRESS — FALSE POSITIVE** | Actual function: 5 lines. Lizard scans into `withAuth`'s inner closure                                          |

_Note: `withAuth` inner closure's real cyclomatic ~19 is justified — 8-step security pipeline._

---

### Group F — Security Core (4 issues)

| #   | File                                    | Function                         | Violation     | Decision                      | Justification                                                                                                                                                     |
| --- | --------------------------------------- | -------------------------------- | ------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1 | `node-provisioning-access.ts`           | `evaluateNodeProvisioningAccess` | 212 LOC       | **SKIP**                      | LOC dominated by 7 × diagnostics objects (~84 lines); guard logic is a readable sequential pipeline. Single-function auth pipeline is preferable for auditability |
| F-2 | `node-provisioning-access.ts`           | `evaluateNodeProvisioningAccess` | cyclomatic 15 | **SKIP**                      | Every branch is a necessary typed access outcome (BOOTSTRAP_REQUIRED, UNAUTHENTICATED, ONBOARDING_REQUIRED, etc.)                                                 |
| F-3 | `src/security/core/security-context.ts` | `?`                              | 70 LOC        | **SUPPRESS — FALSE POSITIVE** | Ternary expression token `?` at line 70 misread by Lizard as a function definition                                                                                |
| F-4 | `src/security/core/security-context.ts` | `?`                              | cyclomatic 10 | **SUPPRESS — FALSE POSITIVE** | Same misattribution — `createSecurityContext`'s real complexity attributed to ternary token                                                                       |

---

### Group G — Auth Module (4 issues)

| #   | File                            | Function              | Violation     | Decision                      | Justification                                                                                                                         |
| --- | ------------------------------- | --------------------- | ------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| G-1 | `src/modules/auth/index.ts`     | `buildIdentitySource` | 75 LOC        | **SUPPRESS — FALSE POSITIVE** | `buildIdentitySource` is 14 lines. Lizard scans into adjacent `buildTenantResolver` (72 lines), a justified 3-mode × 2-source factory |
| G-2 | `src/modules/auth/index.ts`     | `buildIdentitySource` | cyclomatic 14 | **SUPPRESS — FALSE POSITIVE** | Same attribution error; `buildTenantResolver`'s real complexity is justified                                                          |
| G-3 | `ClerkRequestIdentitySource.ts` | `Boolean`             | cyclomatic 10 | **SUPPRESS — FALSE POSITIVE** | `Boolean(orgId)` is a built-in call, not a function definition. Lizard misidentifies it                                               |
| G-4 | `ClerkRequestIdentitySource.ts` | `readStringClaim`     | cyclomatic 10 | **SUPPRESS — FALSE POSITIVE** | Actual complexity = 4. Lizard accumulates 3 adjacent helper functions                                                                 |

---

### Group H — App Layouts (3 issues)

| #   | File                            | Function          | Violation     | Decision | Justification                                                                               |
| --- | ------------------------------- | ----------------- | ------------- | -------- | ------------------------------------------------------------------------------------------- |
| H-1 | `src/app/users/layout.tsx`      | `UsersLayout`     | 87 LOC        | **SKIP** | Guard + structured auth-flow logging. Logging-heavy by design; correct App Router pattern   |
| H-2 | `src/app/users/layout.tsx`      | `UsersLayout`     | cyclomatic 14 | **SKIP** | 6 typed auth outcomes require 6 distinct redirect branches — irreducible domain complexity  |
| H-3 | `src/app/onboarding/layout.tsx` | `OnboardingGuard` | 137 LOC       | **SKIP** | ~85 lines of structured logging (security-critical observability); guard logic is ~25 lines |

---

### Group I — Core Infrastructure (2 issues)

| #   | File                                 | Function            | Violation     | Decision                      | Justification                                                                                                                     |
| --- | ------------------------------------ | ------------------- | ------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| I-1 | `src/core/runtime/infrastructure.ts` | `getInfrastructure` | 82 LOC        | **SKIP**                      | Process-scoped singleton composition root; ~52 lines observability. Splitting would scatter state machine                         |
| I-2 | `src/core/runtime/bootstrap.ts`      | `resolveDbProvider` | cyclomatic 11 | **SUPPRESS — FALSE POSITIVE** | Actual function: 2 lines (`return env.DB_PROVIDER ?? 'drizzle'`). Lizard accumulates adjacent `resolveDbDriver`'s real complexity |

---

### Group J — Observability/Logging (3 issues)

| #   | File                         | Function          | Violation     | Decision                      | Justification                                                                                                               |
| --- | ---------------------------- | ----------------- | ------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| J-1 | `sentry-dev-filters.ts`      | `getHintMessage`  | cyclomatic 10 | **SUPPRESS — FALSE POSITIVE** | Actual complexity = 2. Lizard accumulates all 4 helper functions in file                                                    |
| J-2 | `src/app/api/logs/route.ts`  | `sanitizeContext` | cyclomatic 23 | **REFACTOR (low priority)**   | Real complexity, inherent to security sanitization role. Extract to shared utility for testability and boundary correctness |
| J-3 | `src/core/logger/streams.ts` | `getLogStreams`   | cyclomatic 11 | **SKIP**                      | Real complexity, proportional to 3-stream × environment-condition role; well-structured                                     |

---

## Priority Order for Actionable Items

| Priority | Item                                                                           | Effort | Risk                                |
| -------- | ------------------------------------------------------------------------------ | ------ | ----------------------------------- |
| 1        | Remove dead PGlite branch in `resolve-bootstrap-outcome.ts`                    | 10 min | Near-zero (13-line deletion)        |
| 2        | Extract `sanitizeContext` to shared utility                                    | 20 min | Near-zero (move + import update)    |
| 3        | Extract `assertCrossProviderLinkingAllowed` in `DrizzleProvisioningService.ts` | 30 min | Low (same-file, no behavior change) |

All three can be done in a single PR with minimal review burden.
