# Validation Strategy — Clerk Sign-Up & Provisioning Flow Fix

**Agent**: Validation Strategy Agent  
**Mode**: Change Validation  
**Input**: constraints.md  
**Date**: 2026-03-13

---

## 1. Objective

Determine the minimum sensible validation scope for the incident fix described in `constraints.md`. Specify which existing tests break, which new tests are required, which are optional, and which are not justified. Produce a checklist the Implementation Agent can execute without ambiguity.

---

## 2. Mode

**Change Validation** — assessing validation scope for a specific, bounded fix across 5 changed files/paths and 2 new files.

---

## 3. Current-State Findings

### 3.1 Existing Test Coverage for Affected Files

| File                                                | Test file                    | Exists? | Quality                                                                                |
| --------------------------------------------------- | ---------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `src/app/auth/bootstrap/page.tsx`                   | `page.test.tsx`              | ✓       | Good — 8 cases, covers redirects, errors, redirect URL sanitization                    |
| `src/modules/auth/ui/onboarding-actions.ts`         | `onboarding-actions.test.ts` | ✓       | Good — 3 cases covering happy path, tenant error, invariant violation                  |
| `src/app/users/layout.tsx`                          | `layout.test.tsx`            | ✓       | Good — 5 cases covering all access statuses including `TENANT_CONTEXT_REQUIRED`        |
| `src/security/middleware/with-auth.ts`              | `with-auth.test.ts`          | ✓       | Comprehensive — bootstrap route pass-through and unauthenticated redirect both covered |
| `src/app/onboarding/layout.tsx`                     | `layout.test.tsx`            | ✓       | Good — 5 cases covering all guard states                                               |
| `src/app/auth/build-provisioning-input.ts`          | _(new file)_                 | ✗       | No tests — must be created                                                             |
| New interstitial component (bootstrap-org-required) | _(new file)_                 | ✗       | No tests — must be created                                                             |

### 3.2 Directly Broken Tests (Will Fail Post-Implementation Without Updates)

**Test 1** — `src/app/users/layout.test.tsx`:

```
"redirects tenant-context-required user to onboarding reason route"
```

Current assertion: `REDIRECT:/onboarding?reason=tenant-context-required`  
After fix: redirect target changes to `/auth/bootstrap?reason=tenant-lost`  
**This test will fail.** It must be updated to the new target.

**Test 2** — `src/security/middleware/with-auth.test.ts`:

```
"should redirect authenticated user to onboarding when tenant context is missing"
```

Current assertion: redirect to `/onboarding?reason=tenant-context-required`  
**Assessment**: This test covers private routes (non-bootstrap), not the bootstrap route. The `TENANT_CONTEXT_REQUIRED` redirect in `with-auth.ts` applies to post-auth resource routes — the `UsersLayout` change is what actually routes `TENANT_CONTEXT_REQUIRED` to `/auth/bootstrap`. The `with-auth.ts` source itself may also have `TENANT_CONTEXT_REQUIRED_REDIRECT = '/onboarding'` hardcoded. **Inspect and update if the constant or the redirect inside `withAuth` is being changed.**

> If the fix to `UsersLayout` is the only change to the redirect target (and `with-auth.ts` internal constant is NOT changed), this test passes unchanged. If `with-auth.ts` itself is modified to change the redirect constant, this test also breaks. The Implementation Agent must check this.

### 3.3 Tests Requiring Import Path Updates (Move)

`src/modules/auth/ui/onboarding-actions.test.ts` must be moved to `src/app/onboarding/actions.test.ts` alongside the source file. The import line:

```typescript
import { completeOnboarding } from './onboarding-actions';
```

becomes:

```typescript
import { completeOnboarding } from './actions';
```

No assertion changes required — pure move. All 3 existing test cases should pass at the new location.

Additionally, after extracting `buildProvisioningInput()`, the `onboarding-actions.test.ts` currently mocks `env` to control `TENANCY_MODE`. If the extraction means the new test file no longer reads `env` directly (it goes through `buildProvisioningInput()`), the mock may need adjustment. Inspect after extraction.

### 3.4 Tests with No Changes Required

- `src/app/auth/bootstrap/page.test.tsx` — existing cases remain valid; new cases must be added
- `src/app/onboarding/layout.test.tsx` — not changed; all 5 cases remain valid
- `src/security/middleware/with-auth.test.ts` — bootstrap pass-through and unauthenticated redirect cases remain valid after reorder (see R6)

---

## 4. Validation-Risk Assessment

### Risk Classification: **MAJOR**

The fix touches 5 security/auth-sensitive surfaces: the provisioning bootstrap page, the onboarding server action, the provisioning input assembly utility, the users layout guard, and the middleware ordering. All are on the critical sign-up path.

**Specific risks if under-validated:**

| Risk                                                     | If missed                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `org+provider` interstitial renders when it should not   | Breaks functioning modes (`single`, `personal`) by incorrectly showing interstitial             |
| `UsersLayout` redirect target changed incorrectly        | Redirect loop is not fixed, or a new one is introduced                                          |
| `buildProvisioningInput()` incorrect for a tenancy mode  | Wrong tenant ID passed to provisioning — silent provisioning failure or wrong tenant assignment |
| Moved `onboarding-actions.ts` import broken              | Onboarding form fails to submit silently                                                        |
| `withAuth` reorder breaks bootstrap authentication check | New users cannot reach bootstrap even when authenticated                                        |

**Risk of over-validation:** Low — the fix is bounded. E2E tests are not required. Integration tests are not required. Unit tests at each changed file are sufficient.

---

## 5. Recommended Validation Scope

### Minimum Required Validation

---

#### R1 — New: `buildProvisioningInput()` unit tests

**File**: `src/app/auth/build-provisioning-input.test.ts`

Must cover all 4 tenancy modes and the `org` sub-modes. The function is env-driven — mock `env` per case. Mock `headers()` and `cookies()` from `next/headers`.

Required cases:

```
✓ TENANCY_MODE=single → returns env.DEFAULT_TENANT_ID
✓ TENANCY_MODE=personal → returns undefined
✓ TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=provider → returns undefined
✓ TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=db + header present → returns header value
✓ TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=db + no header, cookie present → returns cookie value
✓ TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=db + neither header nor cookie → returns undefined
```

Mocking approach — same pattern as existing tests:

```typescript
vi.mock('next/headers', () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));
vi.mock('@/core/env', async (importOriginal) => { ... });
```

---

#### R2 — Update: `bootstrap/page.test.tsx` — add org+provider interstitial cases

**File**: `src/app/auth/bootstrap/page.test.tsx`

Must add cases for the new `org+provider` early-exit path. Existing single-mode cases must continue to pass.

Required new cases:

```
✓ TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=provider + tenantExternalId=undefined
     → renders org-required interstitial (NOT BootstrapErrorUI, NOT ensureProvisioned call)
     → provisioningService.ensureProvisioned must NOT be called

✓ TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=provider + tenantExternalId='org_abc'
     → proceeds to ensureProvisioned (existing flow, not intercepted)
     → provisioningService.ensureProvisioned called once
```

These cases require the `env` mock to use `TENANCY_MODE: 'org'` and `TENANT_CONTEXT_SOURCE: 'provider'`. The existing `env` mock sets `TENANCY_MODE: 'single'` — these cases need overrides or a second `describe` block.

Also verify the existing `TenantContextRequiredError` test still makes sense. If after the fix the `org+provider` no-orgId path is intercepted before `ensureProvisioned`, that specific error can no longer be thrown from `ensureProvisioned` for `org+provider`. The existing `tenant_config` error test may need to be moved to cover `single` mode's unconfigured tenant or `org+db` no-cookie case. Inspect and update as appropriate.

---

#### R3 — Update: `users/layout.test.tsx` — fix broken assertion

**File**: `src/app/users/layout.test.tsx`

The failing test must be updated:

```typescript
// Before (broken):
it('redirects tenant-context-required user to onboarding reason route', async () => {
  ...
  await expect(UsersLayout(...)).rejects.toThrow(
    'REDIRECT:/onboarding?reason=tenant-context-required',
  );
});

// After (correct):
it('redirects tenant-context-required user to bootstrap recovery route', async () => {
  ...
  await expect(UsersLayout(...)).rejects.toThrow(
    'REDIRECT:/auth/bootstrap?reason=tenant-lost',
  );
});
```

All other tests in this file pass unchanged.

---

#### R4 — Move and update: `onboarding-actions.test.ts`

**Old**: `src/modules/auth/ui/onboarding-actions.test.ts`  
**New**: `src/app/onboarding/actions.test.ts`

Changes required:

1. Move the file
2. Update the import: `from './onboarding-actions'` → `from './actions'`
3. If `buildProvisioningInput()` extraction causes `env` mock to be unused in the moved file, adjust (the utility is now responsible for reading `env` for tenant ID resolution — mock the utility instead of env, or verify existing env mock still takes effect)

All 3 existing assertions must pass without changes to their logic.

---

#### R5 — New: interstitial component unit test

**File**: `src/app/auth/bootstrap/bootstrap-org-required.test.tsx` (or wherever the interstitial component lands)

The interstitial is a client component. Test with `@testing-library/react` in jsdom environment (Vitest `environment: 'jsdom'` — already configured in `vitest.unit.config.ts`).

Required cases:

```
✓ Renders without crashing (smoke test — Clerk OrganizationSwitcher is mocked)
✓ OrganizationSwitcher receives afterSelectOrganizationUrl="/auth/bootstrap"
✓ OrganizationSwitcher receives hidePersonal and createOrganizationMode="modal"
```

Mocking approach:

```typescript
vi.mock('@clerk/nextjs', () => ({
  OrganizationSwitcher: ({ afterSelectOrganizationUrl, hidePersonal, createOrganizationMode }) => (
    <div
      data-testid="org-switcher"
      data-redirect-url={afterSelectOrganizationUrl}
      data-hide-personal={String(hidePersonal)}
      data-create-mode={createOrganizationMode}
    />
  ),
}));
```

Note: verifying `window.location.replace` behavior for the post-selection callback is possible with `vi.spyOn(window.location, 'replace')` but requires a non-mocked `OrganizationSwitcher`. Since the SDK is mocked, validate props passed to it — the Clerk SDK owns the callback execution.

---

#### R6 — Required: `with-auth.test.ts` — full suite run + conditional new case

**File**: `src/security/middleware/with-auth.test.ts`

**Always required**: run the full test file. The reorder must not break existing observable behavior. Verify these pass:

```
✓ "should pass through bootstrap route with valid session and no internal user lookup"
✓ "should redirect bootstrap route to sign-in when no session exists"
```

**Conditionally required**: if the reorder introduces a new code path where `UserNotProvisionedError` can propagate out of the bootstrap branch (i.e., `resolveIdentity()` is still called inside the bootstrap branch and can throw for unprovisioned users), add one new case:

```
✓ TENANCY_MODE=org+provider, bootstrap route, resolveIdentity throws UserNotProvisionedError
     → user passes through to bootstrap RSC (not 500, not sign-in redirect)
```

This is required if — and only if — the reorder does not eliminate that code path. The Implementation Agent must make this determination after the reorder is done and must document the decision in the implementation report.

**Also**: Inspect `with-auth.ts` for any hardcoded `/onboarding` redirect for tenant context. If found and changed, update the existing test `'should redirect authenticated user to onboarding when tenant context is missing'` to the new target.

---

### Optional Additional Validation

---

#### O1 — `withAuth` reorder: explicit call-order spy assertion

If the Implementation Agent wants to guard against future regressions of the reorder, add a test that spies on `identityProvider.getCurrentIdentity` and verifies it is NOT called when `isBootstrapRoute=true` and a `UserNotProvisionedError` is expected. Optional — only add if the reorder creates a meaningful behavioral difference that existing tests do not already cover.

#### O2 — `buildProvisioningInput()` used by both callers (contract spy)

After extracting the utility, add an assertion in both `bootstrap/page.test.tsx` and `onboarding/actions.test.ts` that confirms the utility is called (via spy) — rather than testing `env` reads inline. This explicitly validates the extraction invariant and prevents silent copy-paste drift from re-emerging. Optional — not required for correctness, only for extraction hygiene.

#### O3 — `ClerkUserRepository.ts` deprecation comment

No test required. Deprecation comments are documentation only.

---

### Validation Not Required

- **Integration tests**: No assembly-level behavior changes. The provisioning service, DI wiring, and DB interactions are untouched. Existing integration tests (`.integration.test.ts`) cover `DrizzleProvisioningService` and `DrizzleUserRepository` — those remain valid without additions.
- **E2E tests**: The org+provider interstitial flow requires a live Clerk org, which cannot be reliably automated in the project's current E2E setup (Playwright + real Clerk). E2E for this specific path has a prohibitive setup cost relative to the risk, and unit mocks of the `OrganizationSwitcher` component are sufficient to validate the interstitial's correct rendering.
- **Storybook tests**: No UI component story work is in scope.
- **`DrizzleProvisioningService` tests**: Not modified — no validation change.
- **`evaluateNodeProvisioningAccess` tests**: Not modified — no validation change.
- **`ClerkRequestIdentitySource` tests**: Not modified — no validation change.

---

## 6. Risks and Tradeoffs

### Risk of the Validated Plan

**Low** — every changed file has a test that covers its new behavior. The only gaps are:

- The `with-auth.ts` reorder behavioral guarantee depends on whether `isBootstrapRoute` and `resolveIdentity` are decoupled in a way that's observable in tests. R6's conditional case handles this explicitly.
- The interstitial component test is necessarily shallow (mocked Clerk SDK) — it cannot test real Clerk org creation flow.

### Risk if R1–R4 Are Skipped

- `buildProvisioningInput()` bugs in any tenancy mode would silently provision users under wrong tenants (MAJOR)
- The redirect loop fix in `UsersLayout` could regress silently if the test is not updated (MAJOR)
- The moved `onboarding-actions.ts` could have import errors that only surface at runtime (MAJOR)

### Risk if R5 Is Skipped

- The interstitial component could render incorrectly or fail to pass correct props to `OrganizationSwitcher`, leaving `org+provider` users unable to recover from the sign-up state (MINOR — the RSC that renders it is unit-tested, so the rendering path is covered; the component's internal prop contract is what's missing)

### Risk if R6 Full Suite Is Skipped

- The `withAuth` reorder could silently break the bootstrap authentication check, preventing new users from reaching the provisioning page at all (MAJOR — classified as required because bootstrap authentication is the entry gate to the entire onboarding flow)

### False Confidence Warning

The unit tests for `bootstrap/page.tsx` mock `getAppContainer()` and resolve services through a fake container. This is correct for unit testing but does not validate that the real DI wiring produces the correct services for the bootstrap page in production. This gap pre-exists and is not introduced by this fix.

---

## 7. Validation Commands

```bash
# Typecheck — must pass with zero new errors
pnpm typecheck

# Architecture lint — must pass; fix includes file move, new utility, delivery-layer relocation
pnpm arch:lint

# Full unit test suite — must pass
pnpm test

# Lint — must pass
pnpm lint

# Targeted: only the directly affected test files (faster feedback loop during implementation)
pnpm vitest run src/app/auth/build-provisioning-input.test.ts
pnpm vitest run src/app/auth/bootstrap/
pnpm vitest run src/app/onboarding/
pnpm vitest run src/app/users/layout.test.tsx
pnpm vitest run src/security/middleware/with-auth.test.ts
```

**Run order for implementation feedback loop**:

1. `pnpm typecheck` — catches structural errors immediately
2. Targeted `pnpm vitest run` per file as each change is completed
3. `pnpm arch:lint` — after all files are in place (file move + new utility must satisfy arch rules)
4. `pnpm test` — full suite at the end before committing
5. `pnpm lint` — final pass

---

## 8. Recommended Next Action

Proceed to implementation with this validation checklist:

| ID  | Requirement                                                                              | Trigger                             | Status                      |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------- |
| R1  | Write `build-provisioning-input.test.ts` covering 6 cases                                | New file created                    | Required                    |
| R2  | Add 2 new cases to `bootstrap/page.test.tsx`                                             | Bootstrap page modified             | Required                    |
| R3  | Update `layout.test.tsx` redirect assertion                                              | `UsersLayout` redirect changed      | Required                    |
| R4  | Move `onboarding-actions.test.ts` → `actions.test.ts`, update import                     | File move                           | Required                    |
| R5  | Write interstitial component test (3 cases)                                              | New client component created        | Required                    |
| R6  | Run full `with-auth.test.ts`; add `UserNotProvisionedError` case if new code path exists | `with-auth.ts` reordered            | Required (conditional case) |
| —   | `pnpm typecheck` passes                                                                  | All changes complete                | Required                    |
| —   | `pnpm arch:lint` passes                                                                  | All files in place                  | Required                    |
| —   | `pnpm test` passes                                                                       | All changes + test updates complete | Required                    |
| —   | `pnpm lint` passes                                                                       | All changes complete                | Required                    |

**VALIDATION PLAN IS SUFFICIENT**

The plan protects all critical behavioral changes at unit level. The test additions are minimal, targeted, and directly traceable to changed behavior. `pnpm arch:lint` is explicitly required due to the file move, new delivery-layer utility, and bootstrap flow restructuring.
