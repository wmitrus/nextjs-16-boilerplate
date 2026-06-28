# Implementation Plan — Session Reuse Classification For E2E

## Goal

Refactor E2E tests so scenarios that do **not** validate the act of signing in, first-login bootstrap, onboarding mutation, sign-out, or session re-entry can reuse an existing authenticated session instead of creating a new session in every test.

## Working Definition

A scenario **can reuse an existing session** when its assertion target is a steady-state page, API response, or redirect that depends only on the user already being authenticated in a known state.

A scenario **must start with a fresh session or fresh login flow** when its assertion target is the sign-in/bootstrap/onboarding transition itself, or when the test mutates auth/bootstrap state in a way that another test must not inherit.

## Recommended Fixture Model

### AuthJS setup identities

- `authjs-completed-admin`
  - completed onboarding
  - platform/admin-capable access
  - used for `/admin*` steady-state assertions
- `authjs-completed-user`
  - completed onboarding
  - non-admin baseline authenticated user
  - used for generic signed-in steady-state assertions if AuthJS coverage expands
- `authjs-incomplete-user`
  - onboarding incomplete
  - used only for onboarding-routing scenarios

### Reuse mechanism

- Prefer Playwright `storageState` files generated once per setup project or once per suite setup phase.
- Keep `page.route(...)` mocks per test when response stubbing differs, but stop re-provisioning and re-signing-in in every `beforeEach`.
- If a suite only needs one authenticated identity, apply `test.use({ storageState: ... })` to the describe or file and keep per-test `page.goto(...)` isolation.

## File-By-File Classification

## 1. `e2e/admin.spec.ts`

### Unauthenticated redirect tests

- `redirects unauthenticated users away from /admin`
- `redirects unauthenticated users away from /admin/waitlist`
- `redirects unauthenticated users away from /admin/invitations`

Classification:

- **Must remain unauthenticated**

Reason:

- These assertions validate the absence of session.

### Authenticated admin tests

- `admin hub loads without error boundary`
- `admin hub has correct page title`
- `admin hub shows active section cards`
- `admin hub breadcrumb shows Administration link`
- `admin users page loads without error boundary`
- `admin users page has correct title`
- `waitlist page loads without error boundary`
- `waitlist page has correct title`
- `invitations page loads without error boundary`
- `invitations page has correct title`
- `invitations page shows send invitation form`

Classification:

- **Can reuse existing authenticated admin session**

Reason:

- None of these assertions validate the sign-in action itself.
- None require a unique user.
- None mutate auth/bootstrap state in a way that demands a fresh login per test.

Refactor target:

- Replace per-test `createAuthjsE2ECredentials(...) + provisionAuthjsE2EUser(...) + signInAuthjsE2E(...)` with a shared `authjs-completed-admin` storage state.

## 2. `e2e/admin-users.spec.ts`

### Unauthenticated redirect test

- `redirects unauthenticated users away from /admin/users`

Classification:

- **Must remain unauthenticated**

### Authenticated admin tests

- `page loads without error boundary`
- `page has the correct title`
- `displays search input`
- `displays active user in table`
- `displays deactivated user in table`
- `displays the users count in the page`
- `page has breadcrumb back to Administration hub`

Classification:

- **Can reuse existing authenticated admin session**

Reason:

- Only `/api/admin/users` response mocking varies per test.
- The authenticated browser state itself does not need to be rebuilt.

Refactor target:

- Keep `page.route('**/api/admin/users**', ...)` and `page.goto('/admin/users')` in `beforeEach`.
- Move auth state creation to shared storage state.

## 3. `e2e/authjs-session.spec.ts`

Tests:

- all route-health assertions against `/api/auth/session` and `/api/auth/providers`

Classification:

- **Must remain unauthenticated / stateless**

Reason:

- These tests specifically verify public unauthenticated route health and guard against `CLIENT_FETCH_ERROR`.

## 4. `e2e/authjs-dashboard-entry.spec.ts`

### Unauthenticated redirect test

- `unauthenticated dashboard visit redirects to AuthJS sign-in`

Classification:

- **Must remain unauthenticated**

### Login-flow test

- `successful AuthJS sign-in lands on the dashboard by default`

Classification:

- **Must perform fresh login flow**

Reason:

- The purpose of the test is to verify the post-sign-in landing itself.
- Reusing storage state would skip the behavior under test.

Optimization note:

- There is only one authenticated test here, so reuse is not the main win.
- If needed, provisioning can be moved out of the test body, but the browser must still start logged out and execute the sign-in action.

## 5. `e2e/authjs-onboarding-entry.spec.ts`

Test:

- `incomplete AuthJS sign-in routes to onboarding and then settles on dashboard`

Classification:

- **Must perform fresh login flow with an incomplete user state**

Reason:

- The test verifies onboarding routing triggered by sign-in.
- The test mutates user state from incomplete to complete during onboarding.
- Reusing a completed storage state would destroy the value of the scenario.

## 6. `e2e/authjs-verify-email.spec.ts`

All tests:

- public page rendering and invalid-token handling

Classification:

- **Must remain unauthenticated / public**

Reason:

- Session reuse is irrelevant and would only increase noise.

## 7. `e2e/users.spec.ts` (Clerk)

All tests:

- steady-state `/users` page assertions after auth

Classification:

- **Can reuse existing authenticated Clerk session**

Reason:

- The tests do not validate the act of signing in.
- They only need a completed authenticated user able to access `/users`.

Refactor target:

- Replace `test.beforeEach(async ({ page }) => await signInE2E(page))` with a shared Clerk storage state for the completed provisioned user.

## 8. `e2e/auth.spec.ts` (Clerk entry-flow tests)

Tests covering:

- sign-in via page
- sign-up via page
- sign-in via modal
- sign-up via modal
- switching between sign-in/sign-up UIs before bootstrap redirect

Classification:

- **Must keep fresh unauthenticated session / fresh auth flow**

Reason:

- These tests explicitly validate entry points and redirect behavior during authentication.
- Reusing storage state would bypass the behavior under test.

## 9. `e2e/provisioning-runtime.spec.ts` (Clerk auth/bootstrap matrix)

This file contains both flow tests and steady-state tests. It should not be treated as one uniform category.

### 9A. Must keep fresh login or fresh auth/bootstrap state

These tests validate first-login, returning-login, sign-out/sign-in, onboarding, bootstrap redirect, or workspace/tenant selection transitions.

Examples:

- `single mode: first login goes through bootstrap, reaches onboarding, completes onboarding, then lands on /users`
- `single mode: returning login skips onboarding and lands in the app`
- `single mode: returning incomplete user sign-in routes back to onboarding before /users settles`
- `single mode: bootstrap start sets onboarding cookie in the route handler before redirecting to onboarding`
- `single mode: onboarding completion clears the onboarding cookie from a legal server boundary`
- `single mode: sign-out then sign-in again stays stable for a completed user`
- `single mode: fresh-user onboarding emits enough observability signals for flow classification`
- `personal mode: first login provisions a personal tenant, completes onboarding, and reaches the app`
- `personal mode: returning login skips onboarding and lands in the app`
- `org/provider mode: first login with an active org goes through bootstrap, onboarding, then the app`
- `org/db mode: first login with active tenant cookie goes through bootstrap, onboarding, then the app`
- OAuth sign-in / sign-up entry tests

Classification:

- **Must keep fresh flow semantics**

Reason:

- The transition is the product behavior under test.

### 9B. Can reuse an existing authenticated session of the correct identity/state

These tests only assert behavior from an already-settled state and do not need the act of sign-in itself.

Examples:

- `single mode: direct visit to /users after onboarding completion stays allowed`
- `single mode: direct visit to /onboarding after onboarding completion redirects to /users`
- `single mode: completed-user /users load stays stable in the Clerk provider branch`
- `single mode: refresh on /users keeps a completed user on the app route`
- `single mode: signed-in user is redirected away from sign-in and sign-up routes`
- `org/provider mode without an active org renders the workspace recovery UI`
- `org/db mode without an active tenant cookie renders controlled tenant_config UI`
- `org/db mode with active tenant but no membership returns 403 from protected API`

Classification:

- **Can reuse identity-specific session state**

Reason:

- These tests can start from a pre-authenticated user and then mutate cookies/org selection locally inside the browser context.
- They do not need repeated credential submission.

### 9C. State-specific but reusable setup

These tests need a specific authenticated state, but not a fresh sign-in every test:

- completed single user
- incomplete single user
- org provider owner with active session
- org DB seeded member with active session

Classification:

- **Use prebuilt state fixtures, not per-test interactive sign-in**

Reason:

- The critical variable is identity/state shape, not the login UI event.

## Proposed Refactor Sequence

### Phase 1 — Highest ROI

1. [x] Convert `e2e/admin.spec.ts` authenticated AuthJS blocks to a shared admin storage state.
2. [x] Convert `e2e/admin-users.spec.ts` authenticated AuthJS block to the same shared admin storage state.
3. [x] Convert `e2e/users.spec.ts` Clerk block to a shared completed-user Clerk storage state.

### Resolved follow-up

- `e2e/error-boundary.spec.ts`
  - investigated after the Clerk helper stabilization work
  - clarified as an unauthenticated E2E route, not a session-reuse candidate

Reason:

- `/e2e-error` is explicitly allowed for E2E traffic without an authenticated session.
- Keeping `signInE2E(page)` in this spec pulled an unrelated Clerk bootstrap and provisioning flow into a route-level error-boundary assertion.
- That extra auth setup introduced false failures unrelated to the error-boundary contract itself.
- Conclusion: this file should stay unauthenticated and should not be migrated with the completed-user storage-state pattern used for `e2e/users.spec.ts`.

Expected effect:

- removes the hot auth churn from the suites currently paying repeated sign-in cost without testing sign-in semantics

Implementation result:

- Implemented with worker-scoped AuthJS storage-state setup plus per-test fresh browser contexts.
- The first variant still allowed too much per-worker setup churn under `fullyParallel`, so the final implementation also serializes `e2e/admin.spec.ts` and `e2e/admin-users.spec.ts` per file.
- This preserves test isolation while ensuring each file pays for authenticated setup only once.
- Implemented the same pattern for `e2e/users.spec.ts` using Clerk session capture.
- Hardened AuthJS provisioning against Next.js dev cold-start by probing `/api/internal/e2e/authjs-user` until the real route handler responds with JSON validation, instead of letting the first real provisioning call fail on a transient app-level HTML `404` during route compilation.
- The first Clerk capture variant exposed that storage state was being saved before onboarding completion had fully settled; the final helper now mirrors the repository's validated bootstrap flow and waits for the onboarding UI to disappear before reusing storage state.
- `e2e/error-boundary.spec.ts` was corrected to test the E2E error route directly without unrelated Clerk sign-in setup.

### Phase 2 — Split flow tests from steady-state tests

1. [x] Keep `e2e/auth.spec.ts`, `e2e/authjs-dashboard-entry.spec.ts`, and `e2e/authjs-onboarding-entry.spec.ts` flow-based.
2. [x] In `e2e/provisioning-runtime.spec.ts`, separate steady-state assertions from login/bootstrap-transition assertions.
3. [x] Apply storage-state fixtures only to the steady-state subset.

Durable agent rule recorded:

- Future E2E optimization work must classify scenarios before changing auth setup.
- Shared session reuse is allowed only for steady-state assertions after auth/bootstrap/onboarding has already settled.
- Flow assertions and explicitly E2E-allowed unauthenticated routes must keep their native fixture model.

Phase 2 implementation result:

- Added reusable Clerk single-mode storage-state capture only for the steady-state subset in `e2e/provisioning-runtime.spec.ts`.
- Kept interactive coverage for completed `/onboarding` redirect behavior and other transition-sensitive cases.
- Corrected stale E2E assumptions uncovered during the refactor:
  - `/api/me/provisioning-status` assertions must use `internalOrganizationId`
  - completed-user default app entry and hostile `redirect_url` sanitization settle on `/dashboard`

Phase 2 focused validation result:

- Container-backed focused rerun of the selected single-mode slice passed: `8/8` on Chromium with `--workers=16`.

### Phase 3 — Optional setup projects

Create Playwright setup projects that emit storage-state files for:

- Clerk completed single user
- Clerk incomplete user
- Clerk org DB seeded member
- AuthJS completed admin
- AuthJS completed standard user

## Hard Conclusion

For the current AuthJS admin suites, there are **no tests that inherently require a fresh session per test**. Their current per-test login behavior is an implementation convenience, not a semantic requirement.

The scenarios that truly require fresh login/session semantics do exist in the repository, but they are concentrated in:

- `e2e/auth.spec.ts`
- `e2e/authjs-dashboard-entry.spec.ts`
- `e2e/authjs-onboarding-entry.spec.ts`
- the flow-oriented portions of `e2e/provisioning-runtime.spec.ts`

## Current Status

- `e2e/admin.spec.ts`: implemented
- `e2e/admin-users.spec.ts`: implemented
- `e2e/users.spec.ts`: implemented
- `e2e/provisioning-runtime.spec.ts` steady-state option-1 subset: implemented and validated
- Focused scenario validation at `--workers=16`: passed after the final per-file serialization adjustment
- Clerk `users` scenario validation at `--workers=16`: passed after settled-state capture fix
- Provisioning-runtime focused single-mode steady-state validation at `--workers=16`: passed after route-contract alignment fixes
