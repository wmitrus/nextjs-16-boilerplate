# System-Route Poisoning Analysis

Date: 2026-03-15
Mode: investigation only, no implementation

## 1. Objective

Determine whether redirecting `/.well-known/appspecific/com.chrome.devtools.json` into `/sign-in?redirect_url=...` is the actual trigger of the remaining Clerk development sign-up failure.

Inputs used:

- `clerk-dev-request-trace.md`
- `clerk-dev-request-trace-copilot.md`
- current repository middleware and route classification code
- installed Clerk router runtime code

Note:

- No MCP server tool was available in this session, so this analysis uses the local trace artifacts and repository/runtime code only.

## 2. Verdict

The poisoning path is **real but not confirmed as the actual trigger of the traced failing sign-up flow**.

More specifically:

- `/.well-known/appspecific/com.chrome.devtools.json` is definitely being redirected into `/sign-in?redirect_url=...`
- Clerk's installed router does preserve `redirect_url` across internal auth-route navigation, so poisoning is theoretically possible
- but in the failing sign-up trace, that poisoned `redirect_url` does **not** survive into:
  - the later `GET /sign-up`
  - the later Clerk callback requests
  - the later `GET /auth/bootstrap`

So for the traced failure:

- **poisoning path is disproved as the active trigger**

## 3. Exact Request Order

### 3.1 Contamination branch

This branch is confirmed by the traces.

1. `GET /.well-known/appspecific/com.chrome.devtools.json`
2. repository middleware handles it
3. middleware redirects to:
   - `/sign-in?redirect_url=%2F.well-known%2Fappspecific%2Fcom.chrome.devtools.json`
4. `GET /sign-in?redirect_url=/.well-known/appspecific/com.chrome.devtools.json`

This is the exact point where a bad `redirect_url` value is introduced into the auth surface.

### 3.2 Failing sign-up branch

This branch is also confirmed by the traces.

1. `GET /sign-up`
2. `POST /sign-up`
3. `GET /sign-up/SignUp_clerk_catchall_check_...`
4. `GET /sign-up/sso-callback?sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap&sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
5. `GET /sign-up/sso-callback/SignUp_clerk_catchall_check_...`
6. `POST /sign-up/sso-callback?sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap&sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
7. `GET /auth/bootstrap`

Critical observation:

- the sign-up branch begins with a clean `GET /sign-up`
- there is no `redirect_url=/.well-known/...` on that request

That is the point where the poisoning theory breaks for this run.

## 4. Where Contamination Begins

Exact request where contamination begins:

- `GET /.well-known/appspecific/com.chrome.devtools.json`

Exact middleware branch:

- `rejectUnauthenticatedPrivateRoute(...)` in `src/security/middleware/with-auth.ts:149-160`

Why this request is intercepted:

- `/.well-known/*.json` is not treated as a static file by `src/security/middleware/route-classification.ts:31-34`
- the proxy matcher also includes `.json` requests because `js(?!on)` excludes `.json` from the static-file bypass in `src/proxy.ts:195-199`
- because `/.well-known/*` is not in public routes, it falls into auth protection

Redirect emitted:

- `/sign-in?redirect_url=%2F.well-known%2Fappspecific%2Fcom.chrome.devtools.json`

## 5. Can Clerk Preserve This Poisoning In Principle?

Yes, in principle.

Installed Clerk router behavior:

- `@clerk/shared/dist/runtime/router.js:9-13` preserves:
  - `after_sign_in_url`
  - `after_sign_up_url`
  - `redirect_url`
- `@clerk/shared/dist/runtime/router.js:32-40` copies those params from the current auth-route URL into the destination auth-route URL during internal navigation

Implication:

- if the browser were truly moving from `/sign-in?redirect_url=/.well-known/...` to `/sign-up` through Clerk's internal auth router
- then Clerk could preserve that poisoned `redirect_url`

So the poisoning path is technically plausible.

## 6. Does The Poisoned `redirect_url` Survive Into The Failing Sign-up Flow?

For the traced failing run: **no**.

Evidence:

- the later `GET /sign-up` has no query string
- the later callback requests only contain:
  - `sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap`
  - `sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
- `GET /auth/bootstrap` arrives with no query string

If the poisoned `redirect_url` had survived, it should still be visible on one of those later requests because Clerk preserves `redirect_url` across internal auth navigation.

It is not visible.

## 7. Does The Browser/Client Reuse That `redirect_url` When Clerk Completes Sign-up?

For the traced failure: **not observed**.

What is observed instead:

- Clerk callback requests are carrying `sign_*_force_redirect_url`
- the eventual failing value inside Clerk is `/auth/bootstrap`
- the captured browser exception shows:
  - `e = "/auth/bootstrap"`
  - `t = "http://localhost:3000"`

That points to Clerk's handling of the configured bootstrap redirect target, not to reuse of the poisoned `redirect_url` from `/.well-known/*`.

## 8. Exact Request Where Poisoning Would Need To Affect Clerk Flow

No such request is present in the traced failing run.

The request where it would need to appear, but does not, is:

- the later `GET /sign-up`

Why that request matters:

- it is the bridge between the poisoned sign-in URL and the actual sign-up flow
- because it has no `redirect_url` query, the contamination is already absent before Clerk callback handling begins

So:

- exact request where contamination begins: `GET /.well-known/appspecific/com.chrome.devtools.json`
- exact request where it affects Clerk flow: **none observed**

## 9. Would Excluding `/.well-known/*` Break The Failing Sequence?

It would break the contamination branch, but probably **not** the currently traced failing sign-up branch.

What excluding `/.well-known/*` would do:

- stop the redirect into `/sign-in?redirect_url=/.well-known/...`
- remove an auth-noise source and a real bad redirect injection source

What it would not explain away:

- the sign-up trace still starts with a clean `GET /sign-up`
- Clerk callback requests still carry `sign_*_force_redirect_url`
- Clerk still fails later with `/auth/bootstrap` visible inside the browser exception

Assessment:

- excluding `/.well-known/*` is still a good hygiene fix
- but it is not the strongest candidate for fixing the actual sign-up crash

## 10. Strongest Remaining Root-Cause Candidate

System-route poisoning is **not** the strongest remaining root-cause candidate.

The stronger remaining candidate is:

- Clerk's client-side handling of the configured `/auth/bootstrap` redirect target in development

Why this is stronger:

- the callback requests explicitly carry `sign_in_force_redirect_url` and `sign_up_force_redirect_url`
- the browser exception shows the failing input as `/auth/bootstrap`
- repository traces do not show poisoned `redirect_url` surviving into callback or bootstrap

Relevant repository wiring:

- `src/app/layout.tsx:57-72`
- `src/modules/auth/ui/HeaderAuthControls.tsx:30-59`

Those are the places currently feeding `/auth/bootstrap` into Clerk.

## 11. Minimum Safe Next Fix Target

For containment/hardening:

1. Exclude `/.well-known/*` from auth middleware or classify it as public/system traffic.

For the likely actual Clerk failure:

1. Investigate and normalize the redirect values passed into Clerk in development, especially `/auth/bootstrap`.

The safer sequencing is:

1. Remove `/.well-known/*` interception because it is clearly wrong and noisy.
2. Separately target the Clerk redirect integration, because that remains the stronger candidate for the actual crash.

## 12. Bottom Line

Confirmed:

- `/.well-known/*` is poisoning `/sign-in` with a bad `redirect_url`

Disproved:

- that poisoned `redirect_url` is the active trigger of the traced failing sign-up flow

Reason:

- the contamination never appears on the later `/sign-up`, callback, or `/auth/bootstrap` requests

So the answer is:

- poisoning path exists
- poisoning path is **not** confirmed as the actual failure trigger
- the next safe fix target remains the Clerk redirect integration, with `/.well-known/*` exclusion as a separate cleanup
