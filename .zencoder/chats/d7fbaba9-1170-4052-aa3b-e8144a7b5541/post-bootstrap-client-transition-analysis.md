# Post-Bootstrap Client Transition Analysis

Date: 2026-03-15  
Mode: investigation only, no implementation

## 1. Objective

Identify the exact post-bootstrap client/runtime transition that fails after successful auth callback handling.

Input focus:

- `.zencoder/chats/d7fbaba9-1170-4052-aa3b-e8144a7b5541/run-a-vs-run-b-comparison-copilot.md`
- current repository wiring in `src/app/layout.tsx`, `src/app/auth/bootstrap/page.tsx`, and `src/modules/auth/ui/HeaderAuthControls.tsx`
- installed Clerk App Router provider/runtime code in `node_modules`

## 2. What `/auth/bootstrap` Returns On The Successful Path

`/auth/bootstrap` is not a stable rendered page on the success path.

In `src/app/auth/bootstrap/page.tsx`:

- `BootstrapPage` provisions/resolves the user
- then it calls `redirect('/onboarding?...')` when onboarding is incomplete at `src/app/auth/bootstrap/page.tsx:157-158`
- otherwise it calls `redirect(safeTarget)` at `src/app/auth/bootstrap/page.tsx:161`

The tests confirm this contract:

- `src/app/auth/bootstrap/page.test.tsx:150-153` expects `REDIRECT:/onboarding?redirect_url=%2Fusers`
- `src/app/auth/bootstrap/page.test.tsx:164-171` expects `REDIRECT:/users`

That means the successful server path for `/auth/bootstrap` is:

1. App Router requests the Server Component for `/auth/bootstrap`
2. the server returns a redirect control-flow result, not stable page UI
3. the client is expected to immediately transition to `/onboarding?...` or `/users`

So the critical client handoff is:

- arrive on `/auth/bootstrap`
- consume the Server Component redirect result
- leave `/auth/bootstrap` immediately

## 3. Exact Likely Failing Transition Point

The strongest current failure point is:

- after Clerk has already navigated the browser to `/auth/bootstrap`
- after the server has already produced the success redirect from `/auth/bootstrap`
- but before the App Router successfully commits the redirect away from `/auth/bootstrap`

In practical terms:

- Clerk reaches `/auth/bootstrap`
- `/auth/bootstrap` succeeds on the server and wants to redirect away
- Clerk's App Router provider refreshes the current route during the same auth-state transition
- the client remains pinned to the current route `/auth/bootstrap` instead of settling into `/onboarding` or `/users`

This matches the observed symptom:

- browser remains on `/auth/bootstrap`
- UI stays at `Rendering...`

## 4. Most Likely Responsible File And Function

The most likely responsible function is:

- `NextClientClerkProvider` in:
  - `node_modules/.pnpm/@clerk+nextjs@6.39.0_next@16.1.6_@babel+core@7.28.6_@opentelemetry+api@1.9.0_@playwrigh_c5af9ee4961a1ba94ab5751a011c4b1d/node_modules/@clerk/nextjs/dist/esm/app-router/client/ClerkProvider.js:24-89`

The critical hooks are:

- `window.__unstable__onBeforeSetActive` at lines `59-73`
- `window.__unstable__onAfterSetActive` at lines `75-79`

What they do on Next 16:

- before active session is finalized, Clerk starts a cache invalidation phase via `invalidateCacheAction()` at line `71`
- after active session is set, Clerk calls `router.refresh()` at lines `75-78`

That `router.refresh()` runs on the current route.

During this post-auth phase, the current route is `/auth/bootstrap`, which is a transient server-redirect route rather than stable UI.

## 5. Why `src/app/layout.tsx` Matters

The repository-level entry point that activates this lifecycle is:

- `src/app/layout.tsx:55-75`

That file mounts `<ClerkProvider ...>` around the entire app, including `/auth/bootstrap`.

So:

- `src/app/layout.tsx` is not the low-level bug
- but it is the repository file that brings `NextClientClerkProvider` into the `/auth/bootstrap` lifecycle

The actual problematic behavior is inside installed Clerk App Router provider code, not inside the layout component’s own logic.

## 6. Why This Looks Like A Refresh/RSC Handoff Problem

Clerk also provides internal navigation helpers via:

- `node_modules/.../@clerk/nextjs/dist/esm/app-router/client/useInternalNavFun.js:11-49`

Those helper promises flush when pathname changes or the transition settles.

That means Clerk can successfully complete the navigation _to_ `/auth/bootstrap`.

The evidence therefore points to a later failure:

- not "can Clerk reach `/auth/bootstrap`?"
- but "can the app leave `/auth/bootstrap` after the server redirect is produced?"

Because `/auth/bootstrap` itself only succeeds by redirecting away, a `router.refresh()` on that route is especially risky:

- refresh re-fetches the current route tree
- the current route is the transient bootstrap route
- bootstrap re-enters provisioning + redirect logic instead of giving the browser a stable page to settle on

This makes `/auth/bootstrap` a particularly fragile landing point for repeated authenticated runs.

## 7. Whether `HeaderAuthControls.tsx` Contributes

Directly: probably not.

`src/modules/auth/ui/HeaderAuthControls.tsx`:

- has only one local effect: `setIsMounted(true)` at `:17-19`
- renders `SignedIn`, `SignedOut`, `SignInButton`, `SignUpButton`, and `UserButton`

The redirect props on `SignInButton` / `SignUpButton` are not eagerly processed on render.
In installed Clerk React code:

- `SignInButton` uses redirect props only inside `clickHandler()` at:
  - `@clerk/clerk-react/dist/index.js:1492-1510`
- `SignUpButton` uses redirect props only inside `clickHandler()` at:
  - `@clerk/clerk-react/dist/index.js:1584-1604`

So `HeaderAuthControls.tsx` is not the likely source of repeated refreshes or the stuck transition.

It may increase the amount of Clerk UI mounted globally, but there is no evidence it is driving the failure.

## 8. Classification

Best-fit classification:

- primary: Clerk provider lifecycle in App Router mode
- mechanism: App Router `router.refresh()` during post-auth state transition
- symptom: client-side navigation away from `/auth/bootstrap` does not complete
- repository contribution: using `/auth/bootstrap` as the direct Clerk force-redirect landing point makes the refresh race more fragile
- not primary: repository client auth observer code

So the cleanest phrasing is:

- this is mainly a Clerk App Router provider lifecycle issue, amplified by the repository choosing a redirect-only bootstrap route as the immediate post-auth landing page

## 9. Exact Likely Failing Transition Point

Exact likely transition point:

- the handoff between `BootstrapPage`'s server-side `redirect(...)` result and the browser committing the next route, while `NextClientClerkProvider` is simultaneously running post-`setActive` cache invalidation and `router.refresh()` on `/auth/bootstrap`

Most likely failing sequence:

1. Clerk callback completes
2. Clerk sets active session
3. provider `onBeforeSetActive` runs cache invalidation
4. browser is on `/auth/bootstrap`
5. `/auth/bootstrap` server path succeeds and returns redirect to `/onboarding?...` or `/users`
6. provider `onAfterSetActive` calls `router.refresh()` on the current route
7. the app re-enters `/auth/bootstrap` refresh/redirect flow instead of cleanly committing the next route
8. page remains stuck on bootstrap with `Rendering...`

## 10. Minimum Safe Next Fix Target

The minimum safe next fix target is:

1. the Clerk provider configuration in `src/app/layout.tsx`, specifically the post-auth App Router refresh behavior

Why this is the best next target:

- it directly matches the identified failing hook
- it is lower blast radius than redesigning provisioning or bootstrap logic
- middleware and bootstrap server behavior have already been ruled out as the primary divergence

Concretely, the safest next place to test/fix is:

- `src/app/layout.tsx`
- with the goal of preventing Clerk's immediate post-`setActive` refresh from destabilizing the `/auth/bootstrap` landing transition

Secondary target if needed after that:

1. stop using `/auth/bootstrap` as Clerk's immediate post-auth landing route, and instead land on a stable app route that can redirect into bootstrap after session state settles

## 11. Final Answer

- exact likely failing post-bootstrap transition point: the App Router handoff after `/auth/bootstrap` returns a server redirect, while `NextClientClerkProvider` is still running post-auth cache invalidation and `router.refresh()` on the current `/auth/bootstrap` route
- exact file/function most likely responsible: `NextClientClerkProvider` in installed `@clerk/nextjs` App Router client provider, activated by the repo’s `<ClerkProvider>` in `src/app/layout.tsx`
- issue class: primarily Clerk provider lifecycle plus App Router refresh behavior, secondarily amplified by using `/auth/bootstrap` as a transient post-auth landing page
- minimum safe next fix target: provider-level post-auth refresh behavior in `src/app/layout.tsx`, not middleware or bootstrap server logic

## 12. Residual Uncertainty

One limitation remains:

- this conclusion is strongly supported by repository code, installed Clerk runtime code, and the observed run traces, but it is still an inferred runtime failure path rather than a direct browser trace of the exact overlapping refresh event
