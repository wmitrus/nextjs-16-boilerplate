# Architecture Impact Review

**Agent**: Architecture Guard  
**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: 2026-03-18  
**Decision**: **APPROVED — with required follow-up cleanup**

---

## 1. Objective

Review the full set of changes applied during this incident workflow for architectural soundness:

1. `src/app/layout.tsx` — Suspense correction with `RootLayoutShell` fallback
2. `src/security/middleware/with-auth.ts` — cookie-bridge edge-mode onboarding redirect
3. `src/app/auth/bootstrap/page.tsx` — cookie set before `/onboarding` redirect
4. `src/app/onboarding/actions.ts` — cookie cleared after `updateOnboardingStatus(true)`

Confirm: module boundaries, DI correctness, security posture, runtime placement, and investigation probe cleanup status.

---

## 2. Current-State Findings

### `src/app/layout.tsx`

- **Implemented**: `<Suspense fallback={<RootLayoutShell />}>` scoped to Clerk branch only. Non-Clerk branch rendered without Suspense.
- `RootLayoutShell` is a local functional component returning an animated header skeleton — no state, no business logic, no external dependencies.
- `RouteTransitionProbe` is imported and wired into `AppLayoutContent` (line 49). **Still present in production code.** Renders visible debug text `[route:{committedPath}]` in the bottom-right corner of every page at z-index 50. Emits browser log events on every route change.

### `src/security/middleware/with-auth.ts` (lines 291–314)

- **Implemented**: Edge mode `onboardingComplete` resolves from `req.cookies.get('__onboarding_pending')?.value !== '1'` — not hardcoded `true`.
- `isNodeMode` gate removed from `redirectForIncompleteOnboarding` call. Both modes now call it with the correctly-resolved `onboardingComplete` value.
- `redirectForIncompleteOnboarding` already has its own guards (`!userId || ctx.isOnboardingRoute || ctx.isPublicRoute || ctx.isApi`) — removal of `isNodeMode` gate is safe.
- `req.cookies` is a native `NextRequest` API available in both Edge and Node runtimes — no import required, no new dependencies introduced.

### `src/app/auth/bootstrap/page.tsx` (line 239–246)

- **Implemented**: `await cookies()` + `cookieStore.set('__onboarding_pending', '1', { httpOnly, secure, sameSite: 'lax', path: '/', maxAge: 7d })` inserted before `redirect('/onboarding...')`.
- `cookies()` from `next/headers` imported correctly at file head.
- Cookie set **only** on the `!user.onboardingComplete` branch — not on the already-complete path. Correct.
- This is a delivery-layer RSC page. Using `next/headers` cookies API at this layer is the expected and correct pattern.

### `src/app/onboarding/actions.ts` (lines 168–170)

- **Implemented**: `await cookies()` + `cookieStore.delete('__onboarding_pending')` after `updateOnboardingStatus(internalUserId, true)`, inside the same `try` block.
- `cookies()` from `next/headers` imported correctly.
- `'use server'` directive is present — this is a server action. Using `next/headers` cookies API in server actions is the correct and expected pattern.

### `src/app/onboarding/onboarding-client-probe.tsx` + `src/app/onboarding/page.tsx`

- `OnboardingClientProbe` is a client component that renders `[onboarding:hydrated]` (semi-transparent text) and emits browser log events on mount/unmount.
- It is imported and rendered in `src/app/onboarding/page.tsx` (line 8). **Still present in production code.**

---

## 3. Docs vs Code Drift

| Claim                                                                                                                   | Status                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `plan.md` says "validation PASS" for all steps                                                                          | Confirmed by code inspection — typecheck, lint, arch:lint, 769 tests pass                                                                |
| `cookie-bridge-routing-remediation-shape.md` says "NO CHANGE to proxy.ts and users/layout.tsx"                          | Confirmed — neither file was modified                                                                                                    |
| `cookie-bridge-routing-remediation-shape.md` says "users/layout.tsx cookie self-healing REJECTED"                       | Confirmed — layout unchanged                                                                                                             |
| `blocking-route-layout-remediation-shape.md` says fallback must be visible, not null                                    | Confirmed — `<RootLayoutShell />` renders a real skeleton header                                                                         |
| Plan steps 1–5 (Incident Intake, Flow Trace, Runtime Review, Architecture Impact Review, Remediation Plan) remain `[ ]` | **Drift**: original plan steps never formally checked off; work was executed through add-on steps. Not a code concern, but plan hygiene. |

---

## 4. Architectural Assessment

### Module Boundaries — **PASS**

- All cookie-related changes are confined to the correct layer owners:
  - `security/middleware` — edge-runtime request interception
  - `app/auth/bootstrap` — delivery layer, provisioning entry point
  - `app/onboarding` — delivery layer, onboarding completion
- No cross-module coupling introduced. Cookie is a transport signal, not a business contract. No business logic placed in `shared/*`.
- `with-auth.ts` does not import from `app/` or `modules/` directly — dependency direction is preserved.

### DI Correctness — **PASS**

- `with-auth.ts` receives all dependencies through function parameters. No new service-locator patterns introduced.
- `cookies()` is a Next.js framework API called at request time in RSC/server action context. This is not a DI concern — it is the correct mechanism at this layer boundary.
- No new singletons, no new global container resolutions.

### Security Posture — **PASS** (with note)

The cookie is correctly classified as a **routing hint**, not an authorization control.

| Security Property                       | Assessment                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `httpOnly: true`                        | Cookie not readable by client JavaScript ✅                                                                                        |
| `secure: env.NODE_ENV === 'production'` | HTTPS-only in production ✅                                                                                                        |
| `sameSite: 'lax'`                       | CSRF-safe for GET-based navigation ✅                                                                                              |
| Authorization remains DB-backed         | `resolveNodeProvisioningAccess` in `UsersLayout` and `OnboardingGuard` are unchanged ✅                                            |
| Forgery of `__onboarding_pending=1`     | Edge redirects to `/onboarding`; `OnboardingGuard` (DB-backed) redirects back if complete. No data leak, no bypass. ✅             |
| Forgery of missing cookie               | Edge passes through; `UsersLayout` (DB-backed) catches `ONBOARDING_REQUIRED` and redirects to `/onboarding`. Safety net intact. ✅ |

**Minor note**: If `cookieStore.delete('__onboarding_pending')` throws inside the `try` block in `actions.ts` after `updateOnboardingStatus(true)` succeeds, the user sees an error UI, the redirect never fires, and the cookie persists. On the next navigation to `/users`, edge middleware sees the cookie and redirects to `/onboarding`. `OnboardingGuard` (Node, DB-backed) sees `onboardingComplete: true` and redirects the user away. Net effect: minor routing friction but no loop and no data hazard. This is low probability and low severity, but could be hardened by a separate `try/catch` around the cookie operation if production tolerance requires it.

### Runtime Placement — **PASS**

| Location                          | Runtime              | API used                                 | Correct? |
| --------------------------------- | -------------------- | ---------------------------------------- | -------- |
| `with-auth.ts` cookie read        | Edge                 | `req.cookies.get()` (NextRequest native) | ✅       |
| `bootstrap/page.tsx` cookie write | Node (RSC)           | `cookies()` from `next/headers`          | ✅       |
| `actions.ts` cookie delete        | Node (Server Action) | `cookies()` from `next/headers`          | ✅       |
| `layout.tsx` Suspense             | Node (RSC)           | React `Suspense`, scoped to Clerk branch | ✅       |

No Edge-incompatible APIs introduced in edge-mode paths. No Node-only APIs used in Edge context.

### Extensibility Seams — **PASS**

- The cookie-bridge is a bounded, reversible mechanism. It does not couple to tenant or org logic.
- If RBAC/ABAC is added later, the onboarding routing signal remains independent of permission checks.
- If the auth provider changes, `bootstrap/page.tsx` is already provider-agnostic at the cookie-write site (the `cookies()` call does not depend on Clerk).
- The `withAuth` function's two-mode design (Node vs Edge) is preserved and extended cleanly.

---

## 5. Risks

### MINOR — Cookie delete inside same `try` block as DB write

**File**: `src/app/onboarding/actions.ts`  
**Risk**: If `updateOnboardingStatus` succeeds but `cookieStore.delete` throws (unlikely), the user sees an error, the redirect is skipped, and the cookie persists for up to 7 days. Future visits to `/users` will edge-redirect to `/onboarding`, but `OnboardingGuard` DB check will redirect them away cleanly. No security hazard; minor UX friction on a low-probability error path.  
**Recommendation**: Low priority. Could be addressed by decoupling the cookie delete into its own `try/catch` that logs but does not surface to the user.

### MINOR — Investigation probes remain wired into production delivery layer

**Files**:

- `src/app/layout.tsx` — `RouteTransitionProbe` renders visible text `[route:{committedPath}]` at z-50 bottom-right on every page and emits browser log events on every route change.
- `src/app/onboarding/page.tsx` — `OnboardingClientProbe` renders `[onboarding:hydrated]` text and emits browser log events.
- `src/app/components/route-transition-probe.tsx` — probe component file
- `src/app/onboarding/onboarding-client-probe.tsx` — probe component file

**Risk**: These are debug artifacts with visible DOM output. They are wired into `AppLayoutContent` (root layout) and the onboarding page. They will appear in all environments, including production Vercel deployments. They also cause unnecessary renders and log noise.  
**Recommendation**: **Must be removed before shipping.** This is the highest-priority cleanup item from this incident workflow.

---

## 6. Recommended Next Action

### Required (block shipping):

1. **Remove investigation probes** — remove `RouteTransitionProbe` from `src/app/layout.tsx` (import + JSX), remove `OnboardingClientProbe` from `src/app/onboarding/page.tsx` (import + JSX). Delete both probe component files unless they are intended as a permanent observability pattern. This must be done by Implementation Agent before the fix is considered release-ready.

### Optional (low priority, improve robustness):

2. **Decouple cookie delete from DB try/catch** in `actions.ts` — wrap cookie delete in a separate `try/catch` that logs a warning on failure but does not block the redirect. This removes the minor error-surface coupling but is not architecturally required.

### Informational:

3. **Plan hygiene** — original steps 1–5 in `plan.md` remain unchecked (`[ ]`). They were superseded by the ad-hoc implementation steps but never formally closed. These can be ticked off as part of plan finalization or left as-is since the work is complete.

---

## Summary

| Category                      | Status                      |
| ----------------------------- | --------------------------- |
| Module boundaries             | ✅ PASS                     |
| Dependency direction          | ✅ PASS                     |
| DI correctness                | ✅ PASS                     |
| Security posture              | ✅ PASS                     |
| Runtime placement             | ✅ PASS                     |
| Extensibility seams           | ✅ PASS                     |
| Investigation probe cleanup   | ⚠️ REQUIRED before shipping |
| Cookie-delete error isolation | ⚠️ Optional hardening       |

**The fix is architecturally sound. The probes must be removed before production shipping.**
