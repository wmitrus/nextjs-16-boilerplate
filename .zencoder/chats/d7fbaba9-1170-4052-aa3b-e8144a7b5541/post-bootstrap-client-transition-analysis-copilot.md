# Post-Bootstrap Client Transition Analysis

## Objective

Investigate the client/runtime transition immediately after successful `/auth/bootstrap` handling and determine what exact post-bootstrap transition most likely fails.

This analysis uses:

- `run-a-vs-run-b-comparison-copilot.md`
- current runtime logs in `logs/server.log`
- repository auth/bootstrap/layout code
- installed Clerk App Router client runtime
- Next.js 16 redirect and router documentation

Constraint: investigation only. No implementation.

## Executive Answer

### Exact likely failing post-bootstrap transition point

The most likely failing point is:

- **after Clerk finishes `setActive` and navigates to `/auth/bootstrap`, but before the App Router settles on the server redirect target (`/onboarding?...` or `/users`)**

More specifically, the unstable window is:

1. Clerk marks the session active
2. Clerk navigates to the forced redirect target `/auth/bootstrap`
3. `/auth/bootstrap` succeeds on the server and throws a Next redirect to `/onboarding?...` or `/users`
4. **at the same time**, Clerk's App Router provider triggers cache invalidation and `router.refresh()`
5. the current route tree is refreshed while the bootstrap redirect/navigation is still being resolved
6. the browser can remain visually stuck on `/auth/bootstrap` with a blank page and `Rendering...`

That makes this primarily a **Clerk provider lifecycle plus App Router refresh interaction**, with repository config contributing by using `/auth/bootstrap` as the Clerk landing page.

### Exact file/function most likely responsible

Most likely responsible function chain:

1. installed Clerk App Router provider:
   - `node_modules/.../@clerk/nextjs/dist/esm/app-router/client/ClerkProvider.js`
   - `NextClientClerkProvider`
   - especially `window.__unstable__onBeforeSetActive`
   - especially `window.__unstable__onAfterSetActive`

2. repository integration point that makes the issue visible:
   - `src/app/layout.tsx`
   - `RootLayout`
   - because it mounts `ClerkProvider` at the app root for all routes, including `/auth/bootstrap`

3. repository configuration amplifying the risk:
   - `src/app/layout.tsx`
   - `src/modules/auth/ui/HeaderAuthControls.tsx`
   - both route Clerk post-auth landings to `/auth/bootstrap`

### Classification

Best classification from current evidence:

- **Primary:** Clerk provider lifecycle on App Router
- **Secondary:** App Router refresh behavior during auth-state activation
- **Repository contribution:** using `/auth/bootstrap` as the force/fallback post-auth landing route from both provider and modal buttons
- **Not primary:** middleware logic
- **Not primary:** server-side bootstrap failure

### Minimum safe next fix target

The minimum safe next fix target is:

- **the Clerk-facing post-auth landing strategy around `/auth/bootstrap`, not middleware**

Concretely, the safest place to focus first is:

- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`

The goal of that fix target would be to reduce or remove the unstable combination of:

- landing on `/auth/bootstrap`
- activating Clerk session state
- immediate provider-driven `router.refresh()`
- then relying on `/auth/bootstrap` to immediately server-redirect again

## 1. What `/auth/bootstrap` Returns On The Successful Server Path

### Route behavior

`src/app/auth/bootstrap/page.tsx` is a server component that does not render a success UI.

On the success path it always ends in one of these server redirects:

- `redirect(`/onboarding?redirect_url=${encodeURIComponent(safeTarget)}`)`
- `redirect(safeTarget)`

So a successful `/auth/bootstrap` request is a **transitional route**, not a stable destination.

### Next.js 16 redirect semantics

According to the Next.js 16 `redirect` documentation:

- `redirect()` in a Server Component terminates route rendering
- outside Server Actions, it serves a `307` redirect response, or in streaming contexts emits a client redirect during render

That means the expected successful handoff is:

1. browser/app requests `/auth/bootstrap`
2. server resolves identity and provisioning
3. server returns redirect semantics to `/onboarding?...` or `/users`
4. App Router/browser completes navigation away from `/auth/bootstrap`

### Navigation expectation

The correct stable outcome is:

- user should **not remain on `/auth/bootstrap`** after a successful path
- `/auth/bootstrap` should disappear almost immediately in favor of `/onboarding` or `/users`

### Important observation

There is no route-level loading file for this route:

- no `src/app/auth/bootstrap/loading.tsx`
- no generic auth bootstrap loading UI in the repo

So the blank `/auth/bootstrap` screen with `Rendering...` is **not** a repository-defined loading page. It is consistent with a client transition that never stabilizes.

## 2. Whether `ClerkProvider` In `src/app/layout.tsx` Interferes

### Repository integration

`src/app/layout.tsx` mounts `ClerkProvider` at the root and passes all Clerk auth redirect props:

- `signInUrl`
- `signUpUrl`
- `signInFallbackRedirectUrl`
- `signUpFallbackRedirectUrl`
- `signInForceRedirectUrl`
- `signUpForceRedirectUrl`

Current env wiring points these post-auth destinations at `/auth/bootstrap`.

### Why this matters

Because `ClerkProvider` wraps the full app tree, Clerk’s auth-state lifecycle is active while:

- modal sign-up/sign-in completes
- the browser lands on `/auth/bootstrap`
- `/auth/bootstrap` immediately redirects again to `/onboarding` or `/users`

This is the exact transition window where the failure appears.

### Root layout suspense effect

`RootLayout` wraps the provider tree in:

- `<Suspense fallback={null}>`

That does not appear to be the root cause, but it **does amplify the symptom**:

- if the route tree is being refreshed repeatedly or never stabilizes, the user sees a blank screen rather than a diagnostic UI

So `layout.tsx` is not creating the auth loop directly, but it is the integration point where the Clerk provider lifecycle and blank transition surface meet.

## 3. Whether `NextClientClerkProvider` Triggers The Stuck Transition

### Confirmed installed Clerk behavior

In the installed Clerk App Router provider:

- `window.__unstable__onBeforeSetActive` is installed
- `window.__unstable__onAfterSetActive` is installed

For Next 15/16 sign-in flows, the provider behavior is:

- `onBeforeSetActive` calls `invalidateCacheAction()`
- `onAfterSetActive` calls `router.refresh()` when `__unstable_invokeMiddlewareOnAuthStateChange` is enabled

The installed `invalidateCacheAction()` uses `next/headers` cookies mutation to force cache invalidation semantics.

### Why this is the strongest runtime suspect

This means Clerk is not only navigating after auth; it is also forcing App Router refresh work during auth-state activation.

That is a risky combination when the landing route is `/auth/bootstrap`, because `/auth/bootstrap` itself is not a final page. It is a server redirect trampoline.

The unstable sequence is therefore:

1. Clerk lands on `/auth/bootstrap`
2. bootstrap server work succeeds
3. bootstrap redirects onward
4. Clerk provider refreshes the current route tree
5. the current tree is still the bootstrap path or its in-flight redirect
6. navigation completion becomes timing-sensitive and can stall visibly

### Log evidence consistent with extra refresh churn

After successful bootstrap runs, `logs/server.log` shows multiple immediate identity resolutions clustered around bootstrap success before users requests settle.

Example pattern:

- identity resolved
- bootstrap success
- identity resolved again
- identity resolved again
- later users route succeeds

That is consistent with additional route refresh/re-request activity after bootstrap, not with a single clean one-shot navigation.

### Best current conclusion

Yes: the strongest current explanation is that **Clerk’s App Router auth-state hooks are triggering refresh/invalidation at exactly the wrong moment for a bootstrap-style landing route**.

## 4. Whether `HeaderAuthControls.tsx` Or Any Repo Client Auth Observer Contributes

### What `HeaderAuthControls.tsx` does

`src/modules/auth/ui/HeaderAuthControls.tsx`:

- renders `SignInButton` and `SignUpButton`
- uses `mode="modal"`
- passes force/fallback redirect URLs
- does not use `useRouter`
- does not subscribe to auth changes
- does not call `router.refresh()`
- does not perform client redirects after auth completion

### Contribution assessment

`HeaderAuthControls.tsx` is **not** the lifecycle actor causing the repeated refresh/state instability.

Its contribution is configuration-only:

- it reinforces `/auth/bootstrap` as the landing route after sign-in/sign-up

That makes it part of the landing-route setup, but not the runtime trigger.

### Other repo-side client auth observers

I did not find another meaningful repo-side client auth observer that would explain the repeated post-bootstrap refresh.

`GlobalErrorHandlers` only attaches listeners for:

- `error`
- `unhandledrejection`
- `securitypolicyviolation`

It does not drive navigation or auth state.

## 5. Is The Failure Clerk Refresh, App Router, Client Navigation, Or Bootstrap As Landing Point?

### Best-fit answer

It is primarily:

- **Clerk post-auth state refresh on App Router**

It is secondarily:

- **client-side navigation not completing cleanly because `/auth/bootstrap` is a transient redirect route, not a stable landing page**

It is not best described as:

- a repository middleware problem
- a server bootstrap failure
- a standalone `HeaderAuthControls` bug

### More precise wording

The failure is not just `router.refresh()` by itself.

The failure is the combination of:

1. Clerk session activation lifecycle
2. provider-driven cache invalidation / `router.refresh()`
3. using `/auth/bootstrap` as the forced/fallback post-auth landing point
4. expecting that transient bootstrap page to immediately redirect again during the same auth transition window

### Why `/auth/bootstrap` is a bad landing point for repeated authenticated runs

`/auth/bootstrap` is useful as a server-side provisioning trampoline, but it is fragile as a **repeated client landing destination** because:

- it is not a final route
- it always performs more auth/provisioning checks
- it immediately redirects again on success
- it sits inside the same tree already wrapped by `ClerkProvider`
- Clerk may refresh that route while it is attempting to redirect away from it

So repeated authenticated runs are more likely to expose timing-sensitive behavior on `/auth/bootstrap` than on a stable app route.

## 6. Exact Most Likely Failure Chain

The most likely failure chain is:

1. modal sign-up/sign-in completes successfully
2. Clerk runs `setActive`
3. Clerk navigates to `/auth/bootstrap` because both provider-level and button-level redirect config point there
4. `/auth/bootstrap` succeeds server-side and issues redirect intent to `/onboarding?...` or `/users`
5. `NextClientClerkProvider` runs `invalidateCacheAction()` and `router.refresh()` as part of auth-state activation
6. App Router refreshes/re-requests the in-flight route tree
7. because the current location is a redirect trampoline, not a stable page, the transition can fail to settle and the browser remains visually on `/auth/bootstrap`

This is the most precise current explanation supported by the code and logs.

## 7. Exact File / Function Most Likely Responsible

### Primary runtime actor

Most likely responsible function:

- installed Clerk `NextClientClerkProvider`
- file: `node_modules/.../@clerk/nextjs/dist/esm/app-router/client/ClerkProvider.js`

Critical hooks inside it:

- `window.__unstable__onBeforeSetActive`
- `window.__unstable__onAfterSetActive`

Critical side effects:

- `invalidateCacheAction()`
- `router.refresh()`

### Repository-side integration point

Most relevant repository function:

- `RootLayout` in `src/app/layout.tsx`

Why:

- it mounts the provider globally
- it configures Clerk redirect destinations
- it places the provider inside a `Suspense` boundary with `fallback={null}`

### Repository-side configuration amplifiers

- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`

These are the main repo-side locations that choose `/auth/bootstrap` as the auth landing route.

## 8. Minimum Safe Next Fix Target

Minimum safe next fix target:

- **change the Clerk-facing post-auth landing strategy so successful auth does not depend on landing on a transient bootstrap route during the provider refresh window**

Most appropriate files to target first:

- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`

Why this is safer than touching middleware first:

- middleware divergence has already been largely disproved
- server-side bootstrap success is already established
- the risk is concentrated in client/runtime post-auth transition behavior

## 9. Proposal For Further Debugging And Finding Root Cause

To prove the exact chain instead of only inferring it, the next debugging pass should instrument the client transition around `setActive`, navigation, and route settlement.

### Highest-value debug steps

1. Add temporary client-side navigation tracing in the root app tree.

Capture:

- `window.location.href`
- `usePathname()` changes
- `useSearchParams()` changes
- timestamps before and after auth completion

Goal:

- prove whether the app repeatedly returns to `/auth/bootstrap` or simply never settles after refresh.

2. Temporarily instrument Clerk lifecycle hooks from the browser.

Record when these fire:

- `window.__unstable__onBeforeSetActive`
- `window.__unstable__onAfterSetActive`

And record around them:

- current pathname
- current href
- whether a navigation to `/users` or `/onboarding` follows

Goal:

- confirm whether `router.refresh()` lands while the current route is still `/auth/bootstrap`.

3. Add temporary logging inside `src/app/auth/bootstrap/page.tsx` right before each redirect.

Log:

- chosen `safeTarget`
- whether the redirect goes to `/onboarding?...` or `/users`
- request timestamp / correlation id if available

Goal:

- correlate the exact server redirect target with the client path that ends up stuck.

4. Add temporary browser logging for route completion in the actual destination pages.

Best candidates:

- users page root
- onboarding page root

Goal:

- distinguish “destination rendered but hidden/replaced” from “destination never mounted.”

5. Capture a real browser trace on a failing repeated run.

Need:

- Network waterfall
- Console messages
- current URL transitions
- cookie/localStorage/sessionStorage deltas before and after first successful run

Goal:

- determine whether Clerk retains stale callback/dev-browser state across attempts.

### Most important proof to gather next

The single most valuable missing proof is:

- whether `window.__unstable__onAfterSetActive -> router.refresh()` fires while the current browser location is still `/auth/bootstrap`, immediately before the visible stall.

If that is confirmed, the current hypothesis becomes the root-cause-level explanation.

## Final Conclusion

- exact likely failing transition point: **the client-side handoff after Clerk `setActive`, when `/auth/bootstrap` has succeeded on the server but Clerk's App Router hooks are still invalidating cache and calling `router.refresh()` before navigation settles on `/onboarding` or `/users`**
- exact file/function most likely responsible: **installed Clerk `NextClientClerkProvider` in `@clerk/nextjs` App Router client `ClerkProvider.js`, especially `__unstable__onBeforeSetActive` and `__unstable__onAfterSetActive`**
- repository-side integration most relevant to fix: **`src/app/layout.tsx` and secondarily `src/modules/auth/ui/HeaderAuthControls.tsx` because they route all post-auth landings through `/auth/bootstrap`**
- failure class: **primarily Clerk provider lifecycle plus App Router refresh behavior, amplified by using `/auth/bootstrap` as a transient landing page for repeated authenticated runs**
- minimum safe next fix target: **the Clerk post-auth landing strategy around `/auth/bootstrap`, not middleware**
