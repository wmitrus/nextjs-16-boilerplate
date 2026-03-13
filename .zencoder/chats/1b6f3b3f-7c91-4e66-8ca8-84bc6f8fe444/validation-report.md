# Validation Report

**Agent**: Validation Strategy Agent  
**Mode**: Change Validation  
**Date**: 2026-03-13  
**Input**: validation-strategy.md, implementation-report.md

---

## 1. Objective

Execute and document the validation plan from `validation-strategy.md`. Confirm whether the incident fix is validated, whether the issue is fully resolved or only mitigated, and identify residual risks.

---

## 2. Commands / Checks Executed

```
pnpm test           → full test suite (Vitest unit + integration)
pnpm typecheck      → TypeScript strict check (tsc --noEmit)
pnpm lint           → ESLint (including prettier/prettier, importX/order)
pnpm arch:lint      → architecture lint (skott, madge, custom grep)
```

---

## 3. Validation Evidence

### R1 — `build-provisioning-input.test.ts` (new — 6 tests)

**Status**: ✅ PASS

Covers all 4 tenancy modes and both `org+db` sub-modes:

- `single` → returns `DEFAULT_TENANT_ID`
- `personal` → returns `undefined`
- `org+provider` → returns `undefined`
- `org+db` + header present → returns header value
- `org+db` + no header, cookie present → returns cookie value
- `org+db` + neither → returns `undefined`

---

### R2 — `bootstrap/page.test.tsx` (2 new cases, 8 original)

**Status**: ✅ PASS — 10/10

New cases added:

- `org+provider` + `tenantExternalId=undefined` → renders `<BootstrapOrgRequired>`, `ensureProvisioned` NOT called
- `org+provider` + `tenantExternalId='org_abc'` → proceeds to `ensureProvisioned`, redirects to `/onboarding`

All 8 original cases (single-mode provisioning, error variants, redirect sanitization) continue to pass.

---

### R3 — `users/layout.test.tsx` (1 assertion updated)

**Status**: ✅ PASS — 5/5

Updated test:

- Before: `"redirects tenant-context-required user to onboarding reason route"` → `REDIRECT:/onboarding?reason=tenant-context-required`
- After: `"redirects tenant-context-required user to bootstrap recovery route"` → `REDIRECT:/auth/bootstrap?reason=tenant-lost`

All 4 other cases unchanged and passing.

---

### R4 — `onboarding/actions.test.ts` (moved, import updated)

**Status**: ✅ PASS — 3/3

File moved from `src/modules/auth/ui/onboarding-actions.test.ts` to `src/app/onboarding/actions.test.ts`. Import updated from `./onboarding-actions` → `./actions`. All 3 original assertions pass unchanged.

Note: `onboarding/actions.ts` delegates tenant context resolution to `buildProvisioningInput()`. The existing `env` mock in the test file continues to function because `setTenancyProfile` in `@/testing` applies env overrides globally via `vi.mock('@/core/env')`, which propagates through the utility. No adjustments needed.

---

### R5 — `bootstrap-org-required.test.tsx` (new — 3 tests)

**Status**: ✅ PASS

Covers:

- Renders without crashing (smoke test with mocked Clerk `OrganizationSwitcher`)
- `afterSelectOrganizationUrl="/auth/bootstrap"` prop verified
- `hidePersonal=true` and `createOrganizationMode="modal"` props verified

---

### R6 — `with-auth.test.ts` (1 new case, 23 original)

**Status**: ✅ PASS — 24/24

New case added:

- `"should pass through bootstrap route when identity provider throws UserNotProvisionedError (Node mode new user)"` — verifies that `UserNotProvisionedError` thrown from inside the bootstrap branch is caught and request passes through to handler (not a 500, not a redirect)

**Reorder decision documented**: `isBootstrapRoute` check was moved before the main `resolveIdentity()`. However, inside the bootstrap branch, `resolveIdentity()` IS still called to check authentication presence. This preserves the sign-in redirect for unauthenticated users hitting bootstrap. The `UserNotProvisionedError` case is therefore still reachable for Node mode new users — the conditional R6 case was required and was added.

Existing bootstrap pass-through and sign-in redirect cases continue to pass.

---

### `pnpm typecheck`

**Status**: ✅ PASS — zero errors

---

### `pnpm lint`

**Status**: ✅ PASS — zero errors

8 errors were auto-fixed via `eslint --fix`:

- Import ordering in `page.tsx` (3 errors): `@/modules/provisioning` placed after relative imports per linter convention
- Import ordering in `build-provisioning-input.test.ts` (2 errors): local import and type import before `@/testing`
- Prettier formatting in `page.test.tsx` (1 error): `BootstrapOrgRequired` mock on single line
- Prettier formatting in `page.tsx` (1 error): long `ensureProvisioned` call line
- Prettier formatting in `build-provisioning-input.test.ts` (1 error): ternary expression formatting

---

### `pnpm arch:lint`

**Status**: ⚠️ PRE-EXISTING FAILURE — not introduced by this fix

```
FAIL: core must not import app/features/security/modules outside composition root
src/core/db/seed.ts:6:} from '@/modules/authorization/infrastructure/drizzle/seed';
src/core/db/seed.ts:10:} from '@/modules/billing/infrastructure/drizzle/seed';
src/core/db/seed.ts:14:} from '@/modules/user/infrastructure/drizzle/seed';
src/core/runtime/edge.ts:3:import type { EdgeAuthModuleConfig } from '@/modules/auth/edge';
src/core/runtime/edge.ts:4:import { createEdgeAuthModule } from '@/modules/auth/edge';
```

The `skott` (circular dependency) and `madge` (dependency graph) checks within `arch:lint` both pass. Only the custom grep-based layer check flags these pre-existing violations. No file touched by this fix imports from `@/modules` in a way that violates layer rules.

---

## 4. Full Suite Results

```
Test Files  115 passed (115)
     Tests  707 passed (707)
```

---

## 5. Incident Path Validation

### Was the incident path tested?

| Root Cause                                                 | Test Evidence                                                             | Status    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| RC-1: `org+provider` stuck with no orgId                   | R2 new case: renders interstitial, no `ensureProvisioned` call            | ✅ Tested |
| RC-4: Redirect loop `UsersLayout → /onboarding → /users`   | R3: redirect now goes to `/auth/bootstrap?reason=tenant-lost`             | ✅ Tested |
| RC-5: `resolveActiveTenantIdForProvisioning` duplicated    | R1: `buildProvisioningInput` tested across all modes; both callers use it | ✅ Tested |
| RC-6: `onboarding-actions.ts` misplaced in module UI layer | R4: tests pass at new `app/onboarding/actions.ts` location                | ✅ Tested |
| RT-3: `isBootstrapRoute` check after `resolveIdentity()`   | R6: `UserNotProvisionedError` case validated                              | ✅ Tested |

---

## 6. Is the Issue Fully Fixed or Only Mitigated?

### Fully fixed

- **RC-1** (`org+provider` stuck): Bootstrap page now renders `<BootstrapOrgRequired>` interstitial when `tenantExternalId` is absent. User can select/create org via Clerk UI, then re-navigates to `/auth/bootstrap` which re-runs provisioning with the now-present `orgId`.
- **RC-4** (redirect loop): `UsersLayout` now redirects `TENANT_CONTEXT_REQUIRED` to `/auth/bootstrap?reason=tenant-lost`, not `/onboarding`. Loop is broken.
- **RC-5** (duplicate function): Single shared `buildProvisioningInput()` utility; both callers use it. Divergence risk eliminated.
- **AC-2** (structural misplacement): `onboarding-actions.ts` now at `src/app/onboarding/actions.ts`.
- **RT-3** (middleware ordering): `isBootstrapRoute` check now precedes `resolveIdentity()`.

### Mitigated (not fully resolved — out of scope per constraints)

- **RC-2** (`single` mode, `DEFAULT_TENANT_ID` unseeded): Not a code fix — requires deployment/seed discipline. Bootstrap renders `BootstrapErrorUI error="tenant_config"`.
- **RC-3** (`org+db` mode, no self-service path): Architecturally by-design for now. Requires a separate invitation/admin provisioning flow.

---

## 7. Residual Risks

1. **Pre-existing `arch:lint` failure** — requires Architecture Guard review; not introduced by this fix.
2. **RC-2 unseeded `DEFAULT_TENANT_ID`** — operational risk, not a code bug. Should be addressed with startup validation (OQ-1 deferred).
3. **RC-3 `org+db` no self-service** — product gap requiring a separate feature (invitation flow or admin provisioning).
4. **E2E coverage**: No Playwright E2E tests cover the sign-up flow end-to-end. Justified by the validation strategy — the fix is unit-testable and E2E is high-cost for an auth flow requiring real Clerk sessions. Acceptable residual gap for now.

---

## 8. Validation Readiness Status

**VALIDATION PLAN IS SUFFICIENT**

All minimum required validations (R1–R6) pass. Typecheck and lint are clean. Full test suite passes. The incident path is covered at the unit level with appropriate mocking. Residual risks are explicitly named and scoped to known out-of-scope items.
