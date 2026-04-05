# Implementation Plan: Bucket 1 + Bucket 2

**Task ID**: `2026-04-04-bucket1-bucket2-fixes`
**Status**: ✅ COMPLETED — all phases done, PR approved
**Last Updated**: 2026-04-04

---

## Execution Order

Lowest to highest blast radius. Each step must pass `pnpm lint --fix` and `pnpm typecheck` before the next begins.

```
Phase 1: Bucket 1 doc fixes (A + B + C + D)
Phase 2: Bucket 2a — RBAC roles drift (read code → comment/doc only)
Phase 3: Bucket 2b — Onboarding redirect form field
Phase 4: Bucket 2c — Feature flag injection
Phase 5: Validation sign-off
```

---

## Phase 1 — Bucket 1: Documentation Fixes

**No runtime changes. No typecheck needed. No specialist gate.**

### Fix A

- File: `docs/features/24 - Feature Flags.md`
- Find line containing `pnpm test:e2e` (approximately line 502)
- Replace: `pnpm test:e2e` → `pnpm e2e`
- Confirm no other occurrences of `pnpm test:e2e` in the same doc

### Fix B

- File: `docs/features/22 - RBAC Baseline.md`
- Find line containing `pnpm lint` used as the lint command (approximately line 83)
- Replace standalone `pnpm lint` → `pnpm lint --fix`
- Do not replace occurrences where `pnpm lint` is part of a different context (e.g., CI workflow description)

### Fix C

- File: `docs/features/02 - TypeScript ESLint Prettier Setup.md`
- Find line containing `pnpm lint` (approximately line 33)
- Replace standalone `pnpm lint` → `pnpm lint --fix`

### Fix D

- File: `docs/features/DEPLOY-neon.md`
- Find the comparison table entry near line 260 that says "not represented in the repo provider contract"
- Replace with: "represented as placeholder scope in provider contract"
- Confirm line 249 statement ("placeholder provider target") is consistent after the change

### Phase 1 Checklist

- [x] Fix A applied and verified (grep confirms no remaining `pnpm test:e2e` in that file)
- [x] Fix B applied and verified
- [x] Fix C applied and verified
- [x] Fix D applied and verified (lines 249 + 260 are now consistent)

---

## Phase 2 — Bucket 2a: RBAC Roles Drift

**Read code first. Do not change types. Comment/doc fix only unless evidence demands otherwise.**

### Step 2.1 — Code Read

- Read `src/core/contracts/roles.ts` fully
- Read `docs/features/22 - RBAC Baseline.md` section on canonical roles
- Determine: are `guest|user|admin` system-level roles and `owner|member` tenant-DB roles — two intentionally distinct sets?

### Step 2.2 — Decision Gate

- If two intentionally distinct sets: go to Step 2.3
- If one is stale/wrong: **STOP. Route to 01 Architecture Guard before any type change.**

### Step 2.3 — Add Reconciliation Comment to `roles.ts`

```typescript
/**
 * System-level application roles used for app-layer authorization.
 * These are distinct from tenant DB roles (owner | member) which are
 * stored in the tenant database and govern organization-scoped access.
 * See: docs/features/22 - RBAC Baseline.md for tenant role definitions.
 */
```

### Step 2.4 — Add Clarifying Note to RBAC Doc

- In `docs/features/22 - RBAC Baseline.md`, near the tenant roles section, add a note:
  > **Note**: `src/core/contracts/roles.ts` defines system-level application roles (`guest | user | admin`). These are separate from the tenant DB roles (`owner | member`) described here.

### Phase 2 Checklist

- [x] `roles.ts` read and intent confirmed
- [x] RBAC doc read and tenant role section located
- [x] Decision gate passed (two distinct sets confirmed — intentional)
- [x] Comment added to `roles.ts`
- [x] Clarifying note added to RBAC doc
- [x] `pnpm typecheck` passes

---

## Phase 3 — Bucket 2b: Onboarding Redirect Form Field

**Small isolated change. SEC-03 already applied in `actions.ts`. Do not move sanitisation.**

### Step 3.1 — Read Page Component

- Read `src/app/onboarding/page.tsx`
- Confirm it receives `searchParams` (App Router pattern: `{ searchParams }: { searchParams: Promise<Record<string, string>> }` or sync variant)
- Confirm `searchParams.redirect_url` is accessible

### Step 3.2 — Pass Prop to Form

- In `src/app/onboarding/page.tsx`, extract `redirect_url` from `searchParams`
- Pass it as a prop to `<OnboardingForm redirectUrl={...} />`
- Use `string | undefined` — do not sanitise here; sanitisation is the action's responsibility

### Step 3.3 — Update Form Component

- In `src/app/onboarding/onboarding-form.tsx`:
  - Add `redirectUrl?: string` to props
  - Inside `<form>`, add:
    ```tsx
    {
      redirectUrl && (
        <input type="hidden" name="redirect_url" value={redirectUrl} />
      );
    }
    ```

### Step 3.4 — Confirm Sanitisation in Action

- Read `src/app/onboarding/actions.ts` around line 112
- Confirm `sanitizeRedirectUrl()` is called before any redirect is issued
- Do not move or duplicate this call

### Step 3.5 — Unit Test

- In `src/app/onboarding/onboarding-form.test.tsx` (create if absent):
  - Render `<OnboardingForm redirectUrl="/dashboard" />` and assert hidden input is present with correct value
  - Render without `redirectUrl` and assert no hidden input is rendered

### Step 3.6 — Validate

- `pnpm lint --fix`
- `pnpm typecheck`
- `pnpm test` (confirm new test passes)

### Phase 3 Checklist

- [x] `page.tsx` searchParams pattern confirmed
- [x] `redirect_url` prop wired from page to form
- [x] Hidden field added to `onboarding-form.tsx`
- [x] `sanitizeRedirectUrl()` call in `actions.ts` confirmed (not moved)
- [x] Unit test for hidden field added (`onboarding-form.test.tsx` — 2 new tests)
- [x] `pnpm lint --fix` passes
- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes (16/16 in onboarding suite)

---

## Phase 4 — Bucket 2c: Feature Flag Injection into Request Scope

> **NOTE — Original plan superseded by Architecture Guard decision.**
>
> Steps 4.1–4.5 below assumed a bulk `getFlags(tenantId)` method on `FeatureFlagService`.
> Architecture Guard reviewed the live contract and all adapters and **rejected** that approach.
> See `01 - Architecture Guard - Summary.md` for the full decision record.
>
> **Actual deliverable**: JSDoc comment added to `featureFlags` field in `request-scoped-context.ts`.
> No logic change. No contract change. No adapter change. No test expansion required.

### Original Steps (SUPERSEDED — do not execute)

- ~~Step 4.1 — DI Container Verification~~
- ~~Step 4.2 — Implement in `with-auth.ts`~~
- ~~Step 4.3 — Apply Same Pattern in `secure-action.ts`~~
- ~~Step 4.4 — Graceful Degrade~~
- ~~Step 4.5 — Unit Tests~~

### Actual Deliverable

- Added clarifying JSDoc to `readonly featureFlags` in `src/security/core/request-scoped-context.ts`
- Documents: opt-in field, default `{}` is correct by design, point-of-use is the established pattern, ABAC conditions use `TenantAttributes.features`

### Phase 4 Checklist

- [x] Architecture Guard reviewed contract, adapters, and all consumers
- [x] Decision: point-of-use only — no bulk method, no auth-layer injection
- [x] JSDoc added to `featureFlags` field in `request-scoped-context.ts`
- [x] `pnpm typecheck` passes

---

## Phase 5 — Validation Sign-Off

- [x] All phase checklists show complete
- [x] No open typecheck errors
- [x] No open lint errors
- [x] All new unit tests green (890/890 pass; 16/16 in onboarding suite)
- [x] `05 - Validation Strategy - Summary.md` written
- [x] `04 - Implementation Agent - Summary.md` updated to COMPLETED
- [x] `plan.md` checklist updated to reflect all done
- [x] `validation-report.md` produced

---

## Constraints Summary

| Constraint                                                           | Source                               |
| -------------------------------------------------------------------- | ------------------------------------ |
| Do not change `roles.ts` types without Architecture Guard review     | Modular monolith contract discipline |
| Do not move `sanitizeRedirectUrl()` out of `actions.ts`              | SEC-03                               |
| Do not log raw error objects — extract `errorMessage`/`errorName`    | SEC-10                               |
| Degrade flag injection to `{}` on failure — do not block auth        | Bucket 2c requirement                |
| Resolve flags via DI container — do not import flag service directly | DI discipline                        |
| Do not populate `featureFlags` in client components                  | Server/client boundary               |
| Run `pnpm lint --fix`, never plain `pnpm lint`                       | AGENTS.md                            |
