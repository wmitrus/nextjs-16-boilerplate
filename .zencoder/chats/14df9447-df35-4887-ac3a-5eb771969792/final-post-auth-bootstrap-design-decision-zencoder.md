# Final Post-Auth Bootstrap Design Decision

**Agent**: Architecture Guard  
**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: 2026-03-18  
**Status**: FINAL DECISION — IMPLEMENTATION REQUIRED

---

## 1. Objective

Determine whether `/auth/bootstrap` should remain the direct Clerk post-auth landing page after the latest route-handler cookie-bridge implementation, given the confirmed report that:

- The app hangs at `/auth/bootstrap?redirect_url=/users`
- The handoff route and the cookie-bridge middleware path are never reached in the failing run

Evaluate four candidate shapes and produce a concrete, non-speculative final design decision.

---

## 2. Current-State Findings

### 2.1 What the implementation did

The Implementation Agent correctly executed the approved shape:

- `bootstrap/page.tsx` — removed illegal `cookies().set()`; redirects to `/auth/bootstrap/handoff?redirect_url=...` when `!user.onboardingComplete`
- `src/app/auth/bootstrap/handoff/route.ts` — NEW Route Handler; sets cookie, redirects to `/onboarding`
- `with-auth.ts` — reads `__onboarding_pending` cookie in edge mode (correct)
- `actions.ts` — deletes cookie in Server Action on completion (correct)
- `.env.example`, `.env.local` — Clerk post-auth redirect changed from `/users` to `/auth/bootstrap?redirect_url=/users`
- Probes deleted; tests pass (772/772)

### 2.2 What the new runtime evidence tells us

The reported hang: **browser URL shows `/auth/bootstrap?redirect_url=/users`; page does not progress; `/onboarding` never appears.**

This means the critical RSC redirect — `redirect('/auth/bootstrap/handoff?redirect_url=...')` inside `BootstrapPage` — is never committed by the client.

The handoff Route Handler is never reached. The cookie is never set. The middleware bridge is irrelevant to this run.

### 2.3 Root cause: RSC redirect race reproduced at /auth/bootstrap

The original root cause, confirmed in `final-route-boundary-root-cause.md`, was:

> Concurrent RSC navigation conflict — `UsersLayout.redirect('/onboarding')` races with Clerk's `router.refresh()` during post-SSO session finalization

The same race condition now manifests on `/auth/bootstrap`:

1. Clerk completes SSO. Clerk's SDK performs a **client-side navigation** to `/auth/bootstrap?redirect_url=/users` (via `router.push()` or equivalent).
2. Simultaneously, Clerk's SDK fires `router.refresh()` to sync the auth state into the React tree (standard Clerk App Router behavior after session establishment).
3. `BootstrapPage` is a **heavy async RSC**: it awaits `identitySource.get()`, `provisioningService.ensureProvisioned()` (DB write), and `userRepository.findById()` (DB read). These calls take 100–500ms.
4. While the RSC stream for `/auth/bootstrap` is in-flight, `router.refresh()` issues a **concurrent RSC request**.
5. `BootstrapPage` eventually throws `NEXT_REDIRECT` (via `redirect('/auth/bootstrap/handoff?...')`).
6. The App Router receives concurrent RSC responses — the navigation RSC and the refresh RSC — and cannot commit either transition cleanly.
7. Result: browser URL stays at `/auth/bootstrap?redirect_url=/users`. The `RootLayoutShell` Suspense fallback may or may not be visible. No forward progress.

This is structurally identical to the original `/users` failure. Moving the Clerk landing from `/users` to `/auth/bootstrap` **relocated the race, not fixed it**.

### 2.4 Why the cookie bridge was not sufficient for the first-visit problem

The cookie bridge was designed correctly for a specific scenario: **subsequent navigations** to `/users` after onboarding is known to be incomplete (e.g., back-button, deep link while cookie is present). In that scenario:

- Middleware reads the cookie → redirects to `/onboarding` via HTTP 307 (before any RSC renders)
- No streaming redirect, no race

The bridge cannot protect the **first visit** because:

- The cookie does not exist until `bootstrap/handoff` Route Handler runs
- `bootstrap/handoff` is reached only after `BootstrapPage` completes its RSC redirect
- `BootstrapPage` completing its RSC redirect IS the race window

The bridge is architecturally sound for subsequent visits. It does not address and was never designed to address the first-visit RSC race.

### 2.5 Secondary candidate cause: Clerk URL param handling

There is a secondary risk worth acknowledging: `normalizeClerkPostAuthRedirect` receives `/auth/bootstrap?redirect_url=/users` and produces `http://localhost:3000/auth/bootstrap?redirect_url=/users`. Clerk's SDK may or may not preserve the `redirect_url` query param through the OAuth callback redirect chain. If Clerk strips it, bootstrap receives no `redirect_url`, defaults to `/users`, and the flow still continues (bootstrap redirects to `/auth/bootstrap/handoff?redirect_url=%2Fusers`). This does not cause a hang; it just loses the redirect target override.

The hang cannot be explained by param stripping. The RSC race is the primary explanation.

### 2.6 Probe removal: was it premature?

**No.** The root cause of the new failure is architecturally diagnosable without probes. Adding a probe to `/auth/bootstrap` would confirm that the route commits and then fails to transition — which is already established from architecture analysis and the user's URL observation. Restoring probes would add noise without changing the architectural decision. Do not restore them.

---

## 3. Docs vs Code Drift

| Claim / Document                                                                                           | Status                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `plan.md` step "Re-Implementation — Route Handler Cookie-Bridge" marked `[ ]`                              | DRIFT: implementation was completed by the Implementation Agent but the step was not ticked                                             |
| `final-runtime-legal-onboarding-remediation-shape.md` says Route Handler at `/api/auth/onboarding-pending` | CODE: implementation placed it at `/auth/bootstrap/handoff` — an explicitly better location, consistent with the Codex shape doc        |
| `testing/infrastructure/env.ts` lines 45–48: still shows `/users` as fallback/force redirect URLs          | DRIFT: not updated. `.env.local` and `.env.example` were updated, but the test infrastructure default was not. Low-severity test drift. |
| All three prior remediation shape docs converge on `/auth/bootstrap/handoff` as the Route Handler path     | Consistent with implementation                                                                                                          |

---

## 4. Architectural Assessment

### 4.1 Shape evaluation

**Shape A — Keep /auth/bootstrap as direct Clerk post-auth landing page (current)**

REJECTED.

`BootstrapPage` is a heavy async RSC with two sequential DB calls. Its only exit mechanism for the onboarding-incomplete case is `redirect()`, which throws `NEXT_REDIRECT` inside an RSC render. This is structurally identical to `UsersLayout.redirect('/onboarding')` — the original failing pattern.

The race condition is **inherent to any heavy async RSC page that uses `redirect()` as its primary exit, when that page is the direct target of Clerk's client-side post-auth navigation**. Moving the landing from `/users` to `/auth/bootstrap` does not change this structural property. `BootstrapPage` is actually heavier than `UsersLayout` (more DB calls), making the race window larger.

This shape is not viable as a Clerk direct landing.

---

**Shape B — Stable non-redirecting landing page + separate bootstrap trigger**

VIABLE BUT UNSTABLE.

The concept: Clerk lands on a simple, fast page that renders without redirect. After the page commits, a client-side mechanism triggers bootstrap.

Problems:

1. If Clerk fires `router.refresh()` before or during the client-side bootstrap trigger, a new concurrent navigation (to bootstrap) races with the refresh — same class of problem.
2. Requires a visible intermediate loading state, which is a UX regression.
3. The bootstrap trigger (via `useEffect` → `router.push('/auth/bootstrap')`) introduces a new client-side timing dependency.
4. Adds a new page segment with no clear module owner.

This shape moves the problem rather than eliminating it. Not recommended.

---

**Shape C — Route Handler as direct Clerk post-auth landing target**

APPROVED. This is the correct final design.

A Route Handler produces a **single HTTP response** before any React rendering occurs. The flow is:

1. Clerk redirects the browser (via its post-auth redirect mechanism) to the Route Handler URL.
2. The browser makes an HTTP GET request to the Route Handler.
3. If Clerk used `router.push()` for the navigation, the App Router detects that the destination is a Route Handler (no RSC payload available) and falls back to a full browser navigation. If Clerk used `window.location.assign()`, the behavior is identical.
4. The Route Handler runs on the Node runtime. It does all provisioning logic and returns an HTTP 307 redirect.
5. The browser follows the 307. The `router.refresh()` from Clerk fires AFTER the final destination page is loaded (e.g., `/onboarding`). At that point, `router.refresh()` re-fetches the current page's RSC tree — `/onboarding` does not redirect — no race occurs.

**Why this is different**: The Route Handler's response is a complete HTTP response, not a streaming RSC. There is no `NEXT_REDIRECT` racing with concurrent RSC requests. The App Router's navigation and Clerk's refresh are decoupled by the full HTTP navigation.

This eliminates the race condition structurally.

Constraint: Route Handlers cannot render React error UI. Error cases must be handled via redirects to error pages.

---

**Shape D — Other variants (client-side Server Action trigger, Clerk metadata claims)**

REJECTED.

- Client-side Server Action trigger: moves provisioning to a client-invoked flow, introduces timing issues, adds unnecessary client complexity.
- Clerk metadata/session claims: requires Clerk dashboard configuration, couples onboarding truth to Clerk rather than the DB, is a broader architectural change, and does not work for non-Clerk auth providers (this boilerplate must remain provider-agnostic).

---

### 4.2 Final approved design

```
Clerk completes SSO
    ↓ [Clerk post-auth redirect to Route Handler URL]
HTTP GET /auth/bootstrap/complete?redirect_url=/users
    ↓ [full HTTP navigation — no RSC streaming, no race]
Route Handler (Node runtime):
  - resolveIdentity → if no userId: HTTP 302 /sign-in
  - orgRequired check → if org mode + no tenantExternalId: HTTP 302 /auth/bootstrap?reason=org-required
  - provisioningService.ensureProvisioned() → if error: HTTP 302 /auth/bootstrap?reason={error_code}
  - userRepository.findById() → if null: HTTP 302 /auth/bootstrap?reason=db-error
  - if !user.onboardingComplete:
      cookies().set('__onboarding_pending', '1', { ... }) [LEGAL — Route Handler]
      → HTTP 302 /onboarding?redirect_url=...
  - if user.onboardingComplete:
      → HTTP 302 safeTarget (/users or sanitized redirect_url)
    ↓ [browser follows 302]
/onboarding (first page load, clean)
    ↓ [Clerk fires router.refresh()]
/onboarding RSC re-renders — no redirect, no race ✅
```

For error cases:

```
Route Handler → HTTP 302 /auth/bootstrap?reason=cross_provider_linking
    ↓
/auth/bootstrap/page.tsx (SIMPLIFIED) — reads ?reason, renders BootstrapErrorUI or BootstrapOrgRequired
    [no provisioning logic, no redirect logic in page.tsx]
```

---

### 4.3 Route classification for the Route Handler

The Route Handler must be placed under `/auth/bootstrap/` to inherit `isBootstrapRoute: true`:

```ts
const isBootstrapRoute =
  path === '/auth/bootstrap' || path.startsWith('/auth/bootstrap/');
```

This means:

- `redirectForIncompleteOnboarding` does NOT apply (bootstrap fast path exits before reaching it) ✅
- Unauthenticated requests → `redirectToSignIn` within the bootstrap fast path ✅
- `UserNotProvisionedError` (new user not yet in DB) → handler called anyway (correct for bootstrap) ✅

**Do NOT place the Route Handler under `/api/`**: that classification gives `isApi: true`, and `rejectUnauthenticatedPrivateRoute` returns HTTP 401 JSON for unauthenticated requests. That is wrong for a browser-navigated landing route — users must be redirected to `/sign-in`, not receive 401 JSON.

Recommended path: `/auth/bootstrap/complete/route.ts` or `/auth/bootstrap/entry/route.ts`.  
Note: **`/auth/bootstrap/route.ts` cannot coexist with `/auth/bootstrap/page.tsx` at the same segment** (Next.js constraint). Use a nested path.

---

### 4.4 Responsibility split after refactor

| Boundary                                  | Responsibility                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/auth/bootstrap/complete/route.ts` (NEW) | Identity check, provisioning, user lookup, cookie set (legal), redirect to final destination or error page |
| `/auth/bootstrap/page.tsx` (SIMPLIFIED)   | Error UI rendering only — reads `?reason=` param, renders `BootstrapErrorUI` or `BootstrapOrgRequired`     |
| `/auth/bootstrap/handoff/route.ts`        | REMOVE — redundant. Cookie is set in the complete Route Handler.                                           |
| `with-auth.ts`                            | NO CHANGE — edge cookie read and `redirectForIncompleteOnboarding` remain correct                          |
| `actions.ts`                              | NO CHANGE — cookie delete in Server Action on completion remains correct                                   |
| `users/layout.tsx`                        | NO CHANGE — DB-backed safety net stays                                                                     |

---

### 4.5 What happens to the existing bootstrap page after refactor

`/auth/bootstrap/page.tsx` is simplified to:

- Accept `?reason=` and `?redirect_url=` search params
- Render the appropriate error component based on `reason`
- No identity resolution (identity is already resolved and redirected by the Route Handler before this page is reached)
- No provisioning calls
- No redirect logic

This page is only reached via an HTTP redirect from the Route Handler in error cases. It is no longer a Clerk post-auth landing.

---

## 5. Risks

### CRITICAL — /auth/bootstrap as direct RSC landing reproduces the race

The current implementation does not fix the root cause. Changing the Clerk post-auth target to the Route Handler is required to resolve the hang. Until that change is made, the app remains broken for new users on their first SSO sign-in.

### MAJOR — Provisioning logic moves into a Route Handler

The Route Handler will contain the same provisioning and user-lookup logic currently in `BootstrapPage`. Route Handlers do not render React UI. All error cases must be handled via redirects to pages. This requires introducing error page routes where none currently exist (or repurposing the existing bootstrap page as the error renderer via `?reason=`).

The risk is that the error page for bootstrap becomes a new direct-access surface. It must not contain any provisioning logic, and it must not be reachable from Clerk's redirect chain (only from the Route Handler's redirect). The page should not re-run provisioning if accessed directly — it should simply render the error UI for the given `?reason=`.

If accessed directly without `?reason=`, the page should render a generic error or redirect to `/sign-in`.

### MINOR — `src/testing/infrastructure/env.ts` not updated

Lines 45–48 still have `/users` as the Clerk redirect defaults. These drive tests, not runtime. Tests pass because test mocks don't exercise the real post-auth redirect chain. This should be updated to match `.env.local` for consistency, but is not a blocker.

### MINOR — `plan.md` step not ticked

"Re-Implementation" step remains `[ ]`. Plan housekeeping only.

### INFORMATIONAL — `src/app/auth/bootstrap/handoff/route.ts` becomes redundant

With the Route Handler as landing, the handoff Route Handler is no longer needed. It can be removed in the same implementation pass. Keeping it adds dead code without causing harm.

---

## 6. Recommended Next Action

### Decision: /auth/bootstrap MUST NOT remain a direct Clerk post-auth landing page.

The landing MUST change to a Route Handler. This is the minimum safe fix for the confirmed race.

---

### Implementation scope for the Implementation Agent

**Files to create:**

| File                                       | Purpose                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `src/app/auth/bootstrap/complete/route.ts` | NEW Route Handler — identity check, provisioning, user lookup, cookie set, redirect |

**Files to change:**

| File                                | Change                                                                                                                                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/auth/bootstrap/page.tsx`   | SIMPLIFY: remove all provisioning logic, identity resolution, redirect logic. Accept `?reason=` param. Render error UI for each reason. Render a default error or redirect to `/sign-in` if accessed without reason. |
| `.env.example`                      | Update Clerk redirect URLs to `/auth/bootstrap/complete?redirect_url=/users`                                                                                                                                         |
| `.env.local`                        | Same                                                                                                                                                                                                                 |
| `src/testing/infrastructure/env.ts` | Update fallback/force redirect defaults to match                                                                                                                                                                     |

**Files to remove:**

| File                                           | Reason                                                      |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `src/app/auth/bootstrap/handoff/route.ts`      | Redundant — cookie is now set in the complete Route Handler |
| `src/app/auth/bootstrap/handoff/route.test.ts` | Follows removal                                             |

**Tests to update:**

| File                                                 | Change                                                                                                                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/auth/bootstrap/page.test.tsx`               | REWRITE: page no longer does provisioning; tests cover `?reason=` param → correct error UI rendering. Remove redirect assertions from page tests (no redirect in page).                                                    |
| NEW: `src/app/auth/bootstrap/complete/route.test.ts` | Cover: provisioning success → redirect, each error condition → error page redirect, onboarding incomplete → cookie set + redirect to /onboarding, onboarding complete → redirect to safeTarget, open-redirect sanitization |

**Files confirmed unchanged:**

- `src/security/middleware/with-auth.ts`
- `src/app/onboarding/actions.ts`
- `src/app/users/layout.tsx`
- `src/proxy.ts`
- `src/app/layout.tsx`

---

### Rejected approaches (explicit)

| Approach                                                                            | Rejection reason                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep `/auth/bootstrap` as Clerk post-auth landing                                   | Reproduces RSC redirect race. Same structural problem as original `/users` failure.                                                                        |
| `/auth/bootstrap/page.tsx` calling `redirect()` in the onboarding-incomplete branch | Race condition. `redirect()` in heavy async RSC page races with `router.refresh()`.                                                                        |
| Place Route Handler under `/api/` prefix                                            | `rejectUnauthenticatedPrivateRoute` returns 401 JSON for unauthenticated requests. Browser-navigated landing must redirect to `/sign-in`, not return JSON. |
| `route.ts` at same segment as `page.tsx` (`/auth/bootstrap/route.ts`)               | Next.js forbids `route.ts` and `page.tsx` at the same route segment.                                                                                       |
| Move onboarding truth into Clerk session claims                                     | Broader architectural change, couples onboarding to Clerk, breaks provider-agnostic model.                                                                 |
| Client-side `useEffect` → `router.push('/auth/bootstrap')` from stable landing page | Does not eliminate race — `router.push` from `useEffect` can still race with in-flight `router.refresh()`.                                                 |
| Restore investigation probes                                                        | Root cause is architecturally clear. Probes would confirm what is already known. Not justified.                                                            |

---

## Summary

| Question                                                                      | Answer                                                      |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Does `/auth/bootstrap` as direct Clerk landing cause fundamental instability? | YES — same RSC redirect race as original `/users` failure   |
| Should `/auth/bootstrap` remain the Clerk post-auth landing page?             | NO — must change to Route Handler                           |
| Was removing probes premature?                                                | NO — root cause is architecturally clear without probes     |
| Correct landing boundary                                                      | Route Handler at `/auth/bootstrap/complete/route.ts`        |
| Role of `/auth/bootstrap/page.tsx` going forward                              | Error UI renderer only — no provisioning, no redirect logic |
| `/auth/bootstrap/handoff/route.ts`                                            | Remove — redundant with the new design                      |
| `with-auth.ts`, `actions.ts`, `users/layout.tsx`, `proxy.ts`                  | Unchanged                                                   |
