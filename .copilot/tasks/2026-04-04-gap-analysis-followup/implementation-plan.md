# Implementation Plan: Started-But-Not-Finished Items

**Task ID**: `2026-04-04-gap-analysis-followup`
**Scope**: Three in-progress items + three almost-done documentation fixes
**Status**: ✅ COMPLETED — all items executed via `2026-04-04-bucket1-bucket2-fixes`

---

## Item 1 — Feature Flag Injection into Request Scope

### What exists

- `src/modules/feature-flags/` — contracts, factory, `DrizzleFeatureFlagService`, DB tests ✅
- `src/security/core/request-scoped-context.ts` — `featureFlags` field declared ✅
- `src/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagService.ts` — tenant-aware lookup ✅

### What is missing

- `src/security/middleware/with-auth.ts` does **not** call the feature flag service and does not populate `featureFlags` on the request-scoped context.
- `src/security/actions/secure-action.ts` — same gap: `featureFlags` is never populated.
- Result: `requestContext.featureFlags` is always `{}` at runtime regardless of DB state.

### Implementation steps

> **NOTE — Superseded by Architecture Guard decision in `2026-04-04-bucket1-bucket2-fixes`.**
> Steps 1.1–1.6 assumed a bulk `getFeatureFlags(tenantId)` method. Architecture Guard rejected this.
> Actual outcome: JSDoc added to `featureFlags` field documenting opt-in, point-of-use pattern.

- [x] **Step 1.1** — DI container reviewed; `FeatureFlagService` contract has only `isEnabled()` — no bulk method
- ~~Step 1.2~~ — REJECTED by Architecture Guard (no bulk method to call)
- ~~Step 1.3~~ — REJECTED (default `{}` is correct by design)
- ~~Step 1.4~~ — REJECTED (same reason)
- ~~Step 1.5~~ — Not required (no logic change)
- [x] **Step 1.6** — `pnpm typecheck` passes after JSDoc addition

### Constraints

- Must not bypass DI container — resolve via `requestContainer.resolve(IFeatureFlagServiceToken)`.
- Must not call the flag service in client components.
- Must not leak tenant A flags into tenant B context.
- Failure to resolve flags must not block authentication — degrade gracefully to `{}`.

### Validation

- Unit: mock `IFeatureFlagService` and assert flags propagate.
- Integration: existing `DrizzleFeatureFlagService.db.test.ts` already covers tenant isolation at DB level — no new DB test needed unless injection path adds new logic.

---

## Item 2 — Onboarding Post-Redirect Preservation

### What exists

- `src/app/onboarding/actions.ts` line 112: reads `formData.get('redirect_url')` ✅
- `src/app/onboarding/actions.test.ts` line 168-171: test covers the happy path for custom redirect ✅
- `src/app/auth/bootstrap/start/route.ts`: correctly passes `redirect_url` to the onboarding page URL ✅

### What is missing

- `src/app/onboarding/onboarding-form.tsx` — no `<input type="hidden" name="redirect_url" value={...} />` field.
- The form never submits `redirect_url`, so `actions.ts` always gets `null` and falls back to the default destination.
- The page-level props that would receive `redirect_url` from the URL's search params are not wired to the form.

### Implementation steps

- [x] **Step 2.1** — Confirmed `page.tsx` receives `searchParams: Promise<{ redirect_url?: string }>`
- [x] **Step 2.2** — `redirect_url` passed as `redirectUrl` prop to `<OnboardingForm>`
- [x] **Step 2.3** — Hidden field added conditionally (`{redirectUrl && <input ... />}`)
- [x] **Step 2.4** — `sanitizeRedirectUrl()` confirmed in `actions.ts` — not moved
- [x] **Step 2.5** — 2 unit tests added in `onboarding-form.test.tsx` (field present / absent)
- [x] **Step 2.6** — `pnpm lint --fix` and `pnpm typecheck` pass

### Constraints (SEC-03)

- `sanitizeRedirectUrl()` must be applied before any redirect is issued — this is already done in `actions.ts`; embedding the raw value in a hidden field is acceptable because the action sanitises on read.
- Do not expose `redirect_url` in visible UI or log it.

### Validation

- Unit: render test asserting hidden field presence.
- Integration: existing `actions.test.ts` test at line 168 should pass end-to-end once the form submits the field.

---

## Item 3 — RBAC Roles Doc/Code/Comment Drift

### What exists

- `src/core/contracts/roles.ts` declares: `guest`, `user`, `admin` and states it is the single source of truth.
- Runtime authorization uses tenant DB roles (separate concept).
- `docs/features/22 - RBAC Baseline.md` line 5 says canonical tenant roles are `owner` and `member`.

### What is missing / drifted

- The doc and the contract file describe two different role sets without explaining the intentional split.
- No reconciliation comment exists explaining that `roles.ts` covers system/app-level roles while tenant roles are a distinct DB-backed concept.

### Implementation steps

- [x] **Step 3.1** — Confirmed `roles.ts` is system-level (`guest|user|admin`) — not tenant DB roles
- [x] **Step 3.2** — Confirmed RBAC doc describes DB-backed tenant roles (`owner|member`) — intentionally distinct
- [x] **Step 3.3** — Reconciliation JSDoc added to `roles.ts`; blockquote note added to RBAC doc section 1
- [x] **Step 3.4** — N/A (both sides were correct; false comment removed)
- [x] **Step 3.5** — `pnpm lint --fix` passes; `pnpm typecheck` clean

### Constraints

- No role rename or removal in runtime code — documentation fix only unless code evidence shows the contract is wrong.
- Any change to `roles.ts` type exports is a breaking contract change — do not make it without explicit sign-off.

### Validation

- Typecheck only (`pnpm typecheck`). No runtime test required for comment/doc-only changes.

---

## Almost-Done Documentation Fixes

These are low-risk, no-runtime-impact fixes. Group into a single implementation pass.

### Fix A — Wrong E2E command in Feature Flags doc

- **File**: `docs/features/24 - Feature Flags.md` line 502
- **Current**: `pnpm test:e2e`
- **Correct**: `pnpm e2e`
- [x] Replace `pnpm test:e2e` with `pnpm e2e` ✅

### Fix B — Wrong lint command in RBAC doc

- **File**: `docs/features/22 - RBAC Baseline.md` line 83
- **Current**: `pnpm lint`
- **Correct**: `pnpm lint --fix`
- [x] Replace with `pnpm lint --fix` ✅

### Fix C — Wrong lint command in TypeScript/ESLint/Prettier setup doc

- **File**: `docs/features/02 - TypeScript ESLint Prettier Setup.md` line 33
- **Current**: `pnpm lint`
- **Correct**: `pnpm lint --fix`
- [x] Replace with `pnpm lint --fix` ✅

### Fix D — Neon doc internal contradiction

- **File**: `docs/features/DEPLOY-neon.md` lines 249 and 260
- **Issue**: Line 249 says "placeholder provider target" (accurate); line 260's comparison table says "not represented in the repo provider contract" (stale — Neon is now a placeholder scope in the provider contract).
- [x] Updated line 260 to match line 249 ✅

---

## Execution Sequence

```
Fix A + B + C + D  (docs only — zero runtime risk, do first)
     ↓
Item 3 (RBAC roles drift — comment/doc fix, read code first)
     ↓
Item 2 (Onboarding redirect — small surface, isolated form change)
     ↓
Item 1 (Feature flag injection — deepest change, needs DI container verify first)
```

---

## Validation Mapping

| Item          | Required Validation                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Fixes A/B/C/D | None (doc-only)                                                                                  |
| Item 3        | `pnpm typecheck`                                                                                 |
| Item 2        | `pnpm lint --fix`, `pnpm typecheck`, unit render test                                            |
| Item 1        | `pnpm lint --fix`, `pnpm typecheck`, unit tests in `with-auth.test.ts` + `secure-action.test.ts` |
