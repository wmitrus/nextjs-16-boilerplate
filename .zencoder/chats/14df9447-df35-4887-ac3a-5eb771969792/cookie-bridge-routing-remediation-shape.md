# Cookie-Bridge Routing Remediation Shape

**Agent**: Architecture Guard  
**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: 2026-03-18  
**Decision**: **APPROVED WITH MODIFICATIONS**

---

## 1. Objective

Review the proposed cookie-bridge solution for the `/users → /onboarding` navigation hang, given the confirmed Edge-runtime constraint on `src/proxy.ts`. Determine the minimum safe, architecturally sound final fix shape.

---

## 2. Confirmed Runtime Constraint

`src/proxy.ts` is compiled and runs as Next.js middleware in the **Edge runtime**.

Evidence from the build output:

```
"[project]/src/proxy.ts [middleware] (ecmascript)"
```

**Consequence**: `src/proxy.ts` cannot call Drizzle/PGLite. The originally approved "move redirect to proxy layer" instruction is correct in principle but the DB-lookup implementation mechanism is unavailable. A cookie-based signal is the only viable mechanism.

---

## 3. Current-State Findings

### `src/security/middleware/with-auth.ts` (lines 291–316)

The `withAuth` middleware already contains:

1. `resolveOnboardingComplete` — DB lookup via `userRepository.findById`
2. `redirectForIncompleteOnboarding` — correct redirect function using `RouteContext` flags:
   - skips when: `!userId || ctx.isOnboardingRoute || ctx.isPublicRoute || ctx.isApi`
   - redirects when: `!onboardingComplete`

Both are disabled in edge mode:

```ts
const onboardingComplete = isNodeMode(options)
  ? await resolveOnboardingComplete(options.userRepository, userId)
  : true;  // edge: DB unavailable, always true

if (isNodeMode(options)) {  // gate: redirect only in Node mode
  const onboardingRedirect = redirectForIncompleteOnboarding(...);
  if (onboardingRedirect) return onboardingRedirect;
}
```

The entire onboarding redirect infrastructure is already present in `withAuth`. The only thing missing is the signal. The cookie bridges exactly this gap.

### `src/proxy.ts`

The security pipeline flows:

1. `withSecurity` → produces `RouteContext` (via `classifyRequest`)
2. `withInternalApiGuard`
3. `withRateLimit`
4. `withAuth` (edge mode) → onboarding redirect disabled
5. `terminalHandler`

A raw cookie check placed **before** `runSecurityPipeline` in `proxy.ts` would have no `RouteContext` and would require manual path matching that duplicates `route-classification.ts` logic. This is forbidden. The correct placement is **inside `withAuth`**, where `RouteContext` and `redirectForIncompleteOnboarding` already exist.

### `src/app/auth/bootstrap/page.tsx` (line 222–238)

Bootstrap correctly detects `!user.onboardingComplete` and redirects to `/onboarding`. No cookie is currently set. This is the correct node to SET the cookie before redirect.

### `src/app/onboarding/actions.ts` (line 167)

`updateOnboardingStatus(internalUserId, true)` sets onboarding complete in DB. No cookie is currently cleared. This is the correct node to CLEAR the cookie.

### `src/app/users/layout.tsx` (line 94–96)

```ts
if (access.status === 'ONBOARDING_REQUIRED') {
  redirect('/onboarding');
}
```

This is a Node.js guard backed by `resolveNodeProvisioningAccess`. It must remain unchanged as the safety net. The layout must NOT set the cookie. Reasons below.

### No existing `cookies()` usage

Grep confirms no production files currently use `cookies()` from `next/headers`. The cookie API would be introduced for the first time in `bootstrap/page.tsx` and `actions.ts`.

---

## 4. Architectural Assessment

### Question 1: Is a cookie-based routing signal acceptable architecture?

**YES — with the following classification:**

The `__onboarding_pending` cookie is a **routing hint**, not an authorization control. Its presence or absence does not grant or deny access to any resource. Actual access control is always enforced server-side:

- `resolveNodeProvisioningAccess` in `UsersLayout` — DB-backed Node.js guard
- `OnboardingGuard` in `OnboardingLayout` — DB-backed Node.js guard

Cookie forge scenarios are both safe:

- **User removes cookie**: proxy passes through → layout guard fires via DB check → correctly handled
- **User fabricates cookie**: proxy redirects to `/onboarding` → `OnboardingGuard` DB check validates state → if already complete, redirects to target → correct
- Neither forge path bypasses DB-level authorization

**The cookie is acceptable as a routing signal because authorization is never derived from it.**

### Question 2: Is it the best available fix under Edge-runtime constraint?

**YES.** The alternatives are:

| Option                                  | Verdict                                                         |
| --------------------------------------- | --------------------------------------------------------------- |
| DB lookup in proxy.ts                   | Impossible — Edge runtime                                       |
| Clerk JWT custom claims                 | Requires Clerk dashboard config — external system, not in scope |
| Pre-pipeline raw path check in proxy.ts | Duplicates `route-classification.ts` logic — forbidden          |
| Client-side redirect in UsersLayout     | Changes guard to presentation concern — wrong layer             |
| Cookie signal via `withAuth`            | Correct — surfaces through established security abstraction     |

### Question 3: Which parts of the proposed shape are correct?

| Proposed change                                 | Decision                      | Reason                                                                      |
| ----------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `bootstrap/page.tsx` sets cookie                | ✅ APPROVED                   | Correct placement, correct lifecycle node                                   |
| `actions.ts` clears cookie                      | ✅ APPROVED                   | Correct placement, correct lifecycle node                                   |
| Proxy early-exit before pipeline                | ❌ REJECTED                   | Bypasses `RouteContext`, duplicates path matching                           |
| `withAuth` reads cookie in edge mode            | ✅ APPROVED (see shape below) | Uses established abstraction and existing `redirectForIncompleteOnboarding` |
| `users/layout.tsx` sets cookie as self-healing  | ❌ REJECTED                   | See Question 4                                                              |
| `users/layout.tsx` keeps redirect as safety net | ✅ APPROVED                   | Layer is correct; safety net is necessary                                   |

### Question 4: Should `users/layout.tsx` set the cookie as self-healing fallback?

**NO — explicitly rejected.**

Reasons:

1. **Ownership violation**: `UsersLayout` is an access-control guard. The cookie is a proxy routing signal. The layout must not know about the proxy's cookie mechanism. Injecting cookie-setting into the guard couples two separate concerns across layers.
2. **Unnecessary**: Bootstrap always runs before `ONBOARDING_REQUIRED` can be reached in the SSO flow. Bootstrap is the correct and only node for setting the cookie.
3. **Race condition does not apply to the non-SSO case**: The layout redirect only races with Clerk's `router.refresh()` during SSO session finalization. Regular navigation (non-SSO, e.g. returning user, expired cookie) does not trigger concurrent `router.refresh()`. So the layout redirect in the cookie-missing case is safe — there is no race to fix.
4. **Clean separation must be preserved**: proxy layer knows about cookie. layout layer knows about DB state. They must not cross-pollinate.

**The layout stays clean.** If the cookie is missing and a user hits `/users` with `ONBOARDING_REQUIRED`, the layout redirect fires as a streaming RSC redirect, which is a safe fallback for non-SSO navigation.

---

## 5. Approved Final Fix Shape

### File targets

| File                                   | Change                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/security/middleware/with-auth.ts` | Read cookie in edge mode; remove `isNodeMode` gate on `redirectForIncompleteOnboarding` |
| `src/app/auth/bootstrap/page.tsx`      | Set `__onboarding_pending` cookie before `redirect('/onboarding')`                      |
| `src/app/onboarding/actions.ts`        | Clear `__onboarding_pending` cookie after `updateOnboardingStatus(true)`                |
| `src/app/users/layout.tsx`             | **NO CHANGE** — keep redirect as safety net                                             |
| `src/proxy.ts`                         | **NO CHANGE** — cookie check flows through `withAuth`                                   |

### `with-auth.ts` — approved change

Replace lines 291–316 (the `onboardingComplete` determination and the `isNodeMode`-gated redirect):

```ts
// Current (to be replaced):
const onboardingComplete = isNodeMode(options)
  ? await resolveOnboardingComplete(options.userRepository, userId)
  : true;

// 2. Enforce onboarding for private routes
if (isNodeMode(options)) {
  const onboardingRedirect = redirectForIncompleteOnboarding(
    req,
    ctx,
    userId,
    onboardingComplete,
  );
  if (onboardingRedirect) return onboardingRedirect;
}
```

```ts
// Approved replacement:
const onboardingComplete = isNodeMode(options)
  ? await resolveOnboardingComplete(options.userRepository, userId)
  : req.cookies.get('__onboarding_pending')?.value !== '1';

// 2. Enforce onboarding for private routes (both Node and Edge modes)
const onboardingRedirect = redirectForIncompleteOnboarding(
  req,
  ctx,
  userId,
  onboardingComplete,
);
if (onboardingRedirect) return onboardingRedirect;
```

**Why removing the `isNodeMode` gate is correct:**

- In Node mode without DB result: `onboardingComplete = true` → `redirectForIncompleteOnboarding` returns null → no redirect ✓
- In Edge mode with no cookie: `onboardingComplete = true` (cookie absent → `!== '1'` is true) → no redirect ✓
- In Edge mode with cookie: `onboardingComplete = false` → `redirectForIncompleteOnboarding` evaluates route flags and redirects ✓
- The existing `redirectForIncompleteOnboarding` function already guards against all incorrect cases (null userId, public routes, onboarding routes, API routes) — no duplication needed

### `bootstrap/page.tsx` — approved change

At line 222, before `redirect('/onboarding...')`:

```ts
// Import at top of file:
import { cookies } from 'next/headers';

// At line 222, before redirect:
if (!user.onboardingComplete) {
  // Set cookie BEFORE redirect — signals proxy to intercept /users before RSC starts
  const cookieStore = await cookies();
  cookieStore.set('__onboarding_pending', '1', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days — cleared explicitly on completion
  });
  // ... existing logger.info ...
  redirect(`/onboarding?redirect_url=${encodeURIComponent(safeTarget)}`);
}
```

### `actions.ts` — approved change

After `updateOnboardingStatus(internalUserId, true)` succeeds, before `redirect(safeRedirectUrl)`:

```ts
// Import at top of file:
import { cookies } from 'next/headers';

// After updateOnboardingStatus, before redirect:
await userRepository.updateOnboardingStatus(internalUserId, true);
const cookieStore = await cookies();
cookieStore.delete('__onboarding_pending');
// ... existing logger.debug ...
// redirect(safeRedirectUrl) — unchanged
```

---

## 6. Required Cookie Semantics

| Attribute  | Value                           | Reason                                                                                                                     |
| ---------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Name       | `__onboarding_pending`          | Double-underscore prefix marks internal system cookies                                                                     |
| Value      | `'1'`                           | Simple presence signal; no sensitive data                                                                                  |
| `httpOnly` | `true`                          | Prevents client-side JS access                                                                                             |
| `secure`   | `env.NODE_ENV === 'production'` | HTTPS enforcement in production                                                                                            |
| `sameSite` | `'lax'`                         | Correct for first-party cookies that survive top-level navigation                                                          |
| `path`     | `'/'`                           | Must be accessible by Edge middleware for all protected routes                                                             |
| `maxAge`   | `60 * 60 * 24 * 7` (7 days)     | Long enough for any reasonable onboarding session; cleared explicitly on completion; expires naturally if completion fails |

**Not acceptable:**

- `sameSite: 'strict'` — would break cross-origin redirects from auth provider
- `sameSite: 'none'` — requires `secure: true` always, not needed here
- No `maxAge` (session cookie) — would be lost on browser close mid-onboarding, creating inconsistent state
- `maxAge > 30 days` — a stale uncleared cookie should expire, not persist indefinitely

---

## 7. Forbidden Patterns

1. **Pre-pipeline raw path check in `proxy.ts`** — bypasses `RouteContext` abstraction, duplicates path-matching logic from `route-classification.ts`
2. **Cookie-setting in `users/layout.tsx`** — crosses layer boundary; layout must not know about proxy routing mechanism
3. **Using the cookie as an authorization signal** — all authorization is DB-backed and server-side; the cookie is routing-only
4. **`httpOnly: false`** — allows JS manipulation of the routing signal
5. **Setting cookie in any client component** — the lifecycle must remain entirely server-side
6. **Not clearing the cookie on completion** — would cause redirect loops for the stale-cookie case (proxy always redirecting to `/onboarding`)
7. **Setting cookie in `users/layout.tsx`** — explicitly forbidden; see Question 4
8. **Checking the cookie directly in `proxy.ts` before the security pipeline** — the security pipeline's route classification must not be bypassed; cookie check belongs inside `withAuth` where route flags are available

---

## 8. Stale Cookie Risk Assessment

**Scenario**: Cookie persists after `updateOnboardingStatus(true)` (server action failure, partial write, browser cache).

| State                          | What happens                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Cookie present, DB: complete   | Proxy redirects to `/onboarding` → `OnboardingGuard` detects complete → redirects to target → user lands correctly on next navigation |
| Cookie present, DB: incomplete | Proxy redirects to `/onboarding` → form shown → submit → DB updated + cookie cleared → redirects to `/users` ✓                        |
| Cookie absent, DB: incomplete  | Proxy passes through → `UsersLayout` guard fires (streaming RSC redirect) → non-SSO case, no Clerk `router.refresh()`, no race ✓      |
| Cookie absent, DB: complete    | Proxy passes through → `UsersLayout` guard: ALLOWED → renders ✓                                                                       |

The only potentially surprising case is stale cookie + DB complete, but it self-heals in one navigation without user action (the `OnboardingGuard` redirect resolves it). No infinite loop is possible because:

- The proxy redirects to `/onboarding`, not to `/users`
- `/onboarding` is `isOnboardingRoute = true` — `redirectForIncompleteOnboarding` skips the redirect for `/onboarding` itself
- The `OnboardingGuard` on `/onboarding` handles the complete-but-stale case with a redirect to the target

---

## 9. Missing Evidence / Uncertainty

**Confirmed**: `cookies()` from `next/headers` is async in Next.js 16 and requires `await`. This is consistent with Next.js 15+ behavior. Both `bootstrap/page.tsx` and `actions.ts` are async functions, so `await cookies()` is valid.

**Assumption to verify during implementation**: The `cookies()` API is available in `bootstrap/page.tsx` (a server component) and `actions.ts` (a server action). Both should have access — server components and server actions both execute in the Node.js runtime with full `next/headers` access.

**Assumption to verify during implementation**: In `withAuth`, `req.cookies.get('__onboarding_pending')` is available because `req` is `NextRequest` which has `.cookies` as a `RequestCookies` object readable in Edge runtime. This is standard Next.js middleware API and confirmed correct.

---

## 10. Recommended Next Action

**Implementation Agent** may proceed with:

1. `src/security/middleware/with-auth.ts` — minimal two-part change (cookie read + gate removal)
2. `src/app/auth/bootstrap/page.tsx` — set cookie before onboarding redirect
3. `src/app/onboarding/actions.ts` — clear cookie after successful completion

Validation required:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm arch:lint`
- `pnpm test` (update affected test files: `with-auth.test.ts`, `bootstrap/page.test.tsx`, `actions.test.ts`, `proxy.test.ts`)

**Do not** modify `src/app/users/layout.tsx` or `src/proxy.ts`.
