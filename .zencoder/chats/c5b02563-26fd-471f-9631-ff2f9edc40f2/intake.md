# Task Brief: Code Complexity Review — 51 Medium Issues

## Title

Code Complexity Review and Architectural Decision Register

## Objective

Produce a per-issue architectural decision for each of 51 MEDIUM code complexity violations flagged by the Lizard static analysis tool, grouped by domain. Each decision must be justified by the modular monolith architecture, security requirements, and actual code inspection — not by the linter limit alone. The output is a decision register, not blind remediation.

## Problem Statement

A static analysis run (Lizard) raised 51 MEDIUM issues across the repository. The issues fall into two categories:

1. **Code complexity metrics** — cyclomatic complexity, lines of code, parameter count, file size
2. **Markdown best practice** — duplicate heading text in documentation files

Not all violations represent real problems. Some are:

- False positives from Lizard misattributing complexity to inner functions or object literals
- Expected complexity in composition roots, factories, and auth/security flows where flattening would harm readability
- Test and scripting code that should not be held to production complexity limits
- Markdown documentation artifacts where heading repetition is acceptable by design

The risk of blindly fixing all 51 issues is:

- Introducing unnecessary abstractions that obscure security-sensitive logic
- Splitting functions in ways that harm transaction integrity
- Adding cognitive load in DI/composition root code where a single function is intentionally comprehensive
- Wasting effort on suppression work for non-issues

## Scope

- All 51 issues listed in `/tmp/zencoder/pasted/files/20260325213825-hkxijn.txt`
- Architecture Guard reviews every group and produces a per-issue decision
- For FIX/REFACTOR decisions: scope, approach, and blast radius must be explicitly stated
- For SKIP/SUPPRESS decisions: justification must be specific, not generic

## Out Of Scope

- Implementation of any fix — this task brief is preparation only
- Adding new features or unrelated refactors
- Changing tests unless a specific complexity issue is in a test and fixing it is warranted
- Changing CI/CD configuration for the linter (suppression rules) unless explicitly decided
- Any changes to auth flow behavior — complexity reduction must not change behavior

## Issue Groups

### Group A — Documentation/Markdown (10 issues)

**Characteristic**: "Multiple headings with same content" in markdown files
**Files**:

- `.copilot/2026-03-02-production-provisioning-refactor/IMPLEMENTATION_LOCKED.md` (3 instances)
- `docs/tanstack-migration/09-features.md` (2 instances)
- `docs/audits/Instruction - Professional Audit - Example 01.md` (3 instances)
- `.copilot/tasks/2026-03-19-auth-regression-verification/04 - Implementation Agent - Summary.md` (1 instance)
- `.zencoder/chats/d7fbaba9-1170-4052-aa3b-e8144a7b5541/turnstile-runtime-verification.md` (1 instance)
- `docs/tanstack-migration/03-core-layer.md` (1 instance)

**Architect question**: Are markdown heading duplication rules applicable to task artifacts and migration docs? Should these be suppressed at the linter level or individually?

---

### Group B — Test & Scripting Code (11 issues)

**Characteristic**: Complexity violations in non-production files
**Files and issues**:
| File | Function | Violation |
|---|---|---|
| `scripts/e2e/load-env.mjs` | `parseEnvFile` | 95 LOC |
| `scripts/e2e/run-scenario.mjs` | `cleanupStaleLocalNextDevState` | cyclomatic 9 |
| `scripts/e2e/run-scenario.mjs` | `applySharedRuntimeEnv` | cyclomatic 12 |
| `e2e/runtime-profile.ts` | `readValue` | cyclomatic 9 |
| `e2e/runtime-profile.ts` | `tenancyMode` | cyclomatic 9 |
| `e2e/provisioning-runtime.spec.ts` | _(file)_ | 1300 LOC |
| `e2e/provisioning-runtime.spec.ts` | `setActiveOrganization` | cyclomatic 12 |
| `src/security/api/with-node-provisioning.test.ts` | anonymous async | 16 parameters |
| `DrizzleProvisioningService.db.test.ts` | anonymous function | cyclomatic 9 |
| `DrizzleProvisioningService.db.test.ts` | anonymous function | 95 LOC |
| `DrizzleProvisioningService.db.test.ts` | _(file)_ | 861 LOC |

**Architect question**: Should production complexity limits apply to E2E test scripts? Is 16-parameter anonymous test setup a real DI design smell or a test fixture pattern?

---

### Group C — Provisioning Service Core (4 issues — highest concern)

**Characteristic**: Single large infrastructure service with very high complexity
**Files and issues**:
| File | Function | Violation |
|---|---|---|
| `DrizzleProvisioningService.ts` | _(file)_ | 1045 LOC |
| `DrizzleProvisioningService.ts` | `isSyntheticFallbackEmail` | cyclomatic 22 |
| `DrizzleProvisioningService.ts` | `resolveOrCreateUser` | cyclomatic 28 |
| `DrizzleProvisioningService.ts` | `resolveOrCreateUser` | 168 LOC |

**Context**: `DrizzleProvisioningService.ts` is the Drizzle ORM implementation of `ProvisioningService`. It handles user + tenant provisioning, membership creation, activity state, and policy attachment. `resolveOrCreateUser` operates within a transaction context. `isSyntheticFallbackEmail` is an internal email normalization validator.

**Architect question**: Is this a god-class violation? Can `resolveOrCreateUser` be decomposed without breaking transaction integrity? Is `isSyntheticFallbackEmail` logic that belongs in a domain validator?

---

### Group D — Auth Bootstrap Critical Path (4 issues)

**Characteristic**: Core auth bootstrap orchestration functions
**Files and issues**:
| File | Function | Violation |
|---|---|---|
| `resolve-bootstrap-outcome.ts` | `resolveBootstrapOutcome` | 67 LOC |
| `resolve-bootstrap-outcome.ts` | `resolveBootstrapOutcome` | cyclomatic 19 |
| `src/app/auth/bootstrap/start/route.ts` | `GET` | 67 LOC |
| `src/app/auth/bootstrap/start/route.ts` | `GET` | cyclomatic 9 |

**Context**: `resolveBootstrapOutcome` is an orchestrator function on the critical auth bootstrap path. It resolves identity → provisions user → checks onboarding state → returns a typed outcome. The cyclomatic 19 is heavily inflated by error catch branches that all map to the same `db_error` outcome. The `GET` handler is a route handler that calls `resolveBootstrapOutcome` and redirects based on outcome type.

**Architect question**: Is error-branch inflation in `resolveBootstrapOutcome` a real concern or acceptable? Can the catch block be consolidated? Should the `GET` handler's outcome-to-redirect mapping be extracted?

---

### Group E — Security Middleware (3 issues)

**Characteristic**: Complexity violations in `with-auth.ts` security middleware
**Files and issues**:
| File | Function | Violation |
|---|---|---|
| `src/security/middleware/with-auth.ts` | `redirectForMissingTenantContext` | 10 parameters |
| `src/security/middleware/with-auth.ts` | `redirectForMissingTenantContext` | cyclomatic 19 |
| `src/security/middleware/with-auth.ts` | `redirectForMissingTenantContext` | 70 LOC |

**Context**: The actual signature of `redirectForMissingTenantContext` is `function redirectForMissingTenantContext(req: NextRequest): NextResponse` — 1 parameter. The 10-parameter violation is likely Lizard misattributing complexity from a surrounding function or the outer `withAuth` wrapper. The cyclomatic 19 and 70 LOC numbers need verification against the actual code at line 95+.

**Architect question**: Is the 10-parameter violation a confirmed false positive? What is the true complexity and LOC of the function at line 95 of `with-auth.ts`? Does the 70 LOC / cyclomatic 19 belong to `redirectForMissingTenantContext` or to a different function in the same file?

---

### Group F — Security Core (4 issues)

**Characteristic**: Complexity in security evaluation and context functions
**Files and issues**:
| File | Function | Violation |
|---|---|---|
| `src/security/core/node-provisioning-access.ts` | `evaluateNodeProvisioningAccess` | 212 LOC |
| `src/security/core/node-provisioning-access.ts` | `evaluateNodeProvisioningAccess` | cyclomatic 15 |
| `src/security/core/security-context.ts` | `?` (anonymous) | 70 LOC |
| `src/security/core/security-context.ts` | `?` (anonymous) | cyclomatic 10 |

**Context**: `evaluateNodeProvisioningAccess` is the central authorization evaluation function for the Node provisioning path. At 212 LOC it handles identity resolution, tenant context, membership checks, onboarding state, and authorization. The `?` anonymous function in `security-context.ts` at line 70 is likely a ternary expression body that Lizard is attributing function-like complexity to.

**Architect question**: Can `evaluateNodeProvisioningAccess` be split into guard phases without losing the cohesion of the single authorization decision point? What is the `?` annotation actually referring to in `security-context.ts`?

---

### Group G — Auth Module (4 issues)

**Characteristic**: Complexity in auth module factory and Clerk infrastructure
**Files and issues**:
| File | Function | Violation |
|---|---|---|
| `src/modules/auth/index.ts` | `buildIdentitySource` | 75 LOC |
| `src/modules/auth/index.ts` | `buildIdentitySource` | cyclomatic 14 |
| `ClerkRequestIdentitySource.ts` | `Boolean` | cyclomatic 10 |
| `ClerkRequestIdentitySource.ts` | `readStringClaim` | cyclomatic 10 |

**Context**: `buildIdentitySource` in `src/modules/auth/index.ts` is a factory function selecting identity source by auth provider (clerk/authjs/supabase) and also wiring tenant resolvers by tenancy mode × tenant context source. The `Boolean` cyclomatic 10 is almost certainly a Lizard false positive attributing the complexity of the surrounding `get()` method to `Boolean(orgId)`. `readStringClaim` is a loop over claim name candidates.

**Architect question**: Is tenancy resolution logic correctly placed inside `buildIdentitySource`, or is it leaking auth module wiring into what should be a pure provider factory? Are `Boolean` and `readStringClaim` false positives?

---

### Group H — App Layouts (3 issues)

**Characteristic**: Complexity in Next.js App Router layout components doubling as auth guards
**Files and issues**:
| File | Function | Violation |
|---|---|---|
| `src/app/users/layout.tsx` | `UsersLayout` | 87 LOC |
| `src/app/users/layout.tsx` | `UsersLayout` | cyclomatic 14 |
| `src/app/onboarding/layout.tsx` | `OnboardingGuard` | 137 LOC |

**Context**: `UsersLayout` resolves provisioning access, logs the decision with full diagnostic context, then maps `access.status` to redirect targets via a chained ternary (which drives cyclomatic 14). `OnboardingGuard` at 137 LOC performs DI container resolution, identity lookup, user repository access, onboarding state checking, and structured logging — all inside a layout component.

**Architect question**: Should layout components contain DI container resolution and inline routing decision logic? Is the chained ternary in `UsersLayout` a boundary violation (routing decisions in UI layer)? Should `OnboardingGuard` be an application-layer orchestrator rather than a layout?

---

### Group I — Core Infrastructure (2 issues)

**Characteristic**: Complexity in DI composition root and DB provider resolution
**Files and issues**:
| File | Function | Violation |
|---|---|---|
| `src/core/runtime/infrastructure.ts` | `getInfrastructure` | 82 LOC |
| `src/core/runtime/bootstrap.ts` | `resolveDbProvider` | cyclomatic 11 |

**Context**: `getInfrastructure` is the composition root function that wires infrastructure dependencies. 82 LOC for a composition root is within the expected range for a multi-provider system. `resolveDbProvider` selects the DB provider based on env config — cyclomatic 11 is likely proportional to the number of supported providers and their fallback logic.

**Architect question**: Is 82 LOC for a composition root acceptable in this architecture? Does `resolveDbProvider` at cyclomatic 11 indicate unnecessary branching or just provider variety?

---

### Group J — Observability/Logging (3 issues)

**Characteristic**: Complexity in log sanitization and stream configuration
**Files and issues**:
| File | Function | Violation |
|---|---|---|
| `src/shared/lib/observability/sentry-dev-filters.ts` | `getHintMessage` | cyclomatic 10 |
| `src/app/api/logs/route.ts` | `sanitizeContext` | cyclomatic 23 |
| `src/core/logger/streams.ts` | `getLogStreams` | cyclomatic 11 |

**Context**: `sanitizeContext` at cyclomatic 23 is the standout. It is in a route handler (`src/app/api/logs/route.ts`) — if it is doing per-field sanitization with `typeof` checks, the complexity is real but may be inherently branchy. Placement in a route handler is a concern (should be a shared utility). `getHintMessage` and `getLogStreams` at 10–11 are borderline.

**Architect question**: Should `sanitizeContext` be extracted from the route handler into a shared sanitization utility? Is cyclomatic 23 a refactoring opportunity or noise from a necessarily exhaustive field-by-field sanitizer?

---

## Requirements

1. Architecture Guard must read each affected file before deciding — no decisions from function names alone
2. Decisions must be one of: **FIX**, **REFACTOR**, **SKIP**, **SUPPRESS**
3. SKIP = the complexity is justified, no change needed
4. SUPPRESS = the metric is inapplicable (false positive, test code, docs) — propose suppression rule if warranted
5. FIX = the function needs targeted reduction, narrow scope, no behavior change
6. REFACTOR = structural decomposition needed, explicit scope and blast radius required
7. All FIX/REFACTOR decisions must respect: transaction boundaries, auth flow invariants, DI contracts, module boundaries
8. No decision should introduce new coupling or break the modular monolith contract
9. REFACTOR decisions in security/auth code require explicit statement that the behavior is unchanged

## Acceptance Criteria

- Every one of the 51 issues has a decision
- No decision is made without reading the actual file
- False positives are confirmed by code inspection, not assumed
- REFACTOR decisions include concrete decomposition approach and blast radius
- Final decision register (`complexity-decision-register.md`) is operator-reviewed before any implementation begins

## Verification Sources

- `docs/ai/general/REPOSITORY_AI_CONTEXT.md` — modular monolith structure
- `docs/ai/general/01 - Architecture Guard.md` — architecture review standards
- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` — auth flow invariants
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` — auth flow scenarios
- Source files listed per group above

## Affected Areas

- `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`
- `src/app/auth/bootstrap/`
- `src/security/middleware/with-auth.ts`
- `src/security/core/`
- `src/modules/auth/`
- `src/app/users/layout.tsx`
- `src/app/onboarding/layout.tsx`
- `src/core/runtime/`
- `src/shared/lib/observability/`
- `src/app/api/logs/route.ts`
- `scripts/e2e/`
- `e2e/`
- Markdown docs (`.copilot/`, `docs/tanstack-migration/`, `docs/audits/`, `.zencoder/`)

## Constraints

- **Auth flow invariants must not change** — any complexity reduction in bootstrap, middleware, or guard code must be behavior-neutral
- **Transaction boundaries must be preserved** — decomposition of `resolveOrCreateUser` must not split transactional units
- **DI contracts must not break** — changes to `buildIdentitySource`, `getInfrastructure` must not change container registration
- **Module boundaries must not regress** — no new cross-module imports as a side effect of decomposition
- **Do not suppress metrics globally** — per-file or per-function suppression is acceptable when justified
- **Low blast radius first** — prefer targeted extractions over broad refactors

## Execution Control

`manual-handoff` — the orchestrator must stop and report to the operator after each group decision before continuing to the next group.

## Evidence Expectations

- `01 - Architecture Guard - Summary.md` — per-group findings
- `complexity-decision-register.md` — final decision table (FIX/REFACTOR/SKIP/SUPPRESS per issue)
- No implementation artifacts until the decision register is operator-approved

## Open Questions

1. **Group E / `redirectForMissingTenantContext` 10 parameters**: Is this a confirmed Lizard false positive? The actual function signature has 1 parameter. Needs code inspection at line 95+ of `with-auth.ts`.
2. **Group C / `isSyntheticFallbackEmail` cyclomatic 22**: Is the complexity from legitimate validation rules (valid email forms) or from accumulated edge cases that indicate undocumented behavior?
3. **Group H / layout DI calls**: Is the pattern of calling `getAppContainer()` directly inside layout components intentional and documented, or is it an accumulated pattern that should be revisited?
4. **Linter suppression policy**: Is there a project-level policy on per-file vs per-function Lizard suppression comments? If not, should one be established?
