# System-Route Redirect Poisoning Analysis

## Objective

Determine whether redirecting `/.well-known/*` into `/sign-in?redirect_url=...` is the actual trigger of the remaining Clerk development sign-up failure.

Inputs used:

- `clerk-dev-request-trace.md`
- `clerk-dev-request-trace-copilot.md`
- current middleware and Clerk wiring in the repository
- installed Clerk client runtime code

Constraint: investigation only. No implementation.

## Conclusion

System-route redirect poisoning is **disproved as the actual trigger of the traced failing sign-up flow**.

It is a **real contamination source**:

- `/.well-known/appspecific/com.chrome.devtools.json` is redirected to `/sign-in?redirect_url=%2F.well-known%2Fappspecific%2Fcom.chrome.devtools.json`
- Clerk's installed router preserves `redirect_url` across internal auth-route navigation

So the poisoning path is technically possible.

But the failing sign-up sequence in `clerk-dev-request-trace.md` does **not** carry that poisoned `redirect_url` forward:

- the later `/sign-up` request has **no query string**
- the later callback requests contain only `sign_in_force_redirect_url` and `sign_up_force_redirect_url`
- `/auth/bootstrap` is reached with **no `redirect_url` query**

That means the traced failure is not explained by the `/.well-known/*` redirect poisoning path.

## Key Findings

### 1. Where contamination begins

Contamination begins here:

- request: `GET /.well-known/appspecific/com.chrome.devtools.json`
- middleware branch: `rejectUnauthenticatedPrivateRoute(...)`
- response: `307 Temporary Redirect`
- redirect target: `/sign-in?redirect_url=%2F.well-known%2Fappspecific%2Fcom.chrome.devtools.json`

That is the exact point where a bad `redirect_url` is injected into an auth route.

### 2. Clerk can preserve that contamination in principle

Installed Clerk runtime code in `@clerk/shared/dist/runtime/router.js` preserves these query parameters during internal auth-route navigation:

- `after_sign_in_url`
- `after_sign_up_url`
- `redirect_url`

Relevant behavior:

- when Clerk navigates internally between auth screens, it copies those query params from the current URL to the destination URL

Implication:

- if the browser is currently on `/sign-in?redirect_url=/.well-known/...`
- and Clerk internally routes to `/sign-up`
- Clerk can produce `/sign-up?redirect_url=/.well-known/...`

So the poisoning path is plausible at the client-router level.

### 3. The traced failing sign-up flow does not show that contamination surviving

Observed failing sign-up sequence from `clerk-dev-request-trace.md`:

1. `GET /sign-up`
2. `POST /sign-up`
3. `GET /sign-up/SignUp_clerk_catchall_check_...`
4. `GET /sign-up/sso-callback?sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap&sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
5. `GET /sign-up/sso-callback/SignUp_clerk_catchall_check_...`
6. `POST /sign-up/sso-callback?sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap&sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
7. `GET /auth/bootstrap`

What is missing from that sequence:

- no `redirect_url=/.well-known/...` on `/sign-up`
- no `redirect_url=/.well-known/...` on callback requests
- no `redirect_url=/.well-known/...` on `/auth/bootstrap`

This is the decisive negative evidence.

If the poisoned `redirect_url` from `/.well-known/*` had actually survived into the failing sign-up run, it should still be visible on the later auth-route URLs because Clerk preserves it across internal auth navigation.

It is not visible.

### 4. The failing error points somewhere else

`clerk-dev-request-trace.md` records the Clerk-side client exception as:

- `TypeError: Invalid URL`
- local values in DevTools:
  - `e = "/auth/bootstrap"`
  - `t = "http://localhost:3000"`

That matters because the failing value visible at crash time is `/auth/bootstrap`, not `/.well-known/appspecific/com.chrome.devtools.json`.

This repository also currently injects these Clerk redirect props from env:

- `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/auth/bootstrap`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/bootstrap`

Those values are wired into Clerk through:

- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`

So the remaining failure is more directly aligned with Clerk's handling of `/auth/bootstrap` than with a poisoned `redirect_url` from `/.well-known/*`.

## Exact Request Order

### Observed poisoning branch

This request order is confirmed:

1. `GET /.well-known/appspecific/com.chrome.devtools.json`
2. `307 -> /sign-in?redirect_url=%2F.well-known%2Fappspecific%2Fcom.chrome.devtools.json`
3. `GET /sign-in?redirect_url=/.well-known/appspecific/com.chrome.devtools.json`

That establishes the contamination source.

### Observed failing sign-up branch

This request order is confirmed from the failing sign-up trace:

1. `GET /sign-up`
2. `POST /sign-up`
3. `GET /sign-up/SignUp_clerk_catchall_check_...`
4. `GET /sign-up/sso-callback?sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap&sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
5. `GET /sign-up/sso-callback/SignUp_clerk_catchall_check_...`
6. `POST /sign-up/sso-callback?sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap&sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
7. `GET /auth/bootstrap`

### Missing bridge between the two branches

What is **not** confirmed anywhere in the evidence:

1. `GET /sign-in?redirect_url=/.well-known/...`
2. internal Clerk navigation to `/sign-up?redirect_url=/.well-known/...`
3. callback request carrying that same `redirect_url`
4. `/auth/bootstrap?redirect_url=/.well-known/...`

That missing bridge is why the poisoning path is not confirmed as the actual trigger.

## Whether redirect_url survives into later Clerk flow

Answer: **not in the traced failing run**.

What is proven:

- Clerk would preserve `redirect_url` across internal auth-route navigation in principle

What is observed in the failure:

- later Clerk flow requests do not contain the poisoned `redirect_url`

Therefore:

- survival is possible in theory
- survival is **not observed** in the failing sign-up trace

## Whether the browser/client reuses that redirect_url when Clerk completes sign-up

Answer: **not proven, and the traced failure argues against it**.

Reasoning:

- if the client had reused the poisoned `redirect_url`, it should be visible on later `/sign-up`, callback, or `/auth/bootstrap` requests
- none of those requests contain it
- instead, Clerk callback requests contain only `sign_in_force_redirect_url` and `sign_up_force_redirect_url`

So the browser/client reuse path is not supported by the actual failing request sequence.

## Whether excluding `/.well-known/*` would break the failing sequence

Answer: **it would break the poisoning sequence at its source, but it would probably not break the currently observed failing sign-up sequence**.

Why:

- excluding `/.well-known/*` from auth middleware would stop the initial redirect to `/sign-in?redirect_url=...`
- that would remove this contamination vector entirely

But:

- the failing sign-up sequence we actually traced does not include the poisoned `redirect_url`
- so removing `/.well-known/*` interception is unlikely to eliminate the still-observed Clerk `Invalid URL` failure by itself

It is still a good containment move because it removes auth noise and a real bad redirect source.

## Strongest Remaining Root-Cause Candidate

System-route poisoning is **not** the strongest remaining root-cause candidate.

The stronger remaining candidate is:

- Clerk client handling of the configured force redirect target `/auth/bootstrap`

Why this is stronger:

- the failing trace shows callback requests carrying `sign_*_force_redirect_url=http://localhost:3000/auth/bootstrap`
- the captured client exception shows Clerk failing with `e = "/auth/bootstrap"`
- repository env and layout wiring explicitly feed `/auth/bootstrap` into Clerk as force redirect configuration
- the poisoned `/.well-known` redirect is not visible anywhere in the failing sign-up branch

## Minimum Safe Next Fix Target

If the goal is to test the poisoning theory directly with minimum blast radius, the smallest safe next target is:

1. exclude `/.well-known/*` from proxy/auth interception

If the goal is to target the most likely actual failure, the stronger next target is:

1. normalize the Clerk redirect values passed from `src/app/layout.tsx` and `src/modules/auth/ui/HeaderAuthControls.tsx`
2. verify whether Clerk expects absolute URLs for the configured force redirect path in this dev configuration

## Final Verdict

- poisoning path from `/.well-known/*` to `/sign-in?redirect_url=...`: **confirmed**
- survival of that poisoned `redirect_url` into the failing sign-up flow: **disproved by available trace evidence**
- exact request where contamination begins: `GET /.well-known/appspecific/com.chrome.devtools.json`
- exact request where it affects Clerk flow: **none observed in the traced failing run**
- strongest remaining root-cause candidate: **Clerk redirect configuration around `/auth/bootstrap`, not system-route poisoning**
