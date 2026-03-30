# Clerk Dev vs Production Runtime Analysis

**Date:** 2026-03-15  
**Scope:** `pnpm dev` vs `pnpm build && pnpm start` / Vercel behavior for Clerk sign-up redirect completion  
**Mode:** Investigation only, no source changes applied

## 1. Objective

Determine why Clerk sign-up / OAuth completion is unstable in `pnpm dev` but works in production-like runtime, with emphasis on:

- redirect configuration delivery
- URL resolution differences
- App Router / Turbopack behavior
- middleware / header impact
- the exact place an `Invalid URL` can be produced

---

## 2. Current-State Findings

### 2.1 Repository configuration currently in effect

The current local configuration is not the same as the earlier investigation snapshot:

- `.env.local:39-42` sets all four Clerk force/fallback redirect URLs to absolute `http://localhost:3000/auth/bootstrap`
- `.env.local:34-35` leaves `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL` commented out
- `src/core/env.ts:82-87` gives app-level defaults of:
  - `NEXT_PUBLIC_CLERK_SIGN_IN_URL = "/sign-in"`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_URL = "/sign-up"`
  - force/fallback redirect URLs must be absolute if provided
- `src/app/layout.tsx:57-72` passes those values directly into `<ClerkProvider />`

Important consequence:

- the React tree sees `signInUrl="/sign-in"` and `signUpUrl="/sign-up"` through the app env layer
- the Clerk middleware does **not** read `src/core/env.ts`
- `@clerk/nextjs` server constants read raw `process.env` only, and default missing values to `""`
  - `node_modules/.pnpm/@clerk+nextjs@6.39.0.../dist/esm/server/constants.js:15-16`

So there is a real client/server config drift:

- app-side ClerkProvider default: relative `/sign-in`, `/sign-up`
- middleware-side Clerk config: empty string unless actual env vars are set

### 2.2 Dev bundle injection is currently correct for the four redirect targets

The current Turbopack dev client bundle inlines the four redirect targets as absolute URLs:

- `.next/dev/static/chunks/44cc3_@clerk_nextjs_dist_esm_20ddfba0._.js:681-684`

That means the current dev crash is **not** explained by the four `*ForceRedirectUrl` / `*FallbackRedirectUrl` values being injected as relative paths.

This invalidates the earlier simpler theory that "relative `/auth/bootstrap` in force/fallback redirect props is the current root cause."

### 2.3 Clerk does support relative redirects in its normal redirect builder

Clerk's general redirect builder does resolve relative targets against a base URL:

- source from `@clerk/backend` `createRedirect.ts`
- `new URL(_targetUrl, baseUrl)`
- `new URL(_returnBackUrl, baseUrl)`

Relevant source content:

- `node_modules/.pnpm/@clerk+backend@2.33.0.../dist/index.js.map`, extracted `../src/createRedirect.ts:17-19`

So the documented allowance for relative redirect paths is real. The failure has to be in a different code path.

### 2.4 Clerk shared router also resolves relative paths safely

Clerk's shared router uses:

- `new URL(path, window.location.origin)`

File:

- `node_modules/.pnpm/@clerk+shared@3.47.2.../dist/runtime/router.mjs:30-38`

So normal client navigation is also not the place where a relative path should explode.

### 2.5 No evidence that proxy or CSP is the primary cause

The repository middleware and security code look correct for this issue:

- `src/proxy.ts:182-191` uses `clerkMiddleware(...)` without rewriting redirect bases
- `src/security/middleware/with-auth.ts:87-156` builds redirects with `new URL(path, req.url)` safely
- `src/app/auth/bootstrap/page.tsx:36-38` sanitizes `redirect_url`
- `src/security/middleware/with-headers.ts:57-60` already allows both:
  - `https://*.clerk.accounts.dev`
  - `wss://*.clerk.accounts.dev`

I did not find a proxy/header path that would inject an invalid base into `URL()`.

### 2.6 Local dev is definitely using a Clerk development instance

The local publishable key prefix is `pk_test_`, which means Clerk development-instance code paths are active locally.

Supporting code:

- `@clerk/shared` builds development Clerk JS URLs like `https://<frontendApi>/npm/@clerk/clerk-js@.../dist/clerk.browser.js`
- file: `node_modules/.pnpm/@clerk+shared@3.47.2.../dist/runtime/loadClerkJsScript-DhJ-5qkn.js:168-177`

### 2.7 Exact dev-only Clerk branches that use bare `new URL(...)`

In the installed Clerk backend package, there are exact development-instance branches that call `new URL(...)` with **no base**:

- `node_modules/.pnpm/@clerk+backend@2.33.0.../dist/index.js:6117`
  - `const redirectURL = new URL(authenticateContext.signInUrl);`
- `node_modules/.pnpm/@clerk+backend@2.33.0.../dist/index.js:6129`
  - `const redirectBackToSatelliteUrl = new URL(redirectUrl);`

Those branches are guarded by `authenticateContext.instanceType === "development"`.

This matters because it shows the dev failure mode is not "bad base URL passed into `new URL(value, base)`."  
The sharper failure mode is "Clerk dev path calls `new URL(relativeOrEmptyString)` without a base at all."

### 2.8 Exact App Router auth-state refresh path after OAuth completion

After auth state changes, `@clerk/nextjs` App Router provider wires these globals:

- `window.__unstable__onBeforeSetActive`
- `window.__unstable__onAfterSetActive`

and then invalidates cache / refreshes the router:

- `invalidateCacheAction()`
- `router.refresh()`

File:

- `node_modules/.pnpm/@clerk+nextjs@6.39.0.../dist/esm/app-router/client/ClerkProvider.js:59-79`

This aligns with the observed crash cascade through:

- `ClientClerkProvider`
- `NextClientClerkProvider`
- Clerk internal providers

### 2.9 OAuth callback handling is delegated into Clerk JS

The local React wrapper does not implement callback parsing itself; it delegates into Clerk JS:

- `node_modules/.pnpm/@clerk+clerk-react@5.61.3.../dist/index.js:2827-2837`
  - `this.handleRedirectCallback = async (params) => ... this.clerkjs.handleRedirectCallback(params)`

That means the user-visible `Invalid URL` observed in `clerk.browser.js` is very likely inside Clerk's browser bundle, not repository code.

---

## 3. Architectural Assessment

### 3.1 What is not the current root cause

Based on the current workspace state, I do **not** think the present dev-only failure is primarily caused by:

- missing origin in the four force/fallback redirect props
- `NEXT_PUBLIC_APP_URL`
- proxy URL rewriting
- CSP blocking Clerk dev websocket traffic
- generic inability of Clerk to handle relative redirect paths

Why:

- the current dev bundle already contains absolute `http://localhost:3000/auth/bootstrap` for the four redirect targets
- `NEXT_PUBLIC_APP_URL` is not what Clerk is consuming in the inspected paths
- the repo server code uses safe `new URL(path, base)` patterns
- Clerk's documented redirect builder and shared router both support relative paths when a base exists

### 3.2 The most important mismatch in this repository

The repository currently configures Clerk in two different ways:

1. App-side through `src/core/env.ts`
2. Middleware-side through Clerk's own raw `process.env` lookups

Because `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL` are not actually set in `.env.local`, the two sides disagree:

- app-side: `/sign-in`, `/sign-up`
- middleware-side: `""`, `""`

That is a real integration smell and the lowest-risk repository-level contributor I found.

### 3.3 Why the failure appears dev-only

The strongest comparison is:

- `pnpm dev`: Next dev runtime + Turbopack + Clerk development instance + auth-state refresh cycle
- `pnpm build && pnpm start`: same app code, but without the dev runtime/Turbopack behavior

If `pnpm build && pnpm start` works with the same local env, then the decisive difference is not the four redirect env values. It is the runtime behavior during auth completion.

The two most relevant moving parts are:

1. Clerk development-instance code paths
   - dev-browser token / handshake logic
   - `*.clerk.accounts.dev` browser bundle
   - bare `new URL(...)` call sites in dev branches

2. Next App Router auth-state refresh in client runtime
   - `__unstable__onBeforeSetActive`
   - `__unstable__onAfterSetActive`
   - `invalidateCacheAction()`
   - `router.refresh()`

My assessment is:

- the originating parser problem is in Clerk behavior
- the reason it becomes a visible provider crash in `pnpm dev` is the App Router dev refresh cycle
- Turbopack is an amplifier, not the confirmed source of the bad URL string

### 3.4 Where the current `Invalid URL` is most likely happening

There are two different "exact locations" that matter:

#### A. Exact locally inspectable throw sites in installed Clerk code

- `@clerk/backend/dist/index.js:6117`
- `@clerk/backend/dist/index.js:6129`

These are confirmed development-instance `new URL(...)` calls without a base.

#### B. Likely user-visible browser throw site

The actual browser `TypeError: Invalid URL` seen in `clerk.browser.js` is most likely inside the remotely loaded Clerk browser bundle, reached from:

- `@clerk/clerk-react/dist/index.js:2827-2837` via `handleRedirectCallback`
- and/or after-auth redirect helpers such as:
  - `redirectToAfterSignIn`
  - `redirectToAfterSignUp`

That exact minified browser line is not locally inspectable in this repo, but the wrapper path is.

### 3.5 Do I think Clerk is receiving an invalid base URL?

No. I did **not** find evidence that some repo path passes a malformed base into `new URL(value, base)`.

The stronger conclusion is:

- when this fails, Clerk is more likely calling `new URL(value)` on a value that is relative or empty
- not calling `new URL(value, badBase)`

### 3.6 Does the invalid URL happen only after OAuth callback handling?

With the **current** repository state, probably yes.

Reason:

- the current dev bundle already injects absolute force/fallback redirect URLs
- that removes the strongest pre-OAuth explanation from the earlier investigation
- what remains is the post-auth sequence:
  - callback handling
  - `setActive`
  - middleware re-invocation
  - `router.refresh()`
  - provider re-render

The earlier pre-OAuth `Invalid URL` evidence appears to belong to an older dev session/config state, not the current one.

---

## 4. Direct Answers

### 4.1 Exact location where `Invalid URL` could be produced

Confirmed locally inspectable dev-only Clerk throw sites:

- `node_modules/.pnpm/@clerk+backend@2.33.0.../dist/index.js:6117`
- `node_modules/.pnpm/@clerk+backend@2.33.0.../dist/index.js:6129`

Observed client crash escalation point after auth state change:

- `node_modules/.pnpm/@clerk+nextjs@6.39.0.../dist/esm/app-router/client/ClerkProvider.js:59-79`

Likely user-visible browser callback path:

- `node_modules/.pnpm/@clerk+clerk-react@5.61.3.../dist/index.js:2827-2837`

### 4.2 Dev-only condition that triggers it

Most likely trigger:

- local development runtime (`pnpm dev`) reaches Clerk auth completion
- Clerk updates auth state
- `NextClientClerkProvider` runs `__unstable__onBeforeSetActive` / `__unstable__onAfterSetActive`
- cache invalidation and `router.refresh()` rerender the App Router tree
- Clerk browser/middleware state is already inconsistent, so provider props/state collapse

Repository-level contributing condition:

- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL` are not explicitly set in actual env
- app-side defaults and middleware-side values diverge

### 4.3 Why production does not exhibit it

Best explanation:

- production-like runtime avoids the Next dev/Turbopack refresh behavior that is surfacing the Clerk state corruption
- if deployed production also uses a live Clerk instance, it additionally avoids development-instance browser flows

What I can say confidently:

- the current dev/prod difference is **not** explained by the four force/fallback redirect props being relative in dev

### 4.4 Minimal safe fix if one exists

A minimal safe repository-level mitigation exists, but it is not yet proven to be a full fix:

- explicitly set `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- explicitly set `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- in local dev, prefer absolute values:
  - `http://localhost:3000/sign-in`
  - `http://localhost:3000/sign-up`

Why this is the lowest-risk change:

- it removes the current client/middleware config drift
- it aligns repository config with what Clerk middleware actually reads
- it does not change auth policy, routing policy, CSP, or bootstrap flow ownership

I do **not** recommend, as a first fix:

- changing `proxy.ts`
- changing CSP
- wiring `NEXT_PUBLIC_APP_URL` into Clerk ad hoc
- disabling `__unstable_invokeMiddlewareOnAuthStateChange`

That last option is a heavier behavioral workaround, not the minimal safe fix.

### 4.5 Classification

Best classification:

- **Primary:** Clerk integration issue exposed by the Next.js dev runtime
- **Contributing repository issue:** Clerk client and Clerk middleware are not fed the same `signInUrl` / `signUpUrl` configuration
- **Secondary amplifier:** Next.js App Router dev runtime / Turbopack refresh behavior
- **Not primary:** proxy/header issue
- **Not primary:** `NEXT_PUBLIC_APP_URL` / missing-origin issue

---

## 5. Risks and Tradeoffs

- I can identify exact local Clerk throw sites and exact local auth-state refresh hooks.
- I cannot inspect the exact minified line inside the remote `clerk.browser.js` bundle from this workspace.
- Because of that, the browser-side throw location is a high-confidence inference from wrapper paths and observed symptoms, not a fully deminified browser source confirmation.
- Existing `.next/static` production artifacts in the workspace are not reliable source-of-truth for current env injection because they may predate the current `.env.local`.

---

## 6. Implementation Notes

No code changes were applied.

If we move to the next step, the safest first change would be configuration only:

- set `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- set `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- restart the dev server
- retest OAuth completion in `pnpm dev`

That keeps blast radius low and directly addresses the only clear current integration mismatch.

---

## 7. Validation / Verification

Validated by inspecting:

- repository env/config wiring
- current `.env.local`
- current Turbopack dev output
- Clerk App Router client provider
- Clerk server middleware constants and request auth path
- Clerk shared router
- Clerk redirect builder source map
- security middleware and bootstrap redirect flow

Key verified facts:

- current dev bundle injects absolute force/fallback redirect URLs
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` are unset in actual env
- Clerk middleware defaults those missing values to empty strings
- Clerk dev code contains bare `new URL(...)` paths
- App Router auth-state refresh hooks are present and active

---

## 8. Recommended Next Action

Do not change application logic first.

The next step should be:

1. set explicit local env values for `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
2. prefer absolute local URLs for those two values
3. restart `pnpm dev`
4. re-run the OAuth completion flow
5. only if the crash remains, treat it as a Clerk + Next dev-runtime issue and capture a fresh browser stack from the current config
