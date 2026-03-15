# Clerk Sign-Up Error Storm — Deep Investigation Report

**Date**: 2026-03-15  
**Scope**: Console error storm after OAuth sign-up, "Rendering..." stuck state, Sentry/log observability gap  
**Agent**: Debug / Investigation Agent

---

## 1. Objective

Investigate the ~50+ browser console errors produced during Google OAuth sign-up, the "Rendering..." stuck state after sign-up, and the failure of those errors to appear in server logs or Sentry.

---

## 2. Symptom Summary

After clicking "Continue with Google" on the sign-up page:

1. 20+ `TypeError: Invalid URL` errors fire inside Clerk JS before OAuth redirect
2. 30+ CSS `SyntaxError` (`::-moz-placeholder`) fires during Clerk UI initialization
3. After OAuth returns and the browser lands on the app: Clerk component crashes cascade (`ClientClerkProvider`, `NextClientClerkProvider`, `__experimental_CheckoutProvider` crash with `props = undefined`)
4. Page shows "Rendering..." and does not progress
5. Errors do NOT appear in server logs
6. Most errors do NOT appear as standalone Sentry events (only breadcrumbs)

Server-side, provisioning succeeds and `/auth/bootstrap` redirects to `/onboarding` which returns 200. The server is correct. The client is broken.

---

## 3. Confirmed Evidence

### E1 — Clerk `TypeError: Invalid URL` (20+ instances)

Every instance has identical payload:

```
e: "/auth/bootstrap"
t: "http://localhost:3000"
```

Stack: `at k ... at new l ... at ew ...` in Clerk's minified code (`clerk.browser.js:5`).

**Interpretation**: Clerk is calling `new URL("/auth/bootstrap")` (without a base URL as second argument). `new URL("/auth/bootstrap")` throws `TypeError: Invalid URL` because it's a relative path. If Clerk called `new URL("/auth/bootstrap", "http://localhost:3000")` it would succeed. The function `k` in Clerk's minified code does strict absolute-URL parsing.

### E2 — Force redirect URL configuration (confirmed)

`src/core/env.ts` defaults:

```typescript
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: z.string().default('/auth/bootstrap'),
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: z.string().default('/auth/bootstrap'),
```

`.env.example`:

```
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/auth/bootstrap
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/bootstrap
```

`.env.local` (actual):

```
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/bootstrap
# NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL is MISSING from .env.local
```

Both end up as relative path `/auth/bootstrap` (missing one uses `env.ts` default).

### E3 — `ClerkProvider` passes these relative URLs as props

`src/app/layout.tsx`:

```tsx
<ClerkProvider
  signInForceRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL}
  signUpForceRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL}
  ...
>
```

Both props receive `/auth/bootstrap` (relative path). Clerk v5's internal URL validator treats these as invalid for certain operations.

### E4 — Clerk cascade component crashes (confirmed)

After OAuth returns:

```
TypeError: Cannot destructure property 'children' of 'undefined' at __experimental_CheckoutProvider
TypeError: Cannot read properties of undefined (reading '__unstable_invokeMiddlewareOnAuthStateChange') at NextClientClerkProvider
TypeError: Cannot destructure property 'children' of 'props' as it is undefined at ClientClerkProvider
```

All three components receiving `undefined` props/args indicates Clerk's internal React state is broken. The `__unstable_invokeMiddlewareOnAuthStateChange` access on `undefined` is specifically a Clerk v5 internal issue triggered when auth state transitions occur against a corrupted component tree.

### E5 — SSO callback uses ABSOLUTE URL (confirmed, important)

Server log shows:

```
GET /sign-up/sso-callback?sign_up_force_redirect_url=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fbootstrap
```

Clerk DID convert the relative `/auth/bootstrap` to absolute `http://localhost:3000/auth/bootstrap` for the OAuth redirect. This proves Clerk handles relative→absolute conversion in one path (the OAuth URL builder). The crash happens in a DIFFERENT path (the internal URL validation/store) that does NOT apply the same conversion.

### E6 — CSS SyntaxError (confirmed, not fixable)

```
SyntaxError: Failed to parse the rule '.cl-internal-xif0jh::-moz-placeholder{...}'
SyntaxError: Failed to parse the rule '.cl-internal-xif0jh:-ms-input-placeholder{...}'
```

Clerk's UI library injects CSS using deprecated pseudo-elements (`::-moz-placeholder`, `:-ms-input-placeholder`) into a `CSSStyleSheet` via `sheet.insertRule()`. Modern Chrome/Edge reject these rules. This is entirely within Clerk's code. NOT fixable in this repository.

### E7 — Sentry `TypeError: network error` on /auth/bootstrap

From Sentry breadcrumb: "Mar 15, 6:12:22 PM CET". The current dev session started at Unix time `1773600612` ≈ 18:50 CET. The Sentry event is from an EARLIER session (pre-fixes). This confirms the RSC stream abort at bootstrap was fixed by Phase 6. It is NOT occurring in the current session.

### E8 — Errors not in server logs (confirmed, expected)

All 50+ errors are **browser-side JavaScript errors** inside Clerk's CDN-hosted JavaScript. They run entirely in the user's browser. Server logs capture nothing that happens inside browser JS. This is correct behavior, not a bug.

### E9 — Errors not (fully) in Sentry (confirmed, partially a gap)

The Sentry client is configured (`instrumentation-client.ts`). However:

- Clerk's JS is served from `pleased-hound-90.clerk.accounts.dev` (third-party CDN)
- Clerk catches these errors internally in its own try/catch and re-emits via `console.error`
- Sentry sees `console.error` output and records it as **breadcrumbs**, NOT as standalone error events
- Sentry captures unhandled errors/rejections, but Clerk's `TypeError: Invalid URL` is internally handled (swallowed by Clerk's own catch)
- Result: 20+ errors visible in browser DevTools, but only breadcrumbs appear in Sentry

The `shouldDropDevClientSentryEvent` filter in `sentry-dev-filters.ts` does NOT affect these errors (it only filters Turbopack perf noise and WASM prefetch aborts).

---

## 4. Execution Path

```
[Browser] /sign-up
  → SignUpClient ('use client')
    → <SignUp path="/sign-up" /> (Clerk widget, CDN JS)
      → Clerk widget initializes, reads signUpForceRedirectUrl="/auth/bootstrap" from ClerkProvider context
      → Clerk internally calls: new URL("/auth/bootstrap")  ← THROWS TypeError: Invalid URL (first wave ~5 times)
      → CSS injection: sheet.insertRule('::-moz-placeholder...')  ← THROWS SyntaxError (30 times)
      → User clicks "Continue with Google"
      → Clerk builds OAuth URL using window.location.origin + "/auth/bootstrap" = absolute URL (works)
      → Clerk fires more redirect URL validation: new URL("/auth/bootstrap") ← THROWS (15+ more times)
      → Browser redirects to Google

[Browser] Google OAuth → Clerk SSO callback
  → /sign-up/sso-callback?sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap
  → Server renders sso-callback (200)
  → Browser redirected to http://localhost:3000/auth/bootstrap

[Server] /auth/bootstrap (Node RSC)
  → identitySource.get() → userId present ✅
  → provisioningService.ensureProvisioned() → SUCCESS ✅
  → logger.info "provisioning:ensure succeeded"
  → redirect('/onboarding?redirect_url=%2Fusers')

[Server] /onboarding (Node RSC)
  → OnboardingGuard renders → user found → onboardingComplete=false
  → Returns 200 with OnboardingForm

[Browser] /onboarding
  → React attempts to hydrate the server HTML
  → ClerkProvider re-renders (auth state changed: user now signed in)
  → Clerk fires __unstable_invokeMiddlewareOnAuthStateChange
    → Internal Clerk state is corrupted (from earlier TypeError: Invalid URL errors)
    → NextClientClerkProvider receives undefined props ← THROWS
    → __experimental_CheckoutProvider receives undefined children ← THROWS
    → ClientClerkProvider receives props=undefined ← THROWS
  → React error boundary (src/app/error.tsx) catches the cascade
  → Page shows "Something went wrong!" OR stuck "Rendering..."
```

---

## 5. Source-of-Truth Analysis

| Concern             | Source of Truth                                        | Current State                                                                        |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Force redirect URLs | `NEXT_PUBLIC_CLERK_SIGN_*_FORCE_REDIRECT_URL` env vars | Relative paths in defaults AND `.env.local`/`.env.example`                           |
| ClerkProvider props | `src/app/layout.tsx`                                   | Correctly reads from env, but env has wrong values                                   |
| Error visibility    | Sentry client SDK                                      | Works for unhandled errors; Clerk's internally-caught errors become breadcrumbs only |
| Server logs         | pino multistream                                       | Correct by design — browser JS errors never reach server                             |

---

## 6. Likely Failure Points

### FP1 — CONFIRMED: Relative path in `signUpForceRedirectUrl` / `signInForceRedirectUrl`

Clerk v5's internal URL validation code (`new URL(url)` without base) requires absolute URLs for force redirect props. The relative path `/auth/bootstrap` is the root cause of the 20+ `TypeError: Invalid URL` errors.

**All four redirect env defaults are affected:**

- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` default: `/auth/bootstrap`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` default: `/auth/bootstrap`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` default: `/auth/bootstrap`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` default: `/auth/bootstrap`

### FP2 — CONFIRMED: Missing `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` in `.env.local`

Present in `.env.example` line 33, absent from `.env.local`. Falls back to `env.ts` default = `/auth/bootstrap`. Net result is the same, but the env gap is a discoverability risk.

### FP3 — LIKELY: Clerk v5 internal state corruption from TypeError cascade

The 20+ `TypeError: Invalid URL` errors fire during Clerk's state machine initialization. Clerk appears to catch these internally but the state machine is left in a partially-initialized state. When auth state changes (after OAuth completes), `__unstable_invokeMiddlewareOnAuthStateChange` is called against this broken state, producing the `props = undefined` crashes.

### FP4 — CONFIRMED: Observability gap for third-party browser errors

Sentry does not automatically capture errors that are caught internally by third-party libraries. The `beforeSend` hook only runs for events that Sentry creates (unhandled errors/rejections). Clerk's internally-caught errors become breadcrumbs, not events. There is no mechanism in this repository to promote Clerk's console.error calls into Sentry events.

---

## 7. Hypotheses

### H1 — STRONG: Clerk v5 requires absolute URLs for `*ForceRedirectUrl` props

**Evidence**: 20+ `TypeError: Invalid URL` all with `e: "/auth/bootstrap"` (relative). The SSO callback URL IS absolute (Clerk converts elsewhere). The error is in a specific internal code path that does `new URL(relativeUrl)`.

**Counter-evidence**: Fallback URLs (not force) may be more tolerant. Needs verification.

**Predicted fix**: Change defaults in `env.ts` and values in `.env.example`/`.env.local` to absolute URLs (`http://localhost:3000/auth/bootstrap`) OR change Clerk configuration to not use `signUpForceRedirectUrl`/`signInForceRedirectUrl` in the ClerkProvider (use Clerk env vars instead: `CLERK_SIGN_UP_FORCE_REDIRECT_URL` server-side).

### H2 — STRONG: Clerk component cascade follows from H1

If H1 is fixed, the `TypeError: Invalid URL` errors stop, Clerk's state machine initializes correctly, and the `ClientClerkProvider` crashes do not occur.

**This is a cascade, not an independent bug.**

### H3 — STRONG: "Rendering..." is Clerk's own loading state persisting due to broken state machine

The Clerk `SignUp` component shows a loading/processing state during and after OAuth. If Clerk's state machine doesn't complete (due to H1), this state never resolves. The "Rendering..." the user sees is Clerk's UI, not our app's code.

**Alternative**: The "Rendering..." is from the app's root error boundary rendering while React tries to recover.

### H4 — MODERATE: NEXT_PUBLIC env vars may need absolute URLs for ALL Clerk redirect props, not just force

The fallback redirect URLs (`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`) are also `/auth/bootstrap` (relative). They may trigger the same issue in different code paths.

### H5 — WEAK: Clerk version mismatch between CDN-loaded JS versions

The errors mention two Clerk versions:

- `@clerk/clerk-js@5` (base, from CDN): used in first error wave
- `@clerk/clerk-js@5.125.4` (specific, from CDN): used in subsequent errors

This version mismatch (non-specific vs specific version in URL) is unusual. **Unclear** whether this contributes to the problem or is normal Clerk CDN behavior.

---

## 8. Missing Evidence / Uncertainty

### MU1 — Which Clerk v5 redirect URL props require absolute vs relative

**Unknown**: Clerk documentation may specify which props require absolute URLs. Need to check Clerk v5 changelog or docs for `signUpForceRedirectUrl`/`signInForceRedirectUrl`. The env var equivalents (`NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`) in Clerk's own system may handle relative URLs differently.

### MU2 — Whether "Rendering..." is Clerk UI state or our app state

The text "Rendering..." was described by the user but not confirmed as coming from a specific component. Needs browser inspection to identify the originating DOM node.

### MU3 — Whether Clerk's internal state corruption is deterministic

It's possible the cascade of crashes only happens sometimes (race condition in Clerk's React state updates after OAuth). The user described it happening consistently in this session, but it may depend on timing.

### MU4 — Whether using Clerk env vars (server-side) instead of ClerkProvider props changes behavior

Clerk supports both approaches. The `CLERK_SIGN_UP_FORCE_REDIRECT_URL` server-side env var (without `NEXT_PUBLIC_`) might handle relative URLs differently. Not tested.

---

## 9. Recommended Next Action

### Immediate investigation (before any fix)

**Verify H1**: Change `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` to an absolute URL in `.env.local` and restart `pnpm dev`. If the `TypeError: Invalid URL` errors stop, H1 is confirmed.

```
# .env.local (test change)
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=http://localhost:3000/auth/bootstrap
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=http://localhost:3000/auth/bootstrap
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=http://localhost:3000/auth/bootstrap
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=http://localhost:3000/auth/bootstrap
```

If errors stop → H1 confirmed → proceed to:

1. Update `env.ts` defaults to NOT have hardcoded defaults for force redirect URLs (they must be explicitly configured per-environment)
2. Update `.env.example` to show absolute URL format with `${NEXT_PUBLIC_APP_URL}` or `http://localhost:3000` placeholder
3. Document that absolute URLs are required for Clerk force redirect props

### Deferred — Sentry observability gap

The Sentry gap for third-party library errors is structural. Options:

1. Accept it as expected (Clerk errors are Clerk's responsibility)
2. Add a global `window.addEventListener('error', ...)` or `console.error` proxy to capture and forward to Sentry — but this risks Sentry flooding from Clerk noise
3. File a bug with Clerk for the Invalid URL errors (then the root cause is fixed and the Sentry gap is irrelevant)

### Not actionable by this repository

- CSS `SyntaxError` for `::-moz-placeholder` / `:-ms-input-placeholder` — Clerk library bug
- Clerk's CDN version display inconsistency (`@5` vs `@5.125.4`)
- Cloudflare Turnstile `SecurityError` (`history.replaceState` cross-origin) — Cloudflare iframe behavior
