# Intake: Bucket 1 + Bucket 2 Fixes

**Task ID**: `2026-04-04-bucket1-bucket2-fixes`
**Source task**: `2026-04-04-gap-analysis-followup` (gap analysis + code-verified findings)
**Created**: 2026-04-04

---

## Objective

Execute all Bucket 1 (documentation-only) and Bucket 2 (in-progress feature wiring) fixes.
Do not begin Bucket 3 work. Record Bucket 3 as a deferred knowledge note only.

---

## Requirements

### Bucket 1 — Documentation Fixes

| ID  | File                                                     | Line | Current (wrong)                                 | Correct                                                                 |
| --- | -------------------------------------------------------- | ---- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| A   | `docs/features/24 - Feature Flags.md`                    | 502  | `pnpm test:e2e`                                 | `pnpm e2e`                                                              |
| B   | `docs/features/22 - RBAC Baseline.md`                    | 83   | `pnpm lint`                                     | `pnpm lint --fix`                                                       |
| C   | `docs/features/02 - TypeScript ESLint Prettier Setup.md` | 33   | `pnpm lint`                                     | `pnpm lint --fix`                                                       |
| D   | `docs/features/DEPLOY-neon.md`                           | 260  | "not represented in the repo provider contract" | Match line 249: "represented as placeholder scope in provider contract" |

### Bucket 2 — In-Progress Feature Wiring

**2a — RBAC Roles Drift**

- `src/core/contracts/roles.ts` declares system-level roles: `guest | user | admin`.
- `docs/features/22 - RBAC Baseline.md:5` states tenant roles are `owner | member`.
- These are two distinct role sets (system vs tenant-DB-backed), but neither file explains the split.
- Required: Add reconciliation comment to `roles.ts` and/or a clarifying note to the doc. No type changes unless code evidence shows the contract itself is wrong.

**2b — Onboarding Post-Redirect Preservation**

- `src/app/onboarding/actions.ts:112` reads `formData.get('redirect_url')` ✅
- `src/app/auth/bootstrap/start/route.ts` encodes `redirect_url` into the onboarding URL ✅
- `src/app/onboarding/onboarding-form.tsx` has NO hidden field for `redirect_url` ❌
- Required: Read `searchParams` in `page.tsx`, pass to form as prop, add hidden field in form.
- SEC-03: `actions.ts` already sanitises via `sanitizeRedirectUrl()` before redirect — confirm and preserve.

**2c — Feature Flag Injection into Request Scope**

- Contracts, factory, `DrizzleFeatureFlagService`, DB tests, `featureFlags` field on `RequestScopedContext` all exist ✅
- `src/security/middleware/with-auth.ts` does NOT populate `featureFlags` ❌
- `src/security/actions/secure-action.ts` does NOT populate `featureFlags` ❌
- Result: `requestContext.featureFlags` is always `{}` at runtime.
- Required: Resolve `IFeatureFlagService` from DI container in both call sites, call service, populate context. Degrade gracefully to `{}` on failure.

---

## Acceptance Criteria

### Bucket 1

- [x] All four doc fixes applied exactly as specified (no unrelated edits).

### Bucket 2a

- [x] `roles.ts` and/or the RBAC doc clearly explain the system-role vs tenant-DB-role distinction.
- [x] No runtime type changes to `roles.ts` unless code evidence requires it.

### Bucket 2b

- [x] `onboarding-form.tsx` renders `<input type="hidden" name="redirect_url">` when value is present.
- [x] `page.tsx` passes `searchParams.redirect_url` to form.
- [x] `sanitizeRedirectUrl()` is still the only sanitisation point (inside `actions.ts`).
- [x] Unit render test covers hidden field presence.

### Bucket 2c

> **NOTE — Original criteria superseded by Architecture Guard decision.**
> Bulk injection into `with-auth.ts` / `secure-action.ts` was REJECTED. Actual deliverable: JSDoc on `featureFlags` field.

- [x] ~~`with-auth.ts` populates `featureFlags` from DI-resolved service~~ — REJECTED by Architecture Guard; point-of-use pattern is correct
- [x] ~~`secure-action.ts` applies same pattern~~ — REJECTED; same reason
- [x] ~~Failure degrades to `{}`~~ — N/A; default `{}` is correct by design (no injection)
- [x] ~~Unit tests assert flags populated~~ — N/A; no logic change
- [x] JSDoc added to `featureFlags` field in `request-scoped-context.ts` documenting opt-in, point-of-use pattern

### Validation

- [x] `pnpm lint --fix` passes — 0 errors (4 pre-existing false-positive warnings)
- [x] `pnpm typecheck` passes — clean
- [x] `pnpm test` passes — 132 files, 890 tests

---

## Readiness Checklist

| Prerequisite                          | Status       |
| ------------------------------------- | ------------ |
| Gap analysis code-verified            | ✅           |
| Task workspace created                | ✅           |
| `plan.md` written                     | ✅           |
| `implementation-plan.md` written      | ✅           |
| Implementation agent ready to execute | ✅ COMPLETED |

---

## Deferred (Bucket 3)

See `plan.md` Bucket 3 knowledge note. Not in scope for this workflow.

---

## Residual Risks

| Risk                                                       | Severity | Mitigation                                                                                               |
| ---------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `roles.ts` type change required by code evidence           | Medium   | Pause and route to 01 Architecture Guard before any type change                                          |
| Feature flag service resolution in hot path adds latency   | Low      | Flag service is already DB-backed and called per-request in existing demo page; degrade to `{}` on error |
| Hidden redirect field opens open-redirect if not sanitised | Low      | `actions.ts` already sanitises — SEC-03 already applied                                                  |
