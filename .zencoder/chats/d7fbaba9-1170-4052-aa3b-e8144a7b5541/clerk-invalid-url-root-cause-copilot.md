# Clerk Invalid URL Root Cause

## 1. Objective

Identify the remaining Clerk client-side `TypeError: Invalid URL` failure as a standalone production-relevant issue, after the earlier server-side PGlite/bootstrap blocker was resolved.

Required answers:

- the exact remaining root cause
- the client file/component/provider stack involved
- whether this is a repository integration issue, a Clerk issue, or a browser/runtime issue
- the first reliable divergence point after server success
- what is explicitly no longer the root cause
- whether implementation can proceed directly

## 2. Current-State Findings

### 2.1 The server-side blocker is resolved

The earlier post-auth failure caused by local PGlite runtime/storage invalidity is no longer the active blocker.

Evidence:

- after `pnpm db:reset:pglite`, server logs show healthy post-auth flow again
- `logs/server.log` repeatedly shows `users_guard:decision` with:
  - `decision: stay:/users`
  - `reason: already_ready`
  - `status: ALLOWED`
- the server is successfully serving authenticated `/users` requests and successful `/api/users` traffic after provisioning completed

This matters because it removes the prior ambiguity around whether the browser crash was just downstream fallout from a broken server bootstrap path.

### 2.2 The repository still passes raw relative Clerk post-auth redirect targets

Current active config still uses relative redirect values:

- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/users`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/users`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/users`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/users`

These values are intentionally better than the previous `/auth/bootstrap` landing, but they are still relative URL strings.

Repository integration points:

- `src/core/env.ts` exposes those values as plain strings without absolute-URL normalization
- `src/app/layout.tsx` passes them directly into `ClerkProvider`
- `src/modules/auth/ui/HeaderAuthControls.tsx` passes them directly into modal `SignInButton` and `SignUpButton`

### 2.3 The `Invalid URL` payload changed, but the defect class did not

Earlier direct browser evidence showed the same Clerk client exception with `/auth/bootstrap`.

Current evidence in the same investigation folder now shows:

- `TypeError: Invalid URL`
- stack-local values include:
  - `e: "/users"`
  - `t: "http://localhost:3000"`

That is the key comparison point.

What changed:

- the redirect target moved from `/auth/bootstrap` to `/users`

What did not change:

- the value passed into Clerk is still a relative string
- Clerk still reaches a client path that throws `Invalid URL`

So the landing-route remediation reduced one bad landing target, but it did not eliminate the underlying redirect-input defect.

### 2.4 The repository wrapper layers do not normalize the values before Clerk consumes them

Installed package inspection shows:

- `@clerk/nextjs/dist/esm/utils/mergeNextClerkPropsWithEnv.js` forwards the redirect props as-is
- `@clerk/clerk-react/dist/index.mjs` forwards `handleRedirectCallback`, `redirectToAfterSignIn`, `redirectToAfterSignUp`, and related flows into the loaded Clerk browser runtime
- the user-visible throw remains in Clerk's browser bundle, not in repository code

This means the repository is providing the risky input and Clerk is the code that actually throws.

### 2.5 Clerk still has URL-building branches that require absolute URLs or explicit bases

Installed Clerk backend/runtime code contains URL handling paths such as:

- `legacyBuildUrl(...)`, which throws when both target and return URL are not absolute
- `new URL(authenticateContext.signInUrl)` in a development multi-domain sync branch
- general redirect builders that assume a valid base and a valid target pairing

Separately, prior browser evidence and current package inspection show that the client redirect/callback path is ultimately handled inside hosted `clerk.browser.js`.

The important point is not that every Clerk path is broken for relative URLs. The important point is that at least one still-reached client path is.

### 2.6 App Router refresh is still in the failure chain, but not as the primary trigger

`@clerk/nextjs/dist/esm/app-router/client/ClerkProvider.js` still wires:

- `window.__unstable__onBeforeSetActive`
- `window.__unstable__onAfterSetActive`

Those hooks invalidate cache and trigger `router.refresh()` during session activation.

This does not appear to be the original source of `Invalid URL`. It is the mechanism that makes the broken client auth transition fan out into a broader provider/render failure once Clerk's redirect/session state is already invalid.

## 3. Exact Root Cause

The remaining root cause is:

The repository still passes relative post-auth redirect URLs such as `/users` directly into Clerk client-facing redirect props, and Clerk still reaches a client-side redirect/callback code path that parses or rebuilds one of those values in a way that requires an absolute URL or a correctly paired base URL. That path throws `TypeError: Invalid URL` inside Clerk's browser runtime. The subsequent Clerk `setActive` and App Router refresh sequence then exposes the broken auth state as a wider client/provider failure.

Condensed version:

- trigger: repo passes relative Clerk redirect props
- throw site: Clerk browser runtime
- amplifier: Clerk App Router `setActive` plus `router.refresh()`

## 4. Client Stack Involved

The relevant client/integration stack is:

1. `src/core/env.ts`
   - exposes Clerk redirect values as plain strings

2. `src/app/layout.tsx`
   - passes raw redirect strings into `ClerkProvider`

3. `src/modules/auth/ui/HeaderAuthControls.tsx`
   - passes the same raw redirect strings into modal `SignInButton` and `SignUpButton`

4. `@clerk/nextjs`
   - merges env/prop values without normalizing them

5. `@clerk/clerk-react`
   - forwards auth callback and redirect flows into Clerk JS

6. hosted `clerk.browser.js`
   - produces the observed client-side `TypeError: Invalid URL`

7. `NextClientClerkProvider` App Router hooks
   - `__unstable__onBeforeSetActive`
   - `__unstable__onAfterSetActive`
   - cache invalidation and `router.refresh()`

That is the production-relevant stack. The repository is not crashing because `/users` is wrong as an application route. It is crashing because Clerk-facing redirect inputs are still being supplied in a format that some Clerk client path does not safely handle.

## 5. First Reliable Divergence Point After Server Success

The first reliable divergence point is after server success has already occurred and after the browser has a valid post-auth landing candidate.

More precisely:

1. the server authenticates successfully
2. `/users` is allowed server-side with `reason: already_ready`
3. Clerk client code proceeds into post-auth redirect/session activation handling
4. Clerk browser runtime hits a URL-parsing/build step involving the relative redirect target and throws `TypeError: Invalid URL`
5. Clerk provider activation and App Router refresh then run on top of that broken state and the client tree destabilizes further

So the reliable divergence is not:

- before auth
- in provisioning
- in `/users` server guard logic
- in bootstrap

It is in the client-side Clerk handoff after server success.

## 6. Classification

This is best classified as a boundary defect with a clear primary trigger.

### Primary trigger: repository integration/configuration

The repository supplies Clerk redirect props in a relative format.

### Throw site: Clerk client runtime

Clerk's client/browser runtime is where `TypeError: Invalid URL` is actually thrown.

### Secondary amplifier: Next App Router integration behavior

Clerk's App Router integration performs cache invalidation and `router.refresh()` during `setActive`, which makes the failure more disruptive once the client redirect/session path is already broken.

### Not a generic browser bug

There is no evidence that this is a standalone browser engine issue. The browser is correctly throwing because a URL-construction path received input Clerk did not safely normalize in this flow.

## 7. What Is No Longer the Root Cause

The following are no longer the active root cause of the remaining issue:

- local PGlite runtime/storage corruption
- the earlier server-side provisioning/bootstrap failure
- `/users` guard logic itself
- direct Clerk landing on `/auth/bootstrap`
- generic CSP or Cloudflare Turnstile console noise
- missing provisioning records after auth

Important nuance:

- changing the landing route from `/auth/bootstrap` to `/users` was still a correct low-blast-radius improvement
- it removed one dangerous landing target
- it did not remove the deeper issue that the Clerk-facing redirect values are still relative strings

## 8. Successful Run vs Failing Run

### Earlier failing run

- server-side state was polluted by the PGlite failure
- browser also showed Clerk client `Invalid URL`
- the two problems were entangled

### Current successful server run

- provisioning completes
- `/users` is repeatedly allowed with `already_ready`
- authenticated API traffic succeeds

### Current remaining failing behavior

- browser still throws Clerk-side `Invalid URL`
- payload has shifted from `/auth/bootstrap` to `/users`
- this proves the old route was not the full problem
- the defect class survives because the input format is still relative

## 9. Production Relevance

This issue remains production-relevant.

Why:

- the repository integration pattern is environment-agnostic: it passes relative Clerk redirect props in all environments unless explicitly normalized first
- the user reports that the same failure category also occurs in production
- the current evidence no longer depends on dev-only PGlite instability

Important nuance:

- development App Router timing and Clerk dev-browser flows may make the failure easier to hit locally
- that does not reduce the production relevance of the underlying redirect-input defect

## 10. Minimum Safe Next Fix Target

The minimum safe next fix target is the Clerk integration boundary in the repository, not bootstrap, middleware, or provisioning.

Specifically:

- normalize Clerk post-auth redirect props to absolute URLs before passing them to Clerk
- do that in one shared repository-owned place
- apply it consistently to:
  - `ClerkProvider` props in `src/app/layout.tsx`
  - modal button props in `src/modules/auth/ui/HeaderAuthControls.tsx`

The repository already has a canonical public-origin source available:

- `NEXT_PUBLIC_APP_URL`

That means the next implementation can stay narrow:

- keep `signInUrl` and `signUpUrl` as route paths if desired
- normalize only the post-auth redirect targets that Clerk later parses/builds

## 11. Can Implementation Proceed Directly?

Yes.

Implementation can proceed directly without another broad architecture investigation.

Reason:

- the canonical public origin already exists in config as `NEXT_PUBLIC_APP_URL`
- the affected surface area is small and explicit
- the server-side auth/provisioning path has already been revalidated as healthy

What should not be done instead:

- do not return to bootstrap-route redesign
- do not add more client auth observers
- do not patch Clerk internals
- do not treat CSP warnings as the main issue

## 12. Bottom Line

The remaining issue is not that `/users` is the wrong post-auth route.

The remaining issue is that the repository still gives Clerk relative post-auth redirect strings, and Clerk still reaches a client-side URL-construction path that does not safely tolerate those values. The crash happens in Clerk's browser runtime after server success, and Clerk's App Router activation hooks then magnify the failure into a broader client/provider collapse.

That is precise enough to implement the next fix safely.
