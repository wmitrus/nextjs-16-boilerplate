# Clerk Invalid URL Root Cause

## 1. Objective

Identify the remaining Clerk client-side `Invalid URL` / rendering failure as a standalone, production-relevant issue after the server-side bootstrap/provisioning path stopped being the main blocker.

Inputs used:

- `post-auth-diagnostics-instrumentation-copilot.md`
- `post-auth-landing-remediation-implementation-copilot.md`
- current repository auth/client integration
- current installed Clerk / Next.js runtime code
- current `logs/server.log`

Constraint:

- investigation only
- no implementation

## 2. Current-State Findings

### 2.1 What is no longer the root cause

The following are no longer the primary blocker:

- local PGlite fragility
  - post-reset logs show healthy provisioning completion and repeated allowed `/users` access
- server-side bootstrap provisioning failure
  - current `logs/server.log` shows successful identity resolution, provisioning success, and stable `/users` guard success
- generic Cloudflare Turnstile / CSP warning noise
  - this is a separate browser warning class and does not explain the `Invalid URL` payload

### 2.2 What changed in the remediation, and what did not

The post-auth landing remediation changed the configured Clerk post-auth landing from `/auth/bootstrap` to `/users` in runtime/test env defaults and left the integration shape otherwise intact:

- provider-level redirect props in `src/app/layout.tsx:57-74`
- modal button redirect props in `src/modules/auth/ui/HeaderAuthControls.tsx:30-61`
- env values still supplied as path-only strings such as `/users`

That means the repository stopped landing directly on `/auth/bootstrap`, but it still passes relative redirect values into Clerk.

### 2.3 The strongest new evidence

The earlier client exception payload was:

- `e: "/auth/bootstrap"`
- `t: "http://localhost:3000"`

After the remediation, the remaining client exception payload reported in `post-auth-diagnostics-instrumentation-copilot.md` became:

- `e: "/users"`
- `t: "http://localhost:3000"`

That is the most important signal in this investigation.

It means the failure followed the configured Clerk redirect value when the repo changed it from `/auth/bootstrap` to `/users`.

So:

- the specific route `/auth/bootstrap` is no longer the root trigger
- the remaining issue is the Clerk client path that mis-handles the configured redirect value itself

### 2.4 Successful run vs failing run

Successful run evidence:

- server-side provisioning succeeds
- `/users` guard resolves `stay:/users`
- users API loads successfully
- app continues into authenticated activity

Failing run evidence:

- server-side auth callback and bootstrap still succeed
- browser-side continuation does not settle
- visible outcome is a Clerk-side stall or rendering failure
- console shows Clerk-side `TypeError: Invalid URL`

Reliable comparison:

- successful and failing runs do not diverge first on the server
- the first reliable divergence is in the browser after Clerk has already received the redirect config and auth state changes on the client

### 2.5 Production vs development

The user reports the issue still occurs in production, so this cannot be explained solely by:

- local PGlite
- development-only DB state
- development-only bootstrap routing

There are development-only Clerk URL helpers in the installed package (`@clerk/shared/dist/runtime/devBrowser-DGSLF_56.js:5-48`) that use bare `new URL(...)`, so they are relevant as evidence that Clerk has fragile relative-URL parsing paths.

However, because production is also affected, that dev-only helper is not sufficient as the full explanation.

The production-safe conclusion is broader:

- a Clerk browser runtime path is mis-parsing the repository-supplied relative redirect value
- development may amplify it, but the failure class is not dev-only

## 3. Exact Browser-Side Exception Path

## 3.1 Repository entry point

The main integration entry point is:

- `src/app/layout.tsx:57-74`

`RootLayout` mounts `<ClerkProvider>` and passes:

- `signInFallbackRedirectUrl`
- `signUpFallbackRedirectUrl`
- `signInForceRedirectUrl`
- `signUpForceRedirectUrl`

from env-backed values that are currently path strings like `/users`.

The modal auth controls duplicate the same redirect surface for modal flows in:

- `src/modules/auth/ui/HeaderAuthControls.tsx:30-61`

But this is secondary. The dedicated `/sign-in` and `/sign-up` pages still go through the root provider even without those buttons.

## 3.2 Installed Clerk provider stack

The next layer is the installed App Router client provider:

- `node_modules/.pnpm/@clerk+nextjs@6.39.0.../node_modules/@clerk/nextjs/dist/esm/app-router/client/ClerkProvider.js:38-88`

Relevant behavior:

- `NextClientClerkProvider` receives the merged props
- installs `window.__unstable__onBeforeSetActive`
- installs `window.__unstable__onAfterSetActive`
- calls `invalidateCacheAction()`
- calls `router.refresh()` after auth state activation

This is the client/provider stack involved in the post-auth continuation.

## 3.3 First likely throw site

The first likely throw is inside Clerk browser runtime code, not repository code.

The best-supported internal throw shape is:

- Clerk receives a relative redirect value such as `/users`
- a Clerk browser URL-normalization path calls bare `new URL(value)` instead of `new URL(value, base)`
- browser throws `TypeError: Invalid URL`

Direct local evidence for bare Clerk URL parsing exists in:

- `node_modules/.pnpm/@clerk+shared@3.47.2.../node_modules/@clerk/shared/dist/runtime/devBrowser-DGSLF_56.js:5-48`

where multiple helpers use:

- `new URL(url)`
- `new URL(_url)`

without adding a base URL.

That exact local file is dev-oriented, so I am not claiming it is the only failing production path.

But together with the observed browser payload:

- `e: "/users"`
- `t: "http://localhost:3000"`

it is strong evidence for the same failure shape in Clerk's browser runtime:

- a relative redirect value is being treated as if it were already absolute

## 3.4 Failing stack, end-to-end

Most likely failing stack:

1. `src/app/layout.tsx:57-74`
2. installed `@clerk/nextjs` App Router `NextClientClerkProvider`
3. installed `@clerk/clerk-react` provider bridge
4. remote Clerk browser runtime (`clerk.browser.js`)
5. internal Clerk URL parsing / redirect handling path
6. downstream failing render state during auth-state activation and provider refresh

On failing runs, the downstream symptoms then propagate through the Clerk provider/render stack previously observed in this session:

- `NextClientClerkProvider`
- `ClientClerkProvider`
- `__experimental_CheckoutProvider`

Those downstream render failures are best understood as consequences of the earlier `Invalid URL`, not the first cause.

## 4. Architectural Assessment

### 4.1 Exact likely root cause

The exact likely root cause is:

- the repository passes Clerk-supported path-style redirect values such as `/users` into Clerk provider/button props
- a Clerk client runtime path mis-parses that relative value as if it were an absolute URL
- Clerk throws `TypeError: Invalid URL` in browser code before the post-auth client transition fully stabilizes

Important precision:

- `/users` is not malformed from the repository's perspective
- Clerk's own docs allow path-style redirect values
- the defect is that a Clerk client path is treating a supported relative value as invalid

So the remaining issue is not "the repo is passing a nonsense URL".

It is:

- a Clerk client/runtime URL parsing bug or incompatibility
- triggered by the current repository integration surface

### 4.2 Whether this is repository integration, Clerk behavior, or browser/runtime interaction

Best classification:

- primary: Clerk client behavior / Clerk runtime defect
- secondary: repository integration trigger
- tertiary: browser/runtime interaction only as an amplifier

Why:

- the first throw is inside Clerk client code, not repo code
- the failing value tracks the repo-configured redirect target exactly
- the repo is using documented path-style redirect inputs, not obviously invalid data
- browser-held state and App Router refresh likely affect whether the failure becomes a visible render stall, but they do not explain the initial `Invalid URL`

### 4.3 Repository integration points that matter

Relevant:

- `src/app/layout.tsx:57-74`
  - primary route where redirect props enter Clerk globally
- `src/modules/auth/ui/HeaderAuthControls.tsx:30-61`
  - secondary route for modal sign-in/sign-up flows
- `src/core/env.ts:82-89`
  - accepts redirect values as strings without normalization
- `.env.local:34-39`
  - currently supplies path-only redirect values

Not a primary cause:

- auth-related client observers in repo
  - no repo-side client auth observer was found that explains the initial exception
- server bootstrap page
  - `src/app/auth/bootstrap/page.tsx` is server-side and current logs show it succeeding

### 4.4 First reliable divergence point after server success

The first reliable divergence point on the client side after server success is:

- when the Clerk client provider/runtime consumes the configured redirect props during post-auth client activation and route refresh

More concretely:

1. server auth/bootstrap path succeeds
2. browser hydrates / continues with active Clerk session
3. Clerk client/provider reads redirect config already injected from `RootLayout`
4. Clerk runtime hits the relative redirect value and throws `Invalid URL`
5. failing runs then destabilize the provider/render transition

That is earlier and more reliable than:

- browser-held session reuse alone
- App Router refresh alone
- `/auth/bootstrap` redirect trampoline behavior alone

## 5. What Is Not The Root Cause Anymore

The investigation rules out the following as the primary remaining root cause:

- local PGlite fragility
- server-side bootstrap provisioning failure
- generic Turnstile / CSP warning noise
- direct landing on `/auth/bootstrap` as the essential trigger
  - because the error payload moved from `/auth/bootstrap` to `/users` after the remediation
- pure repository redirect/config drift
  - because the browser error followed the configured value change rather than exposing a mismatch between provider/button/env surfaces

## 6. Minimum Safe Next Fix Target

Minimum safe next fix target:

- the Clerk redirect-value integration boundary, not bootstrap logic

Concretely, the smallest safe target is:

1. normalize Clerk-facing redirect props to same-origin absolute URLs before passing them into Clerk
2. do it once in a shared helper used by:
   - `src/app/layout.tsx`
   - `src/modules/auth/ui/HeaderAuthControls.tsx`
3. keep repository-owned post-auth routing decisions on `/users` and server guards unchanged

Why this is the correct target:

- it addresses the actual value that the client error follows
- it has low blast radius
- it does not redesign bootstrap, provisioning, middleware, or onboarding
- it works as a repository-side containment even if the underlying bug is in Clerk

## 7. Risks and Tradeoffs

Main tradeoff:

- absolute redirect normalization needs a canonical public origin source

That means the fix must decide, explicitly and safely, what origin to use for:

- local development
- Vercel preview
- Vercel production

This should not be guessed ad hoc inside scattered components.

The origin policy must remain:

- same-origin
- env-driven or otherwise explicitly controlled
- safe for preview/prod tenancy evolution

## 8. Recommended Next Action

## 8.1 Direct answers requested

1. Exact likely root cause

- Clerk client/runtime is mis-parsing the repository-supplied relative redirect value (`/users` now, `/auth/bootstrap` earlier) and throwing `TypeError: Invalid URL` in browser code.

2. Exact likely failing client-side file/function/component stack

- `src/app/layout.tsx:57-74` -> root `<ClerkProvider>`
- installed `@clerk/nextjs` App Router `NextClientClerkProvider`
- Clerk browser runtime (`clerk.browser.js`) URL parsing / redirect handling path
- downstream failing render state in `NextClientClerkProvider` / `ClientClerkProvider` / `__experimental_CheckoutProvider`

3. Is this repository integration, Clerk behavior, or browser/runtime interaction?

- Primarily Clerk behavior, triggered by repository integration, with browser/runtime effects amplifying the visible render failure.

4. Minimum safe next fix target

- Normalize all Clerk-facing redirect props to explicit same-origin absolute URLs at the repository integration boundary before they reach `ClerkProvider` and modal buttons.

5. Can implementation proceed directly, or is one more architecture check needed?

- One brief architecture check is still needed before implementation:
  - choose the canonical public origin strategy for absolute Clerk redirects across local, preview, and production

After that, implementation can proceed directly and should stay low-blast-radius.

## 8.2 Validation notes

I did not run a fresh end-to-end browser repro in this pass because browser automation was blocked by missing local browser binaries in this environment.

The conclusion above is based on:

- the repo diff/history in the two requested notes
- current runtime logs showing healthy server success
- the fact that the failing browser payload changed from `/auth/bootstrap` to `/users`
- installed Clerk runtime/provider code
- Clerk's documented redirect contract allowing path-style redirect values
