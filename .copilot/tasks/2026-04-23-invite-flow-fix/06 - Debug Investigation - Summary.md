# 06 — Debug Investigation Summary

## Task: `2026-04-23-invite-flow-fix`

## Root Causes Found

### Bug 1 — Blocking RouteServer error (`await connection()`)

**File**: `src/app/auth/invite/[token]/page.tsx:101`

**Cause**: `InviteTokenPage` is an async RSC default export that calls `await connection()` directly
at the top level, with no `<Suspense>` wrapper. Next.js 16 `cacheComponents: true` requires
async RSC accessing dynamic data (`connection()`, `headers()`, `cookies()`) to be wrapped in
`<Suspense>`. Without it, the error "Blocking RouteServer — data that blocks navigation was
accessed outside of `<Suspense>`" is thrown.

**Reference pattern**: `src/app/auth/signup/page.tsx` correctly wraps `SignUpPageContent`
(the async inner component that calls `await connection()`) in `<Suspense fallback={null}>`.

**Fix**: Extract async work into `InviteTokenPageContent`, export a sync `InviteTokenPage`
that wraps it in `<Suspense fallback={<LoadingInvitePage />}>`.

---

### Bug 2 — Unauthenticated users redirected to login on invite link

**File**: `src/security/middleware/route-policy.ts`

**Cause**: `/auth/invite` is NOT in `PUBLIC_ROUTE_PREFIXES` and NOT in `AUTH_ROUTE_PREFIXES`.
The `withAuth` middleware in `src/proxy.ts` treats any path that is neither public nor auth-route
as a **protected route** requiring authentication. When an unauthenticated user visits
`/auth/invite/[token]` (e.g., after clicking an invitation email link when not signed in,
or after signing out), `withAuth` redirects them to `/auth/signin?redirect_url=/auth/invite/[token]`.

This is the "redirected to login page" the user sees after signing out.

**Fix**: Add `/auth/invite` to `PUBLIC_ROUTE_PREFIXES`. Invite links by design target new users
who are not yet authenticated. This is the same category as `/waitlist`.

---

### Bug 3 — Authenticated user with DIFFERENT email visiting invite link

**Files**:

- `src/app/auth/invite/[token]/page.tsx` (no session conflict handling)
- `src/app/auth/signup/page.tsx` (session redirect ignores invitation token)
- `src/security/middleware/with-auth.ts` (`redirectAuthenticatedFromAuthRoute`)

**Cause chain**:

1. User A is authenticated (`user-a@example.com`)
2. `/auth/invite/[token]` (for `user-b@example.com`) — after fix B2, middleware now allows through
3. Invite page renders correctly with "Invitation for user-b@example.com"
4. User A clicks "Create account & accept" → `/auth/signup?invitation_token=<token>`
5. **Middleware** fires `redirectAuthenticatedFromAuthRoute`: `/auth/signup` is in `AUTH_ROUTE_PREFIXES`,
   user is authenticated → redirect to `/users` (default). Token is LOST in URL. Invitation never accepted.
6. Even if middleware allowed through, `SignUpPageContent` has `if (session) { redirect('/') }` —
   no special handling for `invitationToken` when session exists.

**Fix**:

- Invite page: Add session detection, show email-mismatch conflict UI if emails differ.
  User is guided to sign out first, with callbackUrl back to the invite page.
- Invite page: If emails match, show "Accept with your current account" button.
- Signup page: When `session` exists AND `invitationToken` is present, redirect back to
  `/auth/invite/[token]` instead of `/` — so the user sees the conflict UI.

---

## Fix Summary

| #   | File                      | Change                                                    |
| --- | ------------------------- | --------------------------------------------------------- |
| 1   | `route-policy.ts`         | Add `/auth/invite` to `PUBLIC_ROUTE_PREFIXES`             |
| 2   | `invite/[token]/page.tsx` | Suspense wrapper + session-aware conflict UI              |
| 3   | `auth/signup/page.tsx`    | Redirect back to invite page when session + token present |

## Impact Assessment

- No schema changes required
- No API route changes required
- Blast radius: 3 files, all within auth/security boundary
- `route-policy.ts` change affects ALL auth providers (correct — invite links are always public)
