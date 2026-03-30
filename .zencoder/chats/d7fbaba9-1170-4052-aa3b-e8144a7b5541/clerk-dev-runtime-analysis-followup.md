# Clerk Dev Runtime Analysis Follow-up

Date: 2026-03-15
Mode: investigation only, no application changes applied

## 1. Objective

Re-validate the current Clerk redirect configuration as it exists now, compare it against Clerk's current documentation, and determine why the sign-up / OAuth completion flow still fails in `pnpm dev` while production continues to work.

Important scope note:

- I did not patch code in this pass.
- I did not run a browser reproduction in this pass.
- This conclusion is based on current repo state, installed package code, generated dev bundle output, and current Clerk docs.

## 2. Current-State Findings

### 2.1 Current config is now consistent

The previous middleware-vs-provider mismatch on `signInUrl` / `signUpUrl` is no longer the active problem.

Current repo state:

- `.env.local` now explicitly sets:
  - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
  - `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/auth/bootstrap`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/bootstrap`
  - `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/auth/bootstrap`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/auth/bootstrap`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000` is also present.
- `src/core/env.ts` now accepts those redirect vars as `z.string().optional()`, so relative values are intentionally allowed again.
- `src/app/layout.tsx` passes those values directly into `<ClerkProvider />`.
- the current Turbopack dev bundle contains those same relative values exactly; it is not rewriting them to absolute URLs anymore.

Conclusion:

- current dev and app config is internally consistent
- current failure is not explained by missing sign-in/sign-up env vars
- current failure is not explained by `NEXT_PUBLIC_APP_URL` being absent

### 2.2 Relative redirect paths are still documented as valid

Clerk's current docs still document these redirect values as "full URL or path", not "absolute URL only".

That applies to:

- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`
- `<SignUp />` / `<SignIn />` redirect props

Conclusion:

- relative `/auth/bootstrap` remains a supported public Clerk configuration
- "relative path only" is not a sufficient root-cause explanation

### 2.3 The app is using Clerk's prebuilt components, not a custom flow

Current auth UI:

- `src/app/sign-in/[[...sign-in]]/sign-in-client.tsx` renders `<SignIn path="/sign-in" />`
- `src/app/sign-up/[[...sign-up]]/sign-up-client.tsx` renders `<SignUp path="/sign-up" />`

That matters because:

- the app is not calling `useSignIn()`, `useSignUp()`, `finalize()`, or `decorateUrl()` itself
- any post-auth callback navigation is currently happening inside Clerk's own hosted/prebuilt flow

## 3. What Clerk Docs Say

### 3.1 `decorateUrl()` is specifically about dev-instance URL decoration

Clerk's current JavaScript SDK docs say `redirectWithAuth()` decorates the target URL with auth state for development instances, while production relies on the normal session cookie.

Clerk's custom-flow docs also show this exact pattern after `signIn.finalize()` / `signUp.finalize()`:

- call `decorateUrl('/')`
- if the result starts with `http`, use `window.location.href`
- otherwise use `router.push()`

That is a strong signal that post-auth navigation is not always a plain internal relative navigation in development.

Implication:

- Clerk dev-mode completion can require URL decoration and may intentionally return absolute URLs
- any middleware or app logic that interrupts or strips that callback state can break dev-only flows

### 3.2 Clerk's error-handling docs do not cover this failure class

The current Clerk error-handling docs say:

- `useSignIn()`, `useSignUp()`, and `useWaitlist()` expose a global `errors` object for the last API request
- individual methods return an `error` object for programmatic handling

That is useful for business/auth API errors such as:

- `user_locked`
- `form_password_compromised`
- validation / verification errors

It does not cover:

- `ClientClerkProvider` crashes
- `NextClientClerkProvider` crashes
- runtime exceptions thrown during provider initialization or callback URL decoration

Implication:

- adding hook-level Clerk error rendering would not fix the current provider/runtime crash
- the current failure is below the docs' normal custom-form error-handling layer

### 3.3 Clerk docs also confirm prebuilt auth pages already redirect signed-in users

Current Clerk docs for `<SignIn />` / `<SignUp />` state that those components cannot render for an already signed-in single-session user and Clerk redirects the user away.

Implication:

- the repository's own middleware redirect on `/sign-in` and `/sign-up` is duplicating behavior Clerk already owns
- duplicating it is harmless in simple cases, but risky during callback completion because Clerk may still be processing query params or dev tokens

## 4. New Root-Cause Hypothesis

### 4.1 Strongest repository-side trigger

The strongest trigger in the current codebase is:

- `src/security/middleware/with-auth.ts:94-109`

`redirectAuthenticatedFromAuthRoute()` does this:

- if request is on an auth route (`/sign-in` or `/sign-up`)
- and `userId` is already present
- it redirects immediately to `/auth/bootstrap`
- it preserves only `redirect_url`
- it drops every other query parameter

This is the key difference from Clerk's own redirect/callback handling.

### 4.2 Why that matters specifically in development

Installed Clerk packages show development-only callback/sync parameters and URL decoration:

- `@clerk/backend/dist/internal.js:252-264` defines dev-related query params such as:
  - `__clerk_synced`
  - `__clerk_redirect_url`
  - `__clerk_db_jwt`
  - `__clerk_handshake`
  - `__clerk_handshake_nonce`
- `@clerk/backend/dist/internal.js:321-338` and `:340-355` build redirect URLs and preserve `redirect_url`, with special dev-browser handling
- `@clerk/shared/dist/runtime/devBrowser-DGSLF_56.js:5-10` and `:29-49` perform bare `new URL(...)` work while reading/writing the dev-browser token

So in dev, Clerk is not just navigating to `/auth/bootstrap`. It may still be carrying or consuming Clerk-owned query state around callback completion.

### 4.3 Why this maps to the observed symptoms

Observed symptoms:

- client state corruption inside Clerk providers
- stuck on "Rendering..."
- occasional `TypeError: Invalid URL`
- cascade through `ClientClerkProvider` / `NextClientClerkProvider`

This matches the following sequence:

1. Clerk completes sign-up / OAuth enough that middleware now sees `userId`.
2. Request is still on `/sign-in` or `/sign-up`, potentially with Clerk-owned callback/dev params.
3. repository middleware immediately redirects to `/auth/bootstrap`
4. only `redirect_url` is preserved
5. Clerk-owned callback/dev params are dropped
6. Clerk client/provider finishes hydration or callback cleanup with incomplete state
7. a dev-only URL decoration / cleanup path sees malformed input and throws, or the provider tree gets stuck in an incomplete transition

This also explains the intermittence:

- not every auth completion path needs the same callback params
- not every provider or sign-up path uses the same redirect mode
- dev-only App Router refreshes make the timing narrower and more failure-prone

## 5. Exact `Invalid URL` Location

### 5.1 Most likely current client-side throw site

Most likely throw site:

- `node_modules/.pnpm/@clerk+shared@3.47.2.../node_modules/@clerk/shared/dist/runtime/devBrowser-DGSLF_56.js`
  - line 6: `const resultURL = new URL(url);`
  - line 30: `const url = new URL(_url);`
  - line 48: `const url = new URL(_url);`

Why this is the best fit:

- it is client-side
- it is explicitly development-instance logic
- it uses bare `new URL(...)` without a base
- the observed crash is client-side and post-auth

Inference:

- if Clerk's dev-browser token decoration/cleanup receives a relative or otherwise incomplete URL after our middleware strips the callback state, the browser throws `TypeError: Invalid URL`

### 5.2 Less likely site that I do not think is the current root cause

Secondary Clerk `new URL(...)` sites exist in `@clerk/backend/dist/internal.js`, especially around development satellite sync:

- `:6241` `new URL(authenticateContext.signInUrl)`
- `:6253` `new URL(redirectUrl)`

I do not think this is the current path because:

- the repository is not configured as a Clerk satellite app
- there is no `NEXT_PUBLIC_CLERK_IS_SATELLITE`, `NEXT_PUBLIC_CLERK_DOMAIN`, or `NEXT_PUBLIC_CLERK_PROXY_URL` configured
- the symptom is primarily client-provider failure, not backend request failure

### 5.3 Old GitHub issue `#2706` is not the current problem

The old `@clerk/backend throws: Invalid URL string` issue was:

- a backend path-joining bug
- in older Clerk versions
- around malformed `https:/...` construction in `@clerk/backend`

That is not a good match for the current incident because:

- current installed `@clerk/backend` is `2.33.0`
- current symptom is client/provider crash after auth completion
- current evidence points to callback/query-param loss in dev, not broken backend API URL joining

## 6. Why Production Does Not Exhibit The Issue

Production avoids the failure for two reasons.

First:

- the development-only Clerk URL decoration path is different
- Clerk docs explicitly distinguish dev-instance decorated redirects from production's normal cookie-based auth continuity
- the extra dev callback/query params are either absent or less central in production

Second:

- the repository middleware redirect is only destructive when it intercepts Clerk's in-flight callback state
- development has extra Clerk-owned query params to preserve
- production has a simpler post-auth path and therefore tolerates the repository redirect much better

In short:

- production works because the repo's over-eager auth-route redirect does not destroy any dev-browser token/callback state there
- development fails because that same redirect strips state Clerk still needs

## 7. Turbopack / Next.js App Router Assessment

I do not see evidence that Turbopack is directly generating the bad URL.

Current evidence says:

- Turbopack is correctly shipping the configured values as strings
- `NEXT_PUBLIC_APP_URL` is present in the dev bundle
- proxy/security headers are not rewriting URLs or query strings

However, Next.js App Router behavior is still part of the failure amplification:

- `@clerk/nextjs` App Router provider installs auth-state hooks in `app-router/client/ClerkProvider.js:58-79`
- those hooks call `invalidateCacheAction()` and `router.refresh()`
- Clerk's own OAuth custom-flow docs explicitly warn to guard callback effects so Next.js does not rerun them during session activation

Assessment:

- not a pure Turbopack config bug
- not a pure Next.js bug
- App Router refresh behavior likely amplifies the timing window once the repository middleware interrupts the callback state

## 8. Proxy / Security Header Assessment

### 8.1 `proxy.ts`

Current `src/proxy.ts` does not itself rewrite auth URLs or drop query strings.

### 8.2 Security headers

Current `src/security/middleware/with-headers.ts` sets CSP and standard hardening headers, but it does not rewrite navigation state or mutate query params.

Conclusion:

- proxy composition and security headers are not the primary source of the redirect corruption
- the auth-route redirect inside `with-auth.ts` is the meaningful middleware behavior here

## 9. Minimal Safe Fix

Minimal safe fix, without changing the overall auth architecture:

1. Make `redirectAuthenticatedFromAuthRoute()` callback-aware.
2. Do not redirect away from `/sign-in` or `/sign-up` while Clerk callback/sync params are present.
3. At minimum, detect Clerk-owned params such as:
   - `__clerk_db_jwt`
   - `__clerk_synced`
   - `__clerk_redirect_url`
   - `__clerk_handshake`
   - `__clerk_handshake_nonce`
   - `__session`
4. Only run the repository redirect once the auth route request is "plain" again.

Why this is the safest minimal fix:

- low blast radius
- preserves current `/auth/bootstrap` provisioning design
- avoids fighting Clerk's own callback lifecycle
- aligns with Clerk docs, which already treat post-auth navigation as Clerk-owned during completion

What I do not recommend as the primary fix:

- switching all redirect vars to absolute URLs only
- blaming relative paths alone
- changing `NEXT_PUBLIC_APP_URL`
- removing CSP/security headers

Those may change the symptom surface, but they do not address the more direct callback-state loss.

## 10. Issue Classification

Primary classification:

- repository integration issue

Secondary classification:

- exposed specifically by Clerk development runtime behavior
- amplified by Next.js App Router auth-state refresh timing

Not the primary classification:

- plain repository env misconfiguration
- plain missing-origin issue
- old `@clerk/backend` issue `#2706`
- proxy/security-header bug
- pure Turbopack client-navigation bug

Short version:

- the repo is currently stepping on Clerk's dev callback lifecycle
- Clerk dev runtime is the reason it only blows up in development

## 11. Recommended Next Action

If you want the next step to stay low-risk and diagnostic-first, the best implementation target is:

- patch `src/security/middleware/with-auth.ts` so auth-route redirects are skipped when Clerk callback/dev params are present

After that, validate in this order:

1. `pnpm dev`
2. `pnpm dev:webpack`
3. `pnpm build && pnpm start`

Expected result if this analysis is correct:

- dev crash disappears
- production remains unchanged
- relative `/auth/bootstrap` can stay in place

## 12. Sources

Official Clerk docs:

- https://clerk.com/docs/guides/development/clerk-environment-variables
- https://clerk.com/docs/guides/development/customize-redirect-urls
- https://clerk.com/docs/guides/development/custom-flows/error-handling
- https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections
- https://clerk.com/docs/reference/javascript/clerk
- https://clerk.com/docs/nextjs/reference/components/authentication/sign-up

Reference issue discussed for comparison:

- https://github.com/clerk/javascript/issues/2706
