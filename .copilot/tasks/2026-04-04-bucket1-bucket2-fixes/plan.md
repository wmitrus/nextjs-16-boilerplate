# Plan: Bucket 1 + Bucket 2 Fixes

**Task ID**: `2026-04-04-bucket1-bucket2-fixes`
**Created**: 2026-04-04
**Orchestrator**: Workflow Orchestrator (Agent 08)
**Source**: Gap analysis followup — `2026-04-04-gap-analysis-followup`

---

## Objective

Complete two categories of work identified by the gap analysis:

- **Bucket 1**: Four documentation-only fixes (zero runtime risk).
- **Bucket 2**: Three in-progress features with verified code foundations but specific wiring gaps.

Bucket 3 (planned, not started) is recorded as a deferred knowledge note at the bottom of this plan. No implementation work is triggered for it.

---

## Bucket 3 — Deferred Knowledge Note

> **Not part of this workflow. Recorded here for future reference only.**
>
> The following features exist only as prompt files and placeholder throw-stubs. No implementation work should begin without explicit provider/strategy decisions.
>
> | Feature                                   | Location                                          | Blocker                                           |
> | ----------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
> | Per-request caching                       | `docs/prompts/04 - Per-Request Caching Prompt.md` | Caching strategy decision required                |
> | Background workers                        | `docs/prompts/05 - Background Workers Prompt.md`  | Worker runtime + queue provider decision required |
> | AuthJS / Supabase / Neon identity sources | `src/modules/auth/infrastructure/` (throw stubs)  | Auth provider selection decision required         |
>
> These are intentional gates. Do not start without explicit user sign-off on the respective decisions.

---

## Specialist Sequence

| Step | Specialist               | Scope                                                          | Status       |
| ---- | ------------------------ | -------------------------------------------------------------- | ------------ |
| 1    | 04 - Implementation      | Bucket 1: four doc fixes (A/B/C/D)                             | ✅ COMPLETED |
| 2    | 04 - Implementation      | Bucket 2a: RBAC roles drift (code read + comment/doc fix)      | ✅ COMPLETED |
| 3    | 04 - Implementation      | Bucket 2b: Onboarding redirect form field                      | ✅ COMPLETED |
| 4    | 01 - Architecture Guard  | Bucket 2c: Feature flag injection — contract design decision   | ✅ COMPLETED |
| 5    | 04 - Implementation      | Bucket 2c: Add JSDoc to `featureFlags` field — no logic change | ✅ COMPLETED |
| 6    | 05 - Validation Strategy | Confirm validation scope before closing                        | ✅ COMPLETED |

> **Architecture Guard (01)** and **Security & Auth (02)** are not required for Bucket 1.
> For Bucket 2b and 2c, SEC-03 (redirect sanitisation) is already respected by `actions.ts`. No new auth surface is opened. No specialist gate required.
> If code inspection in Step 2 reveals an unexpected runtime contract change to `roles.ts`, pause and route to 01 Architecture Guard before proceeding.

---

## Affected Files

### Bucket 1 — Docs only

- `docs/features/24 - Feature Flags.md`
- `docs/features/22 - RBAC Baseline.md`
- `docs/features/02 - TypeScript ESLint Prettier Setup.md`
- `docs/features/DEPLOY-neon.md`

### Bucket 2 — Source code

- `src/core/contracts/roles.ts` (possibly comment-only)
- `docs/features/22 - RBAC Baseline.md` (reconciliation note, overlaps Bucket 1)
- `src/app/onboarding/onboarding-form.tsx`
- `src/app/onboarding/page.tsx` (read `searchParams`, pass prop)
- `src/security/middleware/with-auth.ts`
- `src/security/actions/secure-action.ts`
- `src/security/core/request-scoped-context.ts` (likely read-only)

---

## Execution Sequence (Low to High Blast Radius)

```
Step 1: Bucket 1 doc fixes (A/B/C/D)     — no runtime impact
Step 2: Bucket 2a RBAC drift fix          — code read first; comment/doc only unless code shows otherwise
Step 3: Bucket 2b onboarding redirect     — small isolated form change
Step 4: Bucket 2c flag injection          — deepest change; DI container verification required first
Step 5: Validation strategy sign-off
```

---

## Checklist

### Bucket 1 — Documentation Fixes

- [x] Fix A: `docs/features/24 - Feature Flags.md:502` — `pnpm test:e2e` → `pnpm e2e`
- [x] Fix B: `docs/features/22 - RBAC Baseline.md:83` — `pnpm lint` → `pnpm lint --fix`
- [x] Fix C: `docs/features/02 - TypeScript ESLint Prettier Setup.md:33` — `pnpm lint` → `pnpm lint --fix`
- [x] Fix D: `docs/features/DEPLOY-neon.md:260` — reconcile contradiction with line 249

### Bucket 2 — In-Progress Features

- [x] 2a: Read `src/core/contracts/roles.ts` and `docs/features/22 - RBAC Baseline.md` to determine intentional split vs drift
- [x] 2a: Add reconciliation comment to `roles.ts` and/or update doc — no runtime type change
- [x] 2b: Confirm `src/app/onboarding/page.tsx` receives `searchParams`
- [x] 2b: Pass `redirect_url` from page → `OnboardingForm` as prop
- [x] 2b: Add hidden field `<input type="hidden" name="redirect_url" value={...} />` to form
- [x] 2b: Verify `actions.ts` sanitises before use (SEC-03 — confirmed)
- [x] 2b: Add/update unit render test for hidden field
- [x] 2c: **Architecture Guard decision — RESOLVED** (see `01 - Architecture Guard - Summary.md`)
  - Decision: point-of-use is the correct pattern; `featureFlags` field is opt-in; no logic change needed
  - Rejected: `getAll()` contract method, known-flags registry, auth-layer auto-population
- [x] 2c: Add clarifying JSDoc to `featureFlags` field in `src/security/core/request-scoped-context.ts` (Implementation Agent)

### Validation Gate

- [x] `pnpm lint --fix` — passed (4 pre-existing warnings, 0 errors)
- [x] `pnpm typecheck` — passed
- [x] `pnpm test` (new form tests) — 2/2 passed
- [x] `pnpm typecheck` — Phase 4 JSDoc: ✅ passed
- [x] Validation Strategy sign-off recorded in `05 - Validation Strategy - Summary.md` — PR APPROVED

---

## Artifacts To Be Produced

- [x] `plan.md` (this file)
- [x] `intake.md`
- [x] `implementation-plan.md`
- [x] `04 - Implementation Agent - Summary.md`
- [x] `05 - Validation Strategy - Summary.md`
- [x] `validation-report.md`
