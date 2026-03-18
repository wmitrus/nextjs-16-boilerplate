# Final Runtime-Legal Onboarding Remediation Shape

**Agent**: Architecture Guard  
**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: 2026-03-18  
**Status**: **APPROVED — revised implementation shape required**

---

## 1. Objective

Revise the cookie-bridge implementation to comply with a confirmed Next.js 16 runtime constraint:

> `cookies().set()` and `cookies().delete()` can only be called in a **Server Action** or **Route Handler**.  
> Calling them in an RSC page or layout render throws: _"Cookies can only be modified in a Server Action or Route Handler."_

The previous implementation placed `cookies().set()` in `src/app/auth/bootstrap/page.tsx`, which is an RSC Server Component page, not a Server Action or Route Handler. This is illegal in Next.js 16.

All other parts of the cookie-bridge remain sound. Only the write site for the cookie must move.

---

## 2. Confirmed Runtime Constraint

### Next.js 16 `cookies()` API rules

| Operation            | RSC page/layout         | Server Action | Route Handler |
| -------------------- | ----------------------- | ------------- | ------------- |
| `cookies().get()`    | ✅ Legal                | ✅ Legal      | ✅ Legal      |
| `cookies().set()`    | ❌ **Illegal** — throws | ✅ Legal      | ✅ Legal      |
| `cookies().delete()` | ❌ **Illegal** — throws | ✅ Legal      | ✅ Legal      |

**Source**: Official Next.js App Router docs — "Cookies can only be modified in a Server Action or Route Handler."

This is not a documentation gap. It is a runtime enforcement. The error is thrown by the framework, not a static type error, so TypeScript does not catch it.

### What this means for the current implementation

| File                                   | Current usage                                      | Legal?                        |
| -------------------------------------- | -------------------------------------------------- | ----------------------------- |
| `src/app/auth/bootstrap/page.tsx`      | `cookieStore.set(...)` in RSC page render          | ❌ **Illegal — must change**  |
| `src/app/onboarding/actions.ts`        | `cookieStore.delete(...)` in `'use server'` action | ✅ Legal                      |
| `src/security/middleware/with-auth.ts` | `req.cookies.get(...)` — NextRequest native API    | ✅ Legal (not `next/headers`) |

---

## 3. Is the Cookie-Bridge Concept Still Correct?

**YES.**

The analysis from `cookie-bridge-routing-remediation-shape.md` remains valid:

- DB lookup in Edge middleware is impossible (PGLite/Drizzle = Node-only)
- JWT custom claims require external Clerk configuration — out of scope
- Moving the redirect to middleware layer via a cookie signal is the correct fix class
- Cookie semantics (routing hint, not authorization) remain correct
- `redirectForIncompleteOnboarding` in `with-auth.ts` is the correct enforcement point
- `UsersLayout` stays as safety net, unchanged

The **only problem** is where the cookie is written. The concept is correct. The write site is wrong.

---

## 4. The Write Site Problem and Its Solution

### Why `bootstrap/page.tsx` cannot write the cookie

`BootstrapPage` is an async RSC Server Component. During its render phase, `redirect()` from `next/navigation` throws `NEXT_REDIRECT` — but cookie mutations on the response are only possible inside Server Actions and Route Handlers, which have full response-header-writing access. RSC render pipelines are one-way: they stream output to the client, they cannot write response cookies.

### The only two legal write sites

1. **Server Action** — requires being invoked programmatically (POST-based), cannot be triggered from inside an RSC render directly without a client-side intermediary.
2. **Route Handler** — can be called via a redirect chain. Bootstrap redirects the browser to a Route Handler URL; the Route Handler sets the cookie and redirects onward to `/onboarding`.

### Why a Route Handler is the correct choice here

Bootstrap is a GET-based server-rendered page that uses `redirect()` to navigate the user. The bootstrap page cannot trigger a Server Action directly (no form submission, no client component). The natural, idiomatic, Next.js-correct mechanism is:

**Bootstrap page → `redirect('/api/auth/onboarding-pending?redirect_url=...')` → Route Handler sets cookie → `redirect('/onboarding?redirect_url=...')`**

This is one additional HTTP hop (browser follows two redirects: one from bootstrap to Route Handler, one from Route Handler to `/onboarding`). It is:

- Fully legal under Next.js 16 runtime rules
- Consistent with the existing architecture (Route Handlers already exist under `src/app/api/`)
- Not visible to the user (browser follows redirect chains transparently)
- Not a security concern (the cookie is a routing hint; the Route Handler is protected by the existing security pipeline)

---

## 5. Approved Final Implementation Shape

### File targets

| File                                           | Change                                                                                  | Direction |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| `src/security/middleware/with-auth.ts`         | **NO CHANGE** — current impl is correct and legal                                       | Keep      |
| `src/app/auth/bootstrap/page.tsx`              | **REVISE**: remove `cookies` import + `cookieStore.set()` block; change redirect target | Change    |
| `src/app/api/auth/onboarding-pending/route.ts` | **CREATE**: new Route Handler — sets cookie, redirects to `/onboarding`                 | New       |
| `src/app/onboarding/actions.ts`                | **NO CHANGE** — `cookieStore.delete()` in Server Action is legal                        | Keep      |
| `src/app/users/layout.tsx`                     | **NO CHANGE** — safety net unchanged                                                    | Keep      |
| `src/proxy.ts`                                 | **NO CHANGE**                                                                           | Keep      |

---

## 6. Exact Change Specifications

### `src/app/auth/bootstrap/page.tsx` — REVISE

**Remove**:

- `import { cookies } from 'next/headers';` at line 1
- The entire `cookieStore.set(...)` block (lines 239–246)

**Change** the `redirect` call from:

```ts
const cookieStore = await cookies();
cookieStore.set('__onboarding_pending', '1', {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
});
redirect(`/onboarding?redirect_url=${encodeURIComponent(safeTarget)}`);
```

**To**:

```ts
redirect(
  `/api/auth/onboarding-pending?redirect_url=${encodeURIComponent(safeTarget)}`,
);
```

The existing `logger.info(...)` block before this line is unchanged. The redirect target changes from `/onboarding?...` to `/api/auth/onboarding-pending?...`.

---

### `src/app/api/auth/onboarding-pending/route.ts` — CREATE

```ts
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { env } from '@/core/env';

import { sanitizeRedirectUrl } from '@/shared/lib/routing/safe-redirect';

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const rawRedirectUrl = url.searchParams.get('redirect_url') ?? '';
  const safeTarget = sanitizeRedirectUrl(rawRedirectUrl, '/users');

  const cookieStore = await cookies();
  cookieStore.set('__onboarding_pending', '1', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.redirect(
    new URL(
      `/onboarding?redirect_url=${encodeURIComponent(safeTarget)}`,
      request.url,
    ),
  );
}
```

**Design notes**:

- `sanitizeRedirectUrl` prevents open redirect — reuses the existing shared utility, same as bootstrap page uses.
- `GET` handler — the browser follows bootstrap's redirect to this URL via GET.
- Cookie semantics identical to the previous incorrect placement: `httpOnly`, `secure` in production, `sameSite: lax`, `path: /`, `maxAge: 7d`.
- Minimal implementation — no business logic, no DB access.
- No `withNodeProvisioning` wrapper needed — this route does not query the database.

---

### Route Handler security classification

The path `/api/auth/onboarding-pending` is classified by `src/security/middleware/route-classification.ts` as:

| Flag                | Value   | Reason                              |
| ------------------- | ------- | ----------------------------------- |
| `isApi`             | `true`  | Path starts with `/api`             |
| `isPublicRoute`     | `false` | Not in `PUBLIC_ROUTE_PREFIXES`      |
| `isInternalApi`     | `false` | Does not start with `/api/internal` |
| `isAuthRoute`       | `false` | Not `/sign-in` or `/sign-up`        |
| `isOnboardingRoute` | `false` | Does not start with `/onboarding`   |
| `isBootstrapRoute`  | `false` | Not `/auth/bootstrap`               |

In `withAuth` (Edge mode), for this route:

1. **`redirectForIncompleteOnboarding`**: `ctx.isApi = true` → **skipped** ✅ — the route handler will not be redirected to `/onboarding` by the middleware (which would create an infinite redirect loop)
2. **`rejectUnauthenticatedPrivateRoute`**: enforces Clerk session authentication → unauthenticated requests receive 401 JSON ✅
3. At the time this Route Handler is called, the cookie is **not yet set** (that's what this handler is about to set), so `onboardingComplete = true` → no spurious redirect ✅

The security pipeline protects this route from unauthenticated access. No additional auth check is needed inside the Route Handler itself.

---

## 7. Full Flow After Fix

```
[Clerk SSO completes]
       ↓
Browser navigates to /auth/bootstrap (GET)
       ↓
Edge middleware: isBootstrapRoute=true → passes through to Node handler
       ↓
BootstrapPage (RSC) renders:
  - identitySource.get() → authenticated user
  - provisioningService.ensureProvisioned() → provisions user
  - userRepository.findById() → !user.onboardingComplete
  → redirect('/api/auth/onboarding-pending?redirect_url=/users')
       ↓ [HTTP 307 redirect to browser]
Browser navigates to /api/auth/onboarding-pending?redirect_url=/users (GET)
       ↓
Edge middleware: isApi=true, user authenticated → passes through
       ↓
Route Handler (Node) runs:
  - sanitizeRedirectUrl('/users', '/users') → '/users'
  - cookies().set('__onboarding_pending', '1', {...}) ← LEGAL (Route Handler)
  - return NextResponse.redirect('/onboarding?redirect_url=%2Fusers')
       ↓ [HTTP 307 redirect with Set-Cookie response header]
Browser navigates to /onboarding?redirect_url=/users (GET)
  Browser now has __onboarding_pending=1 cookie
       ↓
Edge middleware: isOnboardingRoute=true → redirectForIncompleteOnboarding skips → passes through
       ↓
/onboarding page loads, form shown ✅

--- [User completes onboarding form] ---

completeOnboarding Server Action:
  - provisioning, profile update, updateOnboardingStatus(true)
  - cookies().delete('__onboarding_pending') ← LEGAL (Server Action) ✅
  - redirect('/users')
       ↓
Edge middleware: no cookie → onboardingComplete=true → no redirect
UsersLayout: ALLOWED → renders ✅

--- [User later visits /users before completing onboarding (e.g. back button)] ---

Browser navigates to /users (GET) with __onboarding_pending=1 cookie
       ↓
Edge middleware: !isOnboardingRoute → onboardingComplete=false → redirect('/onboarding') ← CLEAN HTTP REDIRECT
       ↓
No RSC race. Clean middleware redirect. /onboarding loads. ✅
```

---

## 8. Why This Eliminates the Original Race Condition

**Root cause**: `UsersLayout.redirect('/onboarding')` is a **streaming RSC redirect** — it runs inside the RSC render pipeline and races with Clerk's concurrent `router.refresh()` during post-SSO session finalization. Two concurrent RSC requests to `/onboarding` result in neither committing to the React tree.

**With the cookie-bridge in place**: After the first SSO sign-up, the middleware intercepts any request to `/users` and returns an **HTTP 307 redirect before RSC rendering begins**. The browser performs a clean, single navigation to `/onboarding`. There is no RSC rendering of `/users` at all, so `UsersLayout` never fires its streaming redirect, and Clerk's `router.refresh()` has nothing to race against.

The middleware redirect is atomic and synchronous from the browser's perspective — it receives a 307 before any RSC data arrives. This is architecturally different from the streaming RSC redirect which races with Clerk's refresh.

---

## 9. Stale Cookie Self-Healing (unchanged from prior analysis)

| Cookie state | DB state   | Outcome                                                                                                |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------ |
| Present      | Incomplete | Edge → `/onboarding` → form shown → complete → cookie cleared ✅                                       |
| Present      | Complete   | Edge → `/onboarding` → `OnboardingGuard` detects complete → redirects away ✅                          |
| Absent       | Incomplete | Edge passes through → `UsersLayout` guard → `ONBOARDING_REQUIRED` → RSC redirect (non-SSO, no race) ✅ |
| Absent       | Complete   | Edge passes through → `UsersLayout` ALLOWED → renders ✅                                               |

No infinite loop is possible because `/onboarding` is `isOnboardingRoute=true` — `redirectForIncompleteOnboarding` never fires for it.

---

## 10. Forbidden Patterns (Updated)

These patterns are explicitly forbidden:

| Pattern                                                     | Why forbidden                                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `cookies().set()` in RSC page render                        | Next.js 16 runtime error: "Cookies can only be modified in a Server Action or Route Handler"              |
| `cookies().delete()` in RSC page render                     | Same — runtime error                                                                                      |
| `cookies().set()` in RSC layout                             | Same — runtime error                                                                                      |
| Pre-pipeline raw path check in `proxy.ts`                   | Bypasses `RouteContext` abstraction, duplicates `route-classification.ts`                                 |
| Cookie check in `proxy.ts` before `runSecurityPipeline`     | Must go through `withAuth` where `RouteContext` flags are available                                       |
| Cookie-setting in `users/layout.tsx`                        | Crosses layer boundary — layout must not know about proxy routing mechanism                               |
| Using `__onboarding_pending` cookie as authorization signal | All authorization is DB-backed; cookie is routing-only                                                    |
| Route Handler at `/api/internal/onboarding-pending`         | Would bypass the security pipeline (internal API routes skip `withAuth`) — must be at a non-internal path |
| `httpOnly: false` on the cookie                             | Allows client-side JS manipulation of routing signal                                                      |
| Session cookie (no `maxAge`)                                | Lost on browser close, creates inconsistent state                                                         |
| `sameSite: strict`                                          | Breaks cross-origin redirects from Clerk's auth provider                                                  |

---

## 11. Alignment With Clerk + Next.js App Router Best Practices

The Official Clerk Next.js App Router onboarding docs pattern:

```
[Sign up] → /sign-up → Clerk handles → redirects to app → check onboarding
```

Clerk's own recommended pattern for onboarding flows uses **middleware-level redirect** based on session claims. The recommended approach (from Clerk docs) is:

- Add `completedOnboarding: boolean` to Clerk's public metadata/session claims
- Read it in middleware (`auth().sessionClaims`)
- Redirect to `/onboarding` if incomplete

This repository's design cannot use Clerk JWT session claims because:

1. Clerk public metadata requires an API write (`clerkClient.users.updateUserMetadata`)
2. The boilerplate must be provider-agnostic (Clerk is one of several supported providers)
3. The DB is the source of truth for onboarding state

The cookie-bridge is the architecturally correct provider-agnostic equivalent of the JWT claims approach:

- It moves the routing decision to the middleware layer (same as Clerk's recommended pattern)
- It uses a server-set, `httpOnly` cookie as the signal (equivalent to JWT claims in terms of server-side authority)
- The cookie is provider-agnostic — no Clerk APIs involved in reading or writing it
- The Route Handler write site is the exact legal boundary Next.js 16 requires

This approach is consistent with Clerk's intent (middleware-level onboarding routing) while being provider-agnostic and Next.js 16 runtime-compliant.

---

## 12. Tests to Update

| Test file                                           | Required change                                                                                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/auth/bootstrap/page.test.tsx`              | Update cookie-set tests: `mockCookieSet` should NOT be called; instead verify `redirectMock` is called with `/api/auth/onboarding-pending?redirect_url=...` |
| `src/app/api/auth/onboarding-pending/route.test.ts` | CREATE: test that cookie is set with correct attributes, test that redirect goes to `/onboarding?redirect_url=...`, test `sanitizeRedirectUrl` behavior     |
| `src/app/onboarding/actions.test.ts`                | NO CHANGE — cookie delete test remains valid                                                                                                                |
| `src/security/middleware/with-auth.test.ts`         | NO CHANGE — edge cookie redirect tests remain valid                                                                                                         |

---

## 13. Summary

| Question                                      | Answer                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Is cookie-bridge concept still correct?       | ✅ Yes — concept is sound                                                                                        |
| Where can the cookie be written legally?      | ✅ Route Handler at `src/app/api/auth/onboarding-pending/route.ts`                                               |
| What's the write mechanism?                   | `GET` Route Handler: bootstrap redirects browser here; handler sets cookie + redirects to `/onboarding`          |
| What changes from current impl?               | `bootstrap/page.tsx`: remove `cookies().set()` block; redirect to Route Handler instead. Add Route Handler file. |
| What stays the same?                          | `with-auth.ts` edge cookie read, `actions.ts` cookie delete, `users/layout.tsx`, `proxy.ts`                      |
| Does this fix the race condition?             | ✅ Yes — middleware redirect fires before RSC, no concurrent RSC request to race against                         |
| Is it Clerk + Next.js best practices aligned? | ✅ Yes — middleware-level onboarding routing with server-authority cookie signal                                 |
