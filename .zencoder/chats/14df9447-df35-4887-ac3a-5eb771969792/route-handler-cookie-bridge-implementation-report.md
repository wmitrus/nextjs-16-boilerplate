# Route Handler Cookie-Bridge Implementation Report

**Agent**: Implementation Agent  
**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: 2026-03-18  
**Status**: IMPLEMENTED

---

## 1. Objective

Implement the final runtime-legal cookie-bridge shape:

- Remove illegal `cookies().set()` from RSC page `bootstrap/page.tsx`
- Create Route Handler `src/app/auth/bootstrap/handoff/route.ts` as the legal cookie write site
- Update Clerk post-auth redirect env targets to route through `/auth/bootstrap` instead of directly to `/users`
- Remove investigation probes from production code
- Update and add tests; validate with full suite

---

## 2. Affected Files / Modules

| File                                             | Layer                     | Change  | Touches          |
| ------------------------------------------------ | ------------------------- | ------- | ---------------- |
| `src/app/auth/bootstrap/page.tsx`                | delivery / auth bootstrap | REVISED | runtime behavior |
| `src/app/auth/bootstrap/handoff/route.ts`        | delivery / auth bootstrap | CREATED | runtime behavior |
| `src/app/auth/bootstrap/handoff/route.test.ts`   | testing                   | CREATED | tests            |
| `src/app/auth/bootstrap/page.test.tsx`           | testing                   | UPDATED | tests            |
| `src/app/layout.tsx`                             | delivery / root layout    | REVISED | probe removal    |
| `src/app/onboarding/page.tsx`                    | delivery / onboarding     | REVISED | probe removal    |
| `src/app/components/route-transition-probe.tsx`  | delivery (probe)          | DELETED |                  |
| `src/app/onboarding/onboarding-client-probe.tsx` | delivery (probe)          | DELETED |                  |
| `.env.example`                                   | configuration             | UPDATED | env defaults     |
| `.env.local`                                     | configuration             | UPDATED | env defaults     |

Does NOT touch:

- `src/security/middleware/with-auth.ts` — unchanged, correct
- `src/app/onboarding/actions.ts` — unchanged, correct (legal Server Action)
- `src/app/users/layout.tsx` — unchanged (safety-net redirect kept)
- `src/proxy.ts` — unchanged

---

## 3. Implementation Plan

1. Fix `bootstrap/page.tsx`: remove `import { cookies }` and the `cookieStore.set()` block; change redirect from `/onboarding?...` to `/auth/bootstrap/handoff?redirect_url=...`
2. Create `handoff/route.ts`: GET Route Handler — sanitizes `redirect_url`, sets `__onboarding_pending` cookie legally, redirects to `/onboarding?redirect_url=...`
3. Update `.env.example` and `.env.local`: Clerk fallback/force redirect targets → `/auth/bootstrap?redirect_url=/users`
4. Remove probes: strip `RouteTransitionProbe` import + usage from `layout.tsx`; strip `OnboardingClientProbe` from `onboarding/page.tsx`; delete both probe files
5. Update `page.test.tsx`: remove `mockCookieSet`/`next/headers` mock; update redirect expectations to `/auth/bootstrap/handoff?redirect_url=...`
6. Create `handoff/route.test.ts`: cover cookie set, redirect target, fallback, sanitization, valid path preservation

---

## 4. Changes Made

### `src/app/auth/bootstrap/page.tsx`

- Removed `import { cookies } from 'next/headers';` (line 1)
- Removed 8-line `cookieStore.set(...)` block inside `!user.onboardingComplete` branch
- Changed redirect from `/onboarding?redirect_url=...` to `/auth/bootstrap/handoff?redirect_url=...`

### `src/app/auth/bootstrap/handoff/route.ts` — NEW

```ts
export async function GET(request: NextRequest) {
  const rawRedirectUrl = request.nextUrl.searchParams.get('redirect_url') ?? '';
  const safeTarget = sanitizeRedirectUrl(rawRedirectUrl, '/users');

  const cookieStore = await cookies();
  cookieStore.set('__onboarding_pending', '1', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 604800,
  });

  return NextResponse.redirect(
    new URL(
      `/onboarding?redirect_url=${encodeURIComponent(safeTarget)}`,
      request.url,
    ),
  );
}
```

Legal: Route Handler GET export. `cookies().set()` is permitted in Route Handlers per Next.js 16 docs.

### Route classification for `/auth/bootstrap/handoff`

- `isBootstrapRoute: true` — path starts with `/auth/bootstrap/`
- `isApi: false`
- Security pipeline: bootstrap-route fast path in `withAuth` — verifies Clerk session presence, allows through if authenticated or `UserNotProvisionedError`. Unauthenticated → redirects to `/sign-in`. Correct and secure.

### `.env.example` + `.env.local`

All 4 Clerk redirect variables changed:

```
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/auth/bootstrap?redirect_url=/users
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/auth/bootstrap?redirect_url=/users
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/auth/bootstrap?redirect_url=/users
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/bootstrap?redirect_url=/users
```

Effect: After every sign-in/sign-up, Clerk lands the user on `/auth/bootstrap` (with `redirect_url=/users`). `BootstrapPage` runs provisioning and onboarding checks before any redirect to `/users`. Eliminates the previous race condition where Clerk redirected directly to `/users` while middleware lacked DB access to detect onboarding state.

### Probe removal

- `src/app/layout.tsx`: removed `RouteTransitionProbe` import and JSX usage
- `src/app/onboarding/page.tsx`: removed `OnboardingClientProbe` import and JSX usage; simplified to single `<OnboardingForm />`
- Deleted: `src/app/components/route-transition-probe.tsx`
- Deleted: `src/app/onboarding/onboarding-client-probe.tsx`

### Tests

`page.test.tsx`:

- Removed `mockCookieSet`, `mockCookieDelete`, and `vi.mock('next/headers', ...)` (no longer needed — page no longer imports `next/headers`)
- Updated redirect assertions from `/onboarding?redirect_url=...` to `/auth/bootstrap/handoff?redirect_url=...`
- Removed test "sets \_\_onboarding_pending cookie before redirecting to /onboarding" (behavior moved to Route Handler)
- Removed test "does not set \_\_onboarding_pending cookie when onboarding is already complete" (same reason)

`handoff/route.test.ts` — NEW (5 tests):

- Sets `__onboarding_pending` cookie with correct options
- Redirects to `/onboarding` with sanitized `redirect_url`
- Falls back to `/users` when `redirect_url` is missing
- Sanitizes external `redirect_url` to `/users` (open-redirect prevention)
- Preserves valid internal `redirect_url`

---

## 5. Validation / Verification

```
pnpm typecheck   → PASS
pnpm lint        → PASS (auto-fixed 2 prettier formatting issues)
pnpm arch:lint   → PASS (142 warnings pre-existing, 0 circular deps)
pnpm test        → 772 tests PASS, 1 file failed (drizzle.test.ts — pre-existing, DATABASE_URL missing)
```

---

## 6. Risks / Follow-ups

- **Clerk Redirect URL with query params**: Clerk may or may not pass query parameters in redirect URLs as-is. The `normalizeClerkPostAuthRedirect` function in `layout.tsx` handles this — verify in live test that `/auth/bootstrap?redirect_url=/users` is passed through correctly by Clerk's SDK.
- **`isBootstrapRoute` covers `/auth/bootstrap/handoff`**: The middleware fast-path allows all sub-paths under `/auth/bootstrap/` through after session check. This is correct and intentional, but it means no DB-backed authorization runs for the handoff route. For a pure redirect+cookie-set endpoint with no data access, this is appropriate. Document if adding data access here later.
- **`drizzle.test.ts` pre-existing failure**: Not introduced by this change. Requires `DATABASE_URL` for postgres migration tests. Unblocked.
- **`users/layout.tsx` safety-net redirect**: Kept unchanged as an in-process safety net. With the env redirect change, most users now hit bootstrap before `/users`, so this path fires less often. Can be reviewed for removal in a future session.
