# Clerk Dev Request Trace

Date: 2026-03-15
Mode: investigation only, no code changes applied in this step

## 1. Objective

Trace the failing development sign-up flow request-by-request and verify whether repository middleware is stripping Clerk callback parameters before the flow reaches `/auth/bootstrap`.

## 2. Scope And Evidence

This trace is based on:

- the exact development server logs from the failing run you pasted
- current repository middleware code in:
  - `src/security/middleware/with-auth.ts`
  - `src/security/middleware/route-classification.ts`
  - `src/security/middleware/route-policy.ts`
- current bootstrap behavior in:
  - `src/app/auth/bootstrap/page.tsx`
- current Clerk redirect config wiring in:
  - `src/app/layout.tsx`
  - `src/modules/auth/ui/HeaderAuthControls.tsx`

Important constraint:

- there is no logged `307` from `/sign-up` or `/sign-up/sso-callback` to `/auth/bootstrap` in the failing run
- that matters because the original hypothesis was specifically about repository middleware issuing that redirect and dropping query params

## 3. Middleware Decision Model

Relevant classification/runtime rules:

- `AUTH_ROUTE_PREFIXES = ['/sign-in', '/sign-up']`
- any path starting with `/sign-up/` or `/sign-in/` is treated as `ctx.isAuthRoute === true`
- `redirectAuthenticatedFromAuthRoute()` only redirects when:
  - request is an auth route
  - `userId` is already present
  - no Clerk callback-state params are present
- bootstrap route has its own early branch:
  - `ctx.isBootstrapRoute === true`
  - resolve identity
  - if authenticated, pass through to handler

Current callback-state guard in middleware only checks:

- `__clerk_db_jwt`
- `__clerk_synced`
- `__clerk_redirect_url`
- `__clerk_handshake`
- `__clerk_handshake_nonce`
- `__session`

## 4. Exact Trace Of The Failing Sign-up Run

This is the cleaner failing sequence from the second sign-up attempt in your log.

### Request 1

- Method: `GET`
- Pathname: `/sign-up`
- Query string: none
- Middleware handled it: yes
  - evidence: `with-security` log for `/sign-up`
- Route classification:
  - `isAuthRoute=true`
  - `isPublicRoute=true`
  - `isBootstrapRoute=false`
- `with-auth.ts` branch:
  - auth route request
  - no evidence of authenticated `userId` yet
  - `redirectAuthenticatedFromAuthRoute()` not taken
  - request falls through to handler
- Redirect happened: no
- Response: `200`
- Clerk-owned callback params present: none
- Params preserved: n/a
- Params dropped: none

### Request 2

- Method: `POST`
- Pathname: `/sign-up`
- Query string: none
- Middleware handled it: yes
- Route classification:
  - `isAuthRoute=true`
  - `isPublicRoute=true`
- `with-auth.ts` branch:
  - same as Request 1
  - no middleware redirect
- Redirect happened: no
- Response: `200`
- Clerk-owned callback params present: none
- Params dropped: none

### Request 3

- Method: `GET`
- Pathname: `/sign-up/SignUp_clerk_catchall_check_1773609932790`
- Query string: none
- Middleware handled it: yes
- Route classification:
  - `isAuthRoute=true` because path starts with `/sign-up/`
  - `isPublicRoute=true`
- `with-auth.ts` branch:
  - auth-route pass-through
  - no redirect
- Redirect happened: no
- Response: `200`
- Clerk-owned callback params present: none
- Params dropped: none

### Request 4

- Method: `GET`
- Pathname: `/sign-up/sso-callback`
- Full query string:
  - `sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap`
  - `sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
- Middleware handled it: yes
- Route classification:
  - `isAuthRoute=true`
  - `isPublicRoute=true`
- `with-auth.ts` branch:
  - auth-route request
  - callback-state guard does not trigger because none of the guarded Clerk-owned params are present
  - despite that, response is still `200`, which means middleware did not redirect
  - inference: `userId` was still not established at middleware time for this callback request
- Redirect happened: no
- Response: `200`
- Clerk-owned callback params present:
  - none of the six tracked params
- Params preserved:
  - both `sign_*_force_redirect_url` params remain on the request
- Params dropped by middleware: none

### Request 5

- Method: `GET`
- Pathname: `/sign-up/sso-callback/SignUp_clerk_catchall_check_1773609932925`
- Query string: none
- Middleware handled it: yes
- Route classification:
  - `isAuthRoute=true`
  - `isPublicRoute=true`
- `with-auth.ts` branch:
  - auth-route pass-through
- Redirect happened: no
- Response: `200`
- Clerk-owned callback params present: none
- Params dropped: none

### Request 6

- Method: `POST`
- Pathname: `/sign-up/sso-callback`
- Full query string:
  - `sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap`
  - `sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
- Middleware handled it: yes
- Route classification:
  - `isAuthRoute=true`
  - `isPublicRoute=true`
- `with-auth.ts` branch:
  - same outcome as Request 4
  - no redirect
  - inference: if middleware had treated this as authenticated and redirectable, this would have been a `307`, but it was `200`
- Redirect happened: no
- Response: `200`
- Clerk-owned callback params present:
  - none of the six tracked params
- Params dropped by middleware: none

### Request 7

- Method: `GET`
- Pathname: `/auth/bootstrap`
- Query string: none
- Middleware handled it: yes
- Route classification:
  - `isBootstrapRoute=true`
- `with-auth.ts` branch:
  - bootstrap-route branch at `src/security/middleware/with-auth.ts:271-285`
  - identity resolved successfully
  - request passed through to handler
- Redirect happened in middleware: no
- Response: `200`
- Server-side bootstrap behavior:
  - `src/app/auth/bootstrap/page.tsx:36-37`
  - `redirect_url` absent, so `safeTarget` becomes fallback `/users`
  - provisioning succeeds
  - page later redirects to `/onboarding?redirect_url=%2Fusers`
- Clerk-owned callback params present on request: none
- Params dropped by middleware: none

### Request 8

- Method: `GET`
- Pathname: `/onboarding`
- Query string:
  - `redirect_url=/users`
- Middleware handled it: yes
- Route classification:
  - private route
  - not auth route
  - not bootstrap route
- `with-auth.ts` branch:
  - authenticated private-route pass-through
  - no bootstrap/auth redirect branch involved
- Redirect happened in middleware: no
- Response: `200`
- Params preserved:
  - `redirect_url=/users`
- Params dropped by middleware: none

### Request 9

- Method: `GET`
- Pathname: `/onboarding`
- Query string:
  - `redirect_url=/users`
- Middleware handled it: yes
- Same result as Request 8
- Response: `200`
- Likely cause:
  - App Router refresh / duplicate render after auth-state transition

### Request 10

- Method: `POST`
- Pathname: `/onboarding`
- Query string:
  - `redirect_url=/users`
- Middleware handled it: yes
- `with-auth.ts` branch:
  - authenticated private-route pass-through
- Redirect happened in middleware: no
- Response: `200`
- Params preserved:
  - `redirect_url=/users`

### Request 11

- Method: `GET`
- Pathname: `/`
- Query string: none
- Middleware handled it: yes
- Response: `200`

### Request 12

- Method: `GET`
- Pathname: `/`
- Query string: none
- Middleware handled it: yes
- Response: `200`

## 5. Where The Browser Error Appears

The client exception you captured is:

- `TypeError: Invalid URL`
- inside Clerk JS
- local values shown by DevTools:
  - `e = "/auth/bootstrap"`
  - `t = "http://localhost:3000"`

This is the critical new evidence.

It means:

- by the time Clerk JS throws, the problematic input inside Clerk is already the bare relative path `/auth/bootstrap`
- the failing input is visible inside Clerk's browser runtime
- the server trace does not show middleware issuing a `307` that rewrote a callback URL into that bare path

## 6. Verification Of The Original Middleware-Corruption Hypothesis

### Result

The original hypothesis is **disproved for this failing run**.

### Why

1. No request in the failing `/sign-up` callback sequence returned `307` from `/sign-up` or `/sign-up/sso-callback` to `/auth/bootstrap`.
2. The callback requests that reached middleware contained only:
   - `sign_up_force_redirect_url`
   - `sign_in_force_redirect_url`
3. None of the tracked Clerk-owned dev callback params appeared on those requests:
   - `__clerk_db_jwt`
   - `__clerk_synced`
   - `__clerk_redirect_url`
   - `__clerk_handshake`
   - `__clerk_handshake_nonce`
   - `__session`
4. Because there was no middleware redirect in the callback sequence, middleware had no opportunity to drop those params in this run.
5. The transition from callback handling to `/auth/bootstrap` happened after a `200` callback response, which strongly indicates client-side Clerk navigation, not repository middleware redirect.

## 7. Exact Redirect Where Params Are Lost

For the six Clerk-owned callback/dev params listed above:

- there is **no server-side redirect in the trace** where repository middleware drops them
- therefore there is **no confirmed middleware param-loss event** for this failing run

What the trace does show instead:

- Clerk callback requests complete with `200`
- then the browser moves to `/auth/bootstrap`
- `/auth/bootstrap` arrives with no query string

So the param collapse happens here:

- **between the successful `/sign-up/sso-callback` client flow and the subsequent browser navigation to `/auth/bootstrap`**
- that transition is occurring in Clerk/browser code, not in an observed repository redirect response

## 8. `/.well-known/*` Trace

The logs also show this separate system-route behavior:

### Request A

- Method: `GET`
- Pathname: `/.well-known/appspecific/com.chrome.devtools.json`
- Middleware handled it: yes
- Route classification:
  - not public
  - not auth route
  - not bootstrap route
- `with-auth.ts` branch:
  - `rejectUnauthenticatedPrivateRoute()` at `src/security/middleware/with-auth.ts:319-325`
- Redirect happened: yes
- Redirect target:
  - `/sign-in?redirect_url=%2F.well-known%2Fappspecific%2Fcom.chrome.devtools.json`
- Params preserved:
  - `redirect_url` containing the system path
- Clerk-owned callback params dropped: none

### Request B

- Method: `GET`
- Pathname: `/sign-in`
- Query string:
  - `redirect_url=/.well-known/appspecific/com.chrome.devtools.json`
- Middleware handled it: yes
- Route classification:
  - `isAuthRoute=true`
  - `isPublicRoute=true`
- Result:
  - `200`

Assessment:

- yes, `/.well-known/*` can currently be redirected into `/sign-in`
- this is real
- but it is separate from the failing sign-up callback trace
- it is noise and could confuse auth flows, but it is not the proven source of the `Invalid URL` exception above

## 9. Root-Cause Verdict

### Confirmed

- repository middleware is **not** the component corrupting Clerk callback params in this traced failing run
- the sign-up callback requests reach the app and return `200`
- `/auth/bootstrap` is reached afterwards without any logged repository redirect from `/sign-up` or `/sign-up/sso-callback`
- the `Invalid URL` is being thrown inside Clerk browser code with `/auth/bootstrap` already present as the failing input

### Disproved

- the earlier theory that `with-auth.ts` is dropping Clerk callback params on auth-route redirect is **not supported by this run**

## 10. Minimum Safe Next Fix Target

The safest next target is now:

- **Clerk-facing redirect URL normalization in the client integration layer**

Most likely minimal fix target files:

- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`

Why:

- these are the places where the app feeds redirect values into Clerk:
  - `ClerkProvider` props in `src/app/layout.tsx:57-72`
  - `SignInButton` / `SignUpButton` props in `src/modules/auth/ui/HeaderAuthControls.tsx:30-59`
- the browser exception shows Clerk still receiving `/auth/bootstrap` as a bare relative value at failure time
- the failing trace no longer points at middleware stripping

Practical next investigation/fix direction:

1. Normalize Clerk redirect props to absolute URLs in development before passing them into Clerk UI/provider props.
2. Keep app-internal redirects and bootstrap logic unchanged.
3. Separately consider exempting `/.well-known/*` from auth redirects to remove unrelated sign-in noise.

## 11. Bottom Line

For this failing run:

- middleware handling is visible
- middleware param stripping is **not**
- the failure shifts to Clerk's client-side URL handling after callback completion

That makes the next safe fix target:

- **the values we pass into Clerk**
- not `with-auth.ts`
