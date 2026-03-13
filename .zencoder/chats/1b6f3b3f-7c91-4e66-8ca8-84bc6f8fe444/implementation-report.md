# Implementation Report

**Agent**: Implementation Agent  
**Status**: IMPLEMENTED  
**Date**: 2026-03-13  
**Input**: constraints.md, validation-strategy.md

---

## 1. Objective

Fix the unstable Clerk sign-up and provisioning flow. Resolves root causes RC-1 through RC-5 as defined in `incident-intake.md`:

1. `org+provider` mode: user permanently stuck when `orgId` absent at sign-up
2. Hard redirect loop: `UsersLayout → /onboarding → /users → loop`
3. `resolveActiveTenantIdForProvisioning()` duplicated across bootstrap and onboarding action
4. `onboarding-actions.ts` structurally misplaced in `modules/auth/ui/`
5. `isBootstrapRoute` check positioned after `resolveIdentity()` in middleware

---

## 2. Affected Files / Modules

### Created

| File                                                     | Layer             | Touches                          |
| -------------------------------------------------------- | ----------------- | -------------------------------- |
| `src/app/auth/build-provisioning-input.ts`               | Delivery (`app/`) | —                                |
| `src/app/auth/build-provisioning-input.test.ts`          | Testing           | R1                               |
| `src/app/auth/bootstrap/bootstrap-org-required.tsx`      | Delivery (`app/`) | Client component, Clerk SDK      |
| `src/app/auth/bootstrap/bootstrap-org-required.test.tsx` | Testing           | R5                               |
| `src/app/onboarding/actions.ts`                          | Delivery (`app/`) | Provisioning module, Auth module |
| `src/app/onboarding/actions.test.ts`                     | Testing           | R4                               |

### Modified

| File                                        | Layer             | Change Type                           |
| ------------------------------------------- | ----------------- | ------------------------------------- |
| `src/app/auth/bootstrap/page.tsx`           | Delivery (`app/`) | Behavior change (new early-exit path) |
| `src/app/auth/bootstrap/page.test.tsx`      | Testing           | R2 — new org+provider test cases      |
| `src/app/users/layout.tsx`                  | Delivery (`app/`) | Behavior change (redirect target)     |
| `src/app/users/layout.test.tsx`             | Testing           | R3 — updated assertion                |
| `src/security/middleware/with-auth.ts`      | Security          | Reorder + new try/catch               |
| `src/security/middleware/with-auth.test.ts` | Testing           | R6 — new UserNotProvisionedError case |
| `src/app/onboarding/onboarding-form.tsx`    | Delivery (`app/`) | Import path update only               |

### Deleted

| File                                             | Reason                                        |
| ------------------------------------------------ | --------------------------------------------- |
| `src/modules/auth/ui/onboarding-actions.ts`      | Moved to `src/app/onboarding/actions.ts`      |
| `src/modules/auth/ui/onboarding-actions.test.ts` | Moved to `src/app/onboarding/actions.test.ts` |

---

## 3. Implementation Plan

Executed in this order to maintain a valid intermediate state at each step:

1. Extract `buildProvisioningInput()` utility → `src/app/auth/build-provisioning-input.ts`
2. Move `onboarding-actions.ts` → `src/app/onboarding/actions.ts`, update imports
3. Create `BootstrapOrgRequired` client component
4. Update `bootstrap/page.tsx`: add early-exit + use shared utility + fix public index imports
5. Fix `UsersLayout` redirect target
6. Reorder `with-auth.ts`: move `isBootstrapRoute` check before `resolveIdentity()`; add `UserNotProvisionedError` catch inside bootstrap branch
7. Add/update all required tests (R1–R6)
8. Run `pnpm lint --fix` to correct import ordering and formatting

---

## 4. Changes Made

### `src/app/auth/build-provisioning-input.ts` (new)

Extracts the duplicated `resolveActiveTenantIdForProvisioning()` logic into a single server-side utility. Reads tenant context from `headers()` / `cookies()` for `org+db` mode. Assembles the full `ProvisioningInput` from the caller-supplied `RequestIdentitySourceData` and env config.

- No memoization (stateless per request, per RC-8)
- Uses `@/modules/provisioning` public index (AC-4)
- Does not accept any client-supplied org/tenant ID (SC-4)

### `src/app/auth/bootstrap/bootstrap-org-required.tsx` (new)

`'use client'` component rendering `<OrganizationSwitcher hidePersonal createOrganizationMode="modal" afterSelectOrganizationUrl="/auth/bootstrap" afterCreateOrganizationUrl="/auth/bootstrap" />`. Does not import server-only modules (AC-6). Returns `data-testid="bootstrap-org-required"` for test identification.

### `src/app/auth/bootstrap/page.tsx` (modified)

Added early-exit check before `ensureProvisioned`:

```typescript
if (
  env.TENANCY_MODE === 'org' &&
  env.TENANT_CONTEXT_SOURCE === 'provider' &&
  !rawIdentity.tenantExternalId
) {
  return <BootstrapOrgRequired />;
}
```

Replaced local `resolveActiveTenantIdForProvisioning()` call + inline provisioning input assembly with `buildProvisioningInput(rawIdentity)`. Fixed imports to use `@/modules/provisioning` public index.

### `src/app/onboarding/actions.ts` (moved from `src/modules/auth/ui/onboarding-actions.ts`)

Pure file relocation. Updated import: `../auth/build-provisioning-input` instead of local duplicate function. Updated provisioning error imports to `@/modules/provisioning` public index. No logic changes.

### `src/app/users/layout.tsx` (modified)

`TENANT_CONTEXT_REQUIRED` redirect target changed:

```typescript
// Before:
redirect('/onboarding?reason=tenant-context-required');
// After:
redirect('/auth/bootstrap?reason=tenant-lost');
```

Breaks the documented redirect loop (RT-2 / RC-6).

### `src/security/middleware/with-auth.ts` (modified)

1. Moved `isBootstrapRoute`/`isOnboardingRoute` early-exit check BEFORE the main `resolveIdentity()` call (RC-5).
2. Inside the bootstrap branch, wrapped `resolveIdentity()` in try/catch for `UserNotProvisionedError` — passes through to handler instead of propagating. This protects Node mode new users where the DB-backed identity provider would throw before provisioning.
3. Added `import { UserNotProvisionedError } from '@/core/contracts/identity'`.

---

## 5. Validation / Verification

All required validations from `validation-strategy.md` pass:

| Requirement | File                               | Result                               |
| ----------- | ---------------------------------- | ------------------------------------ |
| R1          | `build-provisioning-input.test.ts` | ✅ 6/6 pass                          |
| R2          | `bootstrap/page.test.tsx`          | ✅ 10/10 pass (8 original + 2 new)   |
| R3          | `users/layout.test.tsx`            | ✅ 5/5 pass (updated assertion)      |
| R4          | `onboarding/actions.test.ts`       | ✅ 3/3 pass (moved + import updated) |
| R5          | `bootstrap-org-required.test.tsx`  | ✅ 3/3 pass                          |
| R6          | `with-auth.test.ts`                | ✅ 24/24 pass (23 original + 1 new)  |

Full suite: **115 test files, 707 tests — all pass**.

`pnpm typecheck`: ✅ zero errors  
`pnpm lint`: ✅ zero errors (import ordering and formatting fixed via `eslint --fix`)  
`pnpm arch:lint`: ⚠️ pre-existing failure — `core must not import app/features/security/modules outside composition root` (violations in `src/core/db/seed.ts` and `src/core/runtime/edge.ts`). **This violation existed before this fix and is not introduced by the current changes.** Both `skott` and `madge` checks within `arch:lint` pass; only the custom grep-based check flags the pre-existing violations.

---

## 6. Risks / Follow-ups

### Residual risks (not introduced by this fix)

**RC-2 / `single` mode: `DEFAULT_TENANT_ID` unseeded** — Not fixed here (out of scope per constraints). If `DEFAULT_TENANT_ID` is not set or does not correspond to a seeded DB record, provisioning will fail with `TenantNotProvisionedError`. The bootstrap page renders `BootstrapErrorUI error="tenant_config"` in that case. This is a deployment/seed issue, not a code bug.

**RC-3 / `org+db` mode: no self-service path** — Not fixed here (out of scope). New users in `org+db` mode with no cookie or header still land on `BootstrapErrorUI error="tenant_config"`. Requires a separate admin-managed provisioning path or invitation flow.

**Pre-existing `arch:lint` failure** — `src/core/db/seed.ts` and `src/core/runtime/edge.ts` import from `@/modules/`. These are composition-root-style intentional exceptions but are not annotated as such and trigger the grep-based check. Requires a separate Architecture Guard review and either a lint exemption annotation or architectural documentation update.

### Constraints preserved

All invariants from `constraints.md` are preserved:

- `ProvisioningInput` shape: unchanged
- `DrizzleProvisioningService`: unchanged
- `evaluateNodeProvisioningAccess`: unchanged
- `proxy.ts`: unchanged (stays Edge)
- Tenant authority always server-side
- `ClerkUserRepository` not registered
- No client-submitted org/tenant ID accepted
- `CrossProviderLinkingNotAllowedError` catch block preserved in both callers
