# Code Complexity Review — 51 Medium Issues

## Configuration

- **Execution Control**: `manual-handoff`
- **Artifacts Path**: `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c5b02563-26fd-471f-9631-ff2f9edc40f2`
- **Source Issues File**: `/tmp/zencoder/pasted/files/20260325213825-hkxijn.txt`
- **Intake Brief**: `intake.md` in this directory

## Static Analysis Platform

Issues are raised by **Codacy** (`app.codacy.com`) integrated with GitHub. Codacy runs Lizard on every PR and blocks or annotates PRs with these findings.

Rules can be disabled directly in Codacy's web UI under **Code Patterns** per repository. There is no `.lizardrc` or local config file in this repository — all suppression must go through Codacy's pattern management UI.

**Goal of Step 12**: Produce a list of specific Lizard patterns/rules that the architect recommends disabling in Codacy, so that false positives and inapplicable patterns no longer surface on every PR. Each recommendation must name the exact Codacy/Lizard pattern identifier and include a justification from the findings of this review.

## Before Running

Read:

- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `.zencoder/chats/c5b02563-26fd-471f-9631-ff2f9edc40f2/intake.md`

## Workflow Overview

For each group in intake.md:

1. Architecture Guard reviews the group
2. Agent produces a per-group decision: **Fix**, **Skip with justification**, or **Refactor with scope**
3. Orchestrator pauses and reports decisions to operator
4. Operator confirms or adjusts before next group

Groups must be processed **sequentially** because earlier decisions (skip/fix) affect scope of later groups.

---

## Workflow Steps

### [x] Step 1: Group A — Documentation/Markdown (10 issues)

Review 10 "Multiple headings with same content" issues across:

- `.copilot/` task artifacts
- `docs/tanstack-migration/`
- `docs/audits/`
- `.zencoder/chats/`

Architecture Guard must assess:

- Are markdown heading duplication rules applicable to internal task artifacts and documentation?
- Is fixing these changes of any real engineering value?
- Produce a clear SKIP or FIX decision with justification

Output: append to `01 - Architecture Guard - Summary.md`

**PAUSE after this step — report decision to operator before continuing.**

---

### [x] Step 2: Group B — Test & Scripting Code (11 issues)

Review complexity violations in:

- `scripts/e2e/load-env.mjs` — `parseEnvFile` 95 LOC
- `scripts/e2e/run-scenario.mjs` — `cleanupStaleLocalNextDevState` cyclomatic 9
- `scripts/e2e/run-scenario.mjs` — `applySharedRuntimeEnv` cyclomatic 12
- `e2e/runtime-profile.ts` — `readValue` cyclomatic 9
- `e2e/runtime-profile.ts` — `tenancyMode` cyclomatic 9
- `e2e/provisioning-runtime.spec.ts` — file 1300 LOC
- `e2e/provisioning-runtime.spec.ts` — `setActiveOrganization` cyclomatic 12
- `src/security/api/with-node-provisioning.test.ts` — anonymous async 16 parameters
- `DrizzleProvisioningService.db.test.ts` — anonymous function cyclomatic 9
- `DrizzleProvisioningService.db.test.ts` — anonymous function 95 LOC
- `DrizzleProvisioningService.db.test.ts` — file 861 LOC

Architecture Guard must assess:

- Do production complexity limits apply to test and e2e scripting code?
- Is the 16-parameter anonymous function a real design smell in test setup or a false positive?
- For E2E spec files: is 1300 LOC a structural problem or an expected test coverage artifact?
- Per issue: SKIP, SUPPRESS, or FIX with scope

Output: append to `01 - Architecture Guard - Summary.md`

**PAUSE after this step — report decisions to operator before continuing.**

---

### [x] Step 3: Group C — Provisioning Service Core (4 issues — highest concern)

Review:

- `DrizzleProvisioningService.ts` — file 1045 LOC
- `DrizzleProvisioningService.ts` — `isSyntheticFallbackEmail` cyclomatic 22
- `DrizzleProvisioningService.ts` — `resolveOrCreateUser` cyclomatic 28
- `DrizzleProvisioningService.ts` — `resolveOrCreateUser` 168 LOC

Architecture Guard must assess:

- Is `DrizzleProvisioningService.ts` a god class? Does it violate modular monolith boundaries?
- Is `resolveOrCreateUser` (cyclomatic 28, 168 LOC) decomposable without violating transaction boundaries?
- Is `isSyntheticFallbackEmail` (cyclomatic 22) a legitimate validator or a logic smell?
- Propose concrete decomposition if warranted, or justify retaining as-is
- Flag any boundary violations independently of the complexity issue

Output: append to `01 - Architecture Guard - Summary.md`

**PAUSE after this step — report decisions and decomposition options to operator before continuing.**

---

### [x] Step 4: Group D — Auth Bootstrap Critical Path (4 issues)

Review:

- `resolve-bootstrap-outcome.ts` — `resolveBootstrapOutcome` 67 LOC + cyclomatic 19
- `src/app/auth/bootstrap/start/route.ts` — `GET` 67 LOC + cyclomatic 9

Architecture Guard must assess:

- Is the complexity of `resolveBootstrapOutcome` inherent to the domain (error classification + outcome routing) or avoidable?
- Does the error catch block inflate complexity artificially (multiple error types → same `db_error` outcome)?
- Can the `GET` handler be meaningfully split without losing clarity on the critical auth bootstrap path?
- Assessment must account for auth bootstrap being a security-sensitive flow

Output: append to `01 - Architecture Guard - Summary.md`

**PAUSE after this step — report decisions to operator before continuing.**

---

### [x] Step 5: Group E — Security Middleware (3 issues)

Review:

- `src/security/middleware/with-auth.ts` — `redirectForMissingTenantContext` 10 parameters
- `src/security/middleware/with-auth.ts` — `redirectForMissingTenantContext` cyclomatic 19
- `src/security/middleware/with-auth.ts` — `redirectForMissingTenantContext` 70 LOC

Architecture Guard must assess:

- The 10-parameter count for `redirectForMissingTenantContext` is suspicious — the actual signature only has `req: NextRequest`. Confirm if this is a Lizard false positive on the outer wrapper function or on the method containing the call.
- Is the cyclomatic 19 on this function real? Inspect the actual code.
- Is 70 LOC on this function justified by the middleware's required behavior?
- Confirm whether parameter count violation is false positive or requires suppression

Output: append to `01 - Architecture Guard - Summary.md`

**PAUSE after this step — report decisions to operator before continuing.**

---

### [x] Step 6: Group F — Security Core (4 issues)

Review:

- `src/security/core/node-provisioning-access.ts` — `evaluateNodeProvisioningAccess` 212 LOC + cyclomatic 15
- `src/security/core/security-context.ts` — anonymous function `?` 70 LOC + cyclomatic 10

Architecture Guard must assess:

- `evaluateNodeProvisioningAccess` at 212 LOC: is this a single-responsibility function that is inherently complex, or can it be decomposed into guard phases?
- The anonymous `?` in `security-context.ts` at line 70: what is this exactly? Investigate and assess whether it is a genuine function or a tool artifact.
- Do any decompositions here affect security invariants or authorization enforcement points?

Output: append to `01 - Architecture Guard - Summary.md`

**PAUSE after this step — report decisions to operator before continuing.**

---

### [x] Step 7: Group G — Auth Module (4 issues)

Review:

- `src/modules/auth/index.ts` — `buildIdentitySource` 75 LOC + cyclomatic 14
- `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts` — `Boolean` cyclomatic 10
- `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts` — `readStringClaim` cyclomatic 10

Architecture Guard must assess:

- `buildIdentitySource` is a factory with multi-provider + multi-tenancy mode combinations — is complexity 14 justified, or is tenancy resolution logic leaking into the identity source factory?
- `Boolean` at cyclomatic 10: Lizard may be measuring the constructor or surrounding object literal. Confirm if false positive.
- `readStringClaim` cyclomatic 10: does the loop over claim names warrant refactor or is it idiomatic?

Output: append to `01 - Architecture Guard - Summary.md`

**PAUSE after this step — report decisions to operator before continuing.**

---

### [x] Step 8: Group H — App Layouts (3 issues)

Review:

- `src/app/users/layout.tsx` — `UsersLayout` 87 LOC + cyclomatic 14
- `src/app/onboarding/layout.tsx` — `OnboardingGuard` 137 LOC

Architecture Guard must assess:

- `UsersLayout` has inline decision routing logic (chained ternary mapping `access.status` to redirect paths). Should this be extracted to a decision helper?
- `OnboardingGuard` at 137 LOC: is this doing layout work, guard work, and diagnostic logging all in one function?
- In the modular monolith pattern, should layout files call into DI container directly?
- Identify any boundary violations (UI layer containing business rule logic)

Output: append to `01 - Architecture Guard - Summary.md`

**PAUSE after this step — report decisions to operator before continuing.**

---

### [x] Step 9: Group I — Core Infrastructure (2 issues)

Review:

- `src/core/runtime/infrastructure.ts` — `getInfrastructure` 82 LOC
- `src/core/runtime/bootstrap.ts` — `resolveDbProvider` cyclomatic 11

Architecture Guard must assess:

- `getInfrastructure` is a composition root / DI wiring function — is 82 LOC acceptable for this role?
- `resolveDbProvider` at cyclomatic 11: how many DB providers are supported and is the switch complexity proportional?

Output: append to `01 - Architecture Guard - Summary.md`

**PAUSE after this step — report decisions to operator before continuing.**

---

### [x] Step 10: Group J — Observability/Logging (3 issues)

Review:

- `src/shared/lib/observability/sentry-dev-filters.ts` — `getHintMessage` cyclomatic 10
- `src/app/api/logs/route.ts` — `sanitizeContext` cyclomatic 23
- `src/core/logger/streams.ts` — `getLogStreams` cyclomatic 11

Architecture Guard must assess:

- `sanitizeContext` cyclomatic 23 is the standout — is this a real structural smell or is log sanitization inherently branchy?
- `getHintMessage` cyclomatic 10 and `getLogStreams` cyclomatic 11: assess proportionality to their roles
- Are there placement concerns? (e.g., sanitization logic in a route handler vs a shared utility)

Output: append to `01 - Architecture Guard - Summary.md`

**PAUSE after this step — report decisions to operator before continuing.**

---

### [x] Step 11: Final Decision Summary

Consolidate all 10 group decisions into a single implementation-ready decision register.

Output file: `complexity-decision-register.md`

Must contain:

- Per-issue decision: FIX / SKIP / SUPPRESS / REFACTOR
- Justification for each
- Priority order for FIX/REFACTOR items
- Estimated blast radius per change

**PAUSE — present final register to operator for confirmation before any implementation begins.**

---

### [x] Step 12: Lizard Rule Disable Recommendations

Based on all group findings from Steps 1–11, Architecture Guard must produce a list of Lizard rules that are safe to disable globally or per path.

A rule is a candidate for disabling when:

- It consistently produces false positives across this codebase (e.g., Lizard misattributing complexity to `Boolean(x)`, inner ternaries, or object literals)
- It fires only on test/E2E/script paths where production standards do not apply
- It fires on markdown/documentation files where it has no engineering signal
- The pattern it detects is architecturally valid in this codebase (e.g., composition roots, multi-provider factories, exhaustive sanitizers)

Output file: `lizard-disable-recommendations.md`

Must contain:

- Per rule / per pattern: recommended action (disable globally, disable for path, suppress per file, retain)
- Justification tied to findings from this review
- Exact config change or suppression comment syntax required to disable (Lizard CLI flags, `.lizardrc`, or inline comments)
- Confidence level: HIGH (confirmed false positive by code inspection) / MEDIUM (likely noise, but verify) / LOW (borderline — disable at your discretion)

**PAUSE — present recommendations to operator before applying any config changes.**

---

### [x] Step 13: FIX — Remove dead PGlite branch in `resolve-bootstrap-outcome.ts`

Delete the 13-line `if (err instanceof PGliteWasmAbortError || ...)` block in `resolveBootstrapOutcome`. Both the block and the catch-all below it return the identical value `{ type: 'error', error: 'db_error' }`. The block is dead code.

File: `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`  
Lines: ~76–88  
Expected result: cyclomatic drops from ~19 to ~11. Zero behavior change. Typed catches for `CrossProviderLinkingNotAllowedError`, `TenantUserLimitReachedError`, `TenantContextRequiredError` must remain untouched.

Run typecheck after change.

---

### [x] Step 14: REFACTOR — Extract `assertCrossProviderLinkingAllowed` in `DrizzleProvisioningService.ts`

Extract the duplicated cross-provider linking policy gate that appears twice in `resolveOrCreateUser` (pre-INSERT and post-INSERT race-condition paths) into a single module-level helper function in the same file.

File: `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`  
Function: `resolveOrCreateUser` (lines ~664–868)  
Constraint: same-file extraction only, no new files, no behavior change, no transaction boundary impact.

Run typecheck after change.

---

### [x] Step 15: REFACTOR — Extract `sanitizeContext` to shared utility

Move `sanitizeContext` from `src/app/api/logs/route.ts` to a new file `src/shared/lib/security/sanitize-log-context.ts`. Update the import in the route handler. No behavior change.

The function signature, logic, and constants it depends on (`SECRET_KEY_PATTERN`, `RESERVED_TOP_LEVEL_FIELDS`, `MAX_STRING_LENGTH`, `MAX_CONTEXT_DEPTH`) must all move with it or be made available via import. The route handler should import and call the extracted function identically.

Run typecheck after change.
