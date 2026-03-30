# Clerk Dev Sign-up Request Trace

## Scope

Objective: verify whether repository middleware strips Clerk-owned callback parameters during the failing development sign-up flow.

Constraint: investigation only. No implementation.

## Conclusion

Root cause **not confirmed**.

The currently checked-in middleware in `src/security/middleware/with-auth.ts` does **not** strip Clerk callback parameters from `/sign-in` or `/sign-up` callback-style requests. In live `pnpm dev` probing:

- an authenticated plain `/sign-up` request redirected to `/auth/bootstrap`
- an authenticated callback-style `/sign-up?__clerk_db_jwt=...&redirect_url=%2Fusers` request returned `200 OK`
- the callback-style request preserved the full query string via `x-middleware-rewrite`

That directly disproves the suspected corruption path in `redirectAuthenticatedFromAuthRoute(...)` for the current source tree.

Separate issue confirmed: `/.well-known/appspecific/com.chrome.devtools.json` is matched by the proxy and redirected to `/sign-in?redirect_url=...`. That is a real system-route redirect, but it is not Clerk callback-param loss.

## Source-Level Branch Mapping

Relevant logic in `src/security/middleware/with-auth.ts`:

- `redirectAuthenticatedFromAuthRoute(req, ctx, userId)` only runs when `userId` is present and `ctx.isAuthRoute` is true.
- `hasClerkCallbackState(req)` returns true when any of these query params are present:
  - `__clerk_db_jwt`
  - `__clerk_synced`
  - `__clerk_redirect_url`
  - `__clerk_handshake`
  - `__clerk_handshake_nonce`
  - `__session`
- when `hasClerkCallbackState(req)` is true, `redirectAuthenticatedFromAuthRoute(...)` returns `null`, so the request is allowed through
- when the request is an authenticated auth-route request **without** Clerk callback state, middleware redirects to `/auth/bootstrap`, preserving only `redirect_url` if present

Relevant route classification in `src/security/middleware/route-classification.ts`:

- `/sign-in` and `/sign-up` are `isAuthRoute = true`
- auth routes are also `isPublicRoute = true`
- `/.well-known/*.json` is **not** treated as a static file because `.json` is excluded from the static-file regex

## Request Trace

### Request 1

- Request: `HEAD /.well-known/appspecific/com.chrome.devtools.json`
- Full query string: none
- Observed auth state: signed out (`x-clerk-auth-status: signed-out`, `x-clerk-auth-reason: dev-browser-missing`)
- Middleware handled it: yes
- Route classification: not public, not auth route, not static file
- Executed branch in `with-auth.ts`: `rejectUnauthenticatedPrivateRoute(...)`
- Result: `307 Temporary Redirect`
- Redirect target: `/sign-in?redirect_url=%2F.well-known%2Fappspecific%2Fcom.chrome.devtools.json`
- Preserved query params: original requested path preserved inside `redirect_url`
- Dropped Clerk-owned params: none were present

Interpretation: the proxy currently treats this `/.well-known/*` request as a private page request and redirects it into sign-in.

### Request 2

- Request: `HEAD /sign-up?__clerk_db_jwt=test-token&redirect_url=%2Fusers`
- Full query string: `__clerk_db_jwt=test-token&redirect_url=%2Fusers`
- Observed auth state: signed out (`x-clerk-auth-status: signed-out`, `x-clerk-auth-reason: dev-browser-sync`)
- Middleware handled it: yes
- Route classification: auth route, public route
- Executed branch in `with-auth.ts`:
  - `redirectAuthenticatedFromAuthRoute(...)` evaluated, but `userId` was absent so it returned `null`
  - `rejectUnauthenticatedPrivateRoute(...)` returned `null` because auth routes are public routes
- Result: `200 OK`
- Redirect target: none
- Preserved query params: yes, full query string preserved in `x-middleware-rewrite: /sign-up?__clerk_db_jwt=test-token&redirect_url=%2Fusers`
- Dropped Clerk-owned params: none observed

Interpretation: callback-style sign-up URLs are not being redirected away while signed out.

### Request 3

- Request: `HEAD /sign-up`
- Full query string: none
- Auth method used: Clerk backend session JWT sent as `Authorization: Bearer <token>`
- Middleware handled it: yes
- Route classification: auth route, public route
- Executed branch in `with-auth.ts`: `redirectAuthenticatedFromAuthRoute(...)`
- Result: `307 Temporary Redirect`
- Redirect target: `/auth/bootstrap`
- Preserved query params: none, because none were present
- Dropped Clerk-owned params: none were present

Interpretation: this is the expected authenticated auth-route redirect branch.

### Request 4

- Request: `HEAD /sign-up?__clerk_db_jwt=test-token&redirect_url=%2Fusers`
- Full query string: `__clerk_db_jwt=test-token&redirect_url=%2Fusers`
- Auth method used: Clerk backend session JWT sent as `Authorization: Bearer <token>`
- Middleware handled it: yes
- Route classification: auth route, public route
- Executed branch in `with-auth.ts`:
  - `redirectAuthenticatedFromAuthRoute(...)` saw authenticated auth-route access
  - `hasClerkCallbackState(req)` returned true because `__clerk_db_jwt` was present
  - redirect branch was bypassed and control fell through to the handler
- Result: `200 OK`
- Redirect target: none
- Preserved query params: yes, full query string preserved in `x-middleware-rewrite: /sign-up?__clerk_db_jwt=test-token&redirect_url=%2Fusers`
- Dropped Clerk-owned params: none observed

Interpretation: this is the decisive control test. The exact suspected branch is present and does **not** corrupt the callback-style request in live dev.

### Request 5

- Request: `HEAD /sign-up?__clerk_db_jwt=test-token&redirect_url=%2Fusers`
- Full query string: `__clerk_db_jwt=test-token&redirect_url=%2Fusers`
- Auth method used: `Cookie: __session=<token>`
- Middleware handled it: yes
- Observed auth state: signed out (`x-clerk-auth-status: signed-out`, `x-clerk-auth-reason: dev-browser-sync`)
- Executed branch in `with-auth.ts`:
  - `redirectAuthenticatedFromAuthRoute(...)` did not redirect because Clerk dev browser sync still reported signed out for this probe shape
  - `rejectUnauthenticatedPrivateRoute(...)` returned `null` because auth routes are public routes
- Result: `200 OK`
- Redirect target: none
- Preserved query params: yes, full query string preserved in `x-middleware-rewrite`
- Dropped Clerk-owned params: none observed

Interpretation: cookie-only probing is less reliable in Clerk dev mode, but still does not show callback-param stripping.

## Evidence From Tests

Existing tests already encode the same intended behavior:

- `src/security/middleware/with-auth.test.ts` contains unit tests asserting pass-through for auth routes when any Clerk callback param is present
- `src/testing/integration/middleware.test.ts` contains `should allow Clerk callback state to complete on auth routes`

These tests are consistent with the live runtime probes.

## What Was Not Reproduced

- A full browser-level hosted sign-up trace was **not** captured locally because Playwright browser launch failed after install due a missing system library: `libnspr4.so`
- A true third-party OAuth callback trace was **not** available because local env did not define `E2E_CLERK_OAUTH_PROVIDER`

Those gaps limit the investigation to same-origin Clerk dev callback-style URLs and direct HTTP probes, but they do not weaken the specific conclusion about `with-auth.ts` in the current tree.

## Answer To The Original Hypothesis

Hypothesis: `with-auth.ts` redirects authenticated `/sign-in` or `/sign-up` callback requests to `/auth/bootstrap` while preserving only `redirect_url` and dropping Clerk-owned callback params.

Verdict: **disproved for the current source and live dev runtime**.

- plain authenticated `/sign-up` does redirect to `/auth/bootstrap`
- authenticated callback-style `/sign-up?__clerk_db_jwt=...&redirect_url=...` does **not** redirect
- no observed request dropped `__clerk_db_jwt`, `__clerk_synced`, `__clerk_redirect_url`, `__clerk_handshake`, `__clerk_handshake_nonce`, or `__session`

## Minimum Safe Next Fix Target

If the user-visible sign-up failure still reproduces, the minimum safe next target is **not** `redirectAuthenticatedFromAuthRoute(...)`.

The safest next investigation target is one of these:

1. proxy matcher / route classification for system routes such as `/.well-known/*`, because those are currently redirected into sign-in
2. the Clerk-hosted or dev-browser request that precedes the callback-style `/sign-up?...__clerk_*...` URL, since the callback-style request itself is surviving middleware intact
3. local browser/runtime dependencies needed to capture a real browser request waterfall, because current environment could not launch Chromium due missing `libnspr4.so`

## Bottom Line

No live evidence shows repository middleware stripping Clerk callback parameters from auth-route callback URLs in the current branch. The separately reproducible middleware issue is broader system-route interception of `/.well-known/*`, not Clerk callback-param loss.
