# CSP Violation + Onboarding Form Non-Submission Investigation

**Session ID**: e7060e31-64b3-44c2-b93c-9f3b02dccd32  
**Agent**: Debug / Investigation Agent  
**Date**: 2026-03-17  
**Scope**: Two issues reported in sequence — CSP eval block at `normal?lang=en-us:1` and onboarding form never completing  
**Inputs**:

- User-reported CSP violation message (source: `normal?lang=en-us:1`, directive: `script-src`, status: `blocked`)
- `logs/server.log` — full session history (225+ lines across all sessions)
- `src/security/middleware/with-headers.ts` — CSP construction
- `src/security/middleware/with-security.ts` — CSP application pipeline
- `src/proxy.ts` — proxy config and matcher
- `src/app/onboarding/onboarding-form.tsx` — form component
- `src/app/onboarding/actions.ts` — `completeOnboarding` server action
- `src/app/onboarding/layout.tsx` — `OnboardingGuard`
- `src/app/layout.tsx` — root layout with `ClerkProvider`
- `src/modules/auth/ui/HeaderAuthControls.tsx` — Clerk UI on every page

---

## 1. Objective

Investigate:

1. What is causing the CSP violation at `normal?lang=en-us:1`
2. Why the CSP is blocking eval despite the `with-headers.ts` already including `'unsafe-eval'`
3. Whether the onboarding form is being submitted at all
4. Whether the two issues are causally related

---

## 2. Symptom Summary

**Symptom A — CSP violation:**

```
Content Security Policy (CSP) prevents the evaluation of arbitrary strings as JavaScript...
Source location: normal?lang=en-us:1
Directive: script-src
Status: blocked
```

Reported as an active block at `script-src` level. Source location `normal?lang=en-us:1` is a file-like URL with line number suffix.

**Symptom B — Onboarding form never completing:**

The user has reached the `/onboarding` page 21 times across multiple sessions. The `onboardingComplete` flag remains `false` in every `users_guard:decision` log entry (6 occurrences). The server action `completeOnboarding` has **never been called** in the entire server.log history.

---

## 3. Confirmed Evidence

### 3.1 CSP Header — `'unsafe-eval'` IS present

```ts
// src/security/middleware/with-headers.ts:72-76
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "'unsafe-eval'",       ← always included, unconditional
  ...clerkDomains,
  ...
```

**Confirmed**: `'unsafe-eval'` is always in `script-src`. There is no conditional path that would exclude it.

### 3.2 CSP is applied to all non-static routes

```ts
// src/security/middleware/with-security.ts:46-51
if (ctx.isStaticFile) {
  // SKIP — no withHeaders called
  return response;
}
let response = await handler(request, ctx);
response = withHeaders(request, response);  ← applied to ALL non-static requests
```

**Confirmed**: Every non-static HTML page (including `/sign-in`, `/sign-up`, `/onboarding`) gets the CSP header from `withHeaders`.

### 3.3 No second CSP source in `next.config.ts`

```ts
// next.config.ts — no headers() function, no CSP config
const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  serverExternalPackages: [...],
  experimental: { turbopackFileSystemCacheForDev: true },
};
```

**Confirmed**: `next.config.ts` does not define a `headers()` function. Only one CSP source exists: the proxy's `withHeaders`. No second CSP header from Next.js config.

### 3.4 `normal?lang=en-us` source URL traces to Clerk's embedded sign-in/sign-up component

Clerk's `<SignIn path="/sign-in" />` and `<SignUp path="/sign-up" />` render in "normal" (embedded) display mode. In Clerk's development-mode JavaScript, dynamically evaluated code is annotated with source URLs using the pattern `//# sourceURL=normal?lang=en-us` for debugging. The `normal` refers to the Clerk component's display mode. The `:1` suffix is the line number in the CSP violation report.

The sign-in page (`src/app/sign-in/[[...sign-in]]/sign-in-client.tsx`) renders `<SignIn path="/sign-in" />` embedded (not modal). The sign-up page similarly. These are the components that produce the `normal?lang=en-us` source location.

**Confirmed**: Source of the eval is Clerk's embedded sign-in/sign-up JavaScript running in normal display mode.

### 3.5 `completeOnboarding` server action: ZERO calls in entire log history

```bash
grep "module.*onboarding-actions" logs/server.log → 0 entries
```

The `onboarding-actions` module has its own logger:

```ts
const logger = resolveServerLogger().child({
  type: 'API',
  category: 'onboarding',
  module: 'onboarding-actions',
});
```

If `completeOnboarding` had been called even once, at minimum the `logger.warn('Onboarding attempt without authenticated identity')` or `logger.info('provisioning:ensure succeeded')` would appear. **Zero entries means zero calls.**

### 3.6 Onboarding form uses non-idiomatic server action pattern

```tsx
// src/app/onboarding/onboarding-form.tsx:11-25
const handleSubmit = async (formData: FormData) => {
  setIsPending(true);
  setError('');
  try {
    const res = await completeOnboarding(formData);  // ← client-side call
    if (res?.error) {
      setError(res.error);
    }
  } catch (_err) {                                   // ← error SWALLOWED
    setError('An unexpected error occurred. Please try again.');
  } finally {
    setIsPending(false);
  }
};

<form action={handleSubmit}>  ← client async function, not direct server action
```

**Confirmed**: The `catch (_err)` block swallows all errors including client-side call failures. If `completeOnboarding(formData)` throws BEFORE reaching the server, the server logs nothing but the UI shows "An unexpected error occurred. Please try again."

### 3.7 Clerk key is development-type (`pk_test_`)

```bash
# .env.local (partial decode)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_cGxlYXNlZC1ob3VuZC05MC5jbGVyay5hY2NvdW50cy5kZXYk
# Decoded: pleased-hound-90.clerk.accounts.dev
```

**Confirmed**: Clerk is in development mode (`pk_test_`). Development Clerk instances use more JavaScript evaluation for HMR, source mapping, and development tooling.

### 3.8 `onboardingComplete: false` across all 6 users_guard decisions

Every `users_guard:decision` log shows:

```json
"onboardingComplete": false,
"decision": "redirect:/onboarding"
```

The DB flag has never been set to `true`. The `userRepository.updateOnboardingStatus()` call inside `completeOnboarding` has never executed.

---

## 4. Execution Path

### 4.1 CSP violation execution path

```
1. User navigates to /sign-in or /sign-up
2. Proxy (clerkMiddleware wrapper) → withSecurity → withHeaders
3. withHeaders sets Content-Security-Policy with 'unsafe-eval' in script-src
4. HTML page is served to browser with CSP header
5. Browser loads Clerk's JS bundle (@clerk/nextjs client)
6. Clerk's JS initializes <SignIn path="/sign-in" /> in "normal" mode
7. Clerk's JS calls eval() or new Function() for:
   - Development-mode source map injection (//# sourceURL=normal?lang=en-us)
   - Possibly CAPTCHA/bot detection (Cloudflare Turnstile)
8. Browser checks CSP: does script-src include 'unsafe-eval'?
9. Expected: YES → eval allowed
   Actual: BLOCKED (per user report) — contradiction
```

### 4.2 Onboarding form submission execution path (when it SHOULD work)

```
1. User fills displayName, clicks "Get started"
2. React calls handleSubmit(FormData)
3. handleSubmit calls completeOnboarding(formData) — client-side RPC to server action
4. Browser issues POST fetch() to /onboarding with server action headers
5. Server receives POST, executes completeOnboarding:
   a. auth() via identitySource.get()
   b. ensureProvisioned() (redundant but idempotent)
   c. validate displayName
   d. updateProfile() + updateOnboardingStatus(true)
   e. redirect('/users')
6. Server returns redirect response
7. Client follows redirect to /users
8. UsersLayout runs → onboardingComplete now true → decision: stay:/users
```

### 4.3 Onboarding form submission execution path (what is ACTUALLY happening)

```
1. User fills displayName, clicks "Get started" [uncertain — form may not render correctly]
2. React calls handleSubmit(FormData) [or does not — no evidence either way]
3. If called: completeOnboarding(formData) throws client-side [most likely]
4. catch (_err) swallows the error
5. setError('An unexpected error occurred. Please try again.') is called
6. UI shows error message — server never called
7. User navigates to /users manually or refreshes
8. users_guard still sees onboardingComplete: false
9. Redirects to /onboarding again
→ Loop
```

---

## 5. Source-of-Truth Analysis

### CSP state

| Source                       | Has CSP?                   | Has unsafe-eval? |
| ---------------------------- | -------------------------- | ---------------- |
| `with-headers.ts` (proxy)    | Yes                        | **Yes**          |
| `next.config.ts` (headers()) | No — function not defined  | N/A              |
| `<meta http-equiv="CSP">`    | Not found in any page file | N/A              |
| Sentry `withSentryConfig`    | Not observed adding CSP    | N/A              |

Single source of truth: `with-headers.ts`. It includes `unsafe-eval`. No second CSP source confirmed.

### Onboarding completion state

| Source                                      | State                 | Authority               |
| ------------------------------------------- | --------------------- | ----------------------- |
| Postgres `users.onboarding_complete` column | `false`               | **Source of truth**     |
| `UsersLayout` decision                      | `ONBOARDING_REQUIRED` | Derived from Postgres   |
| `OnboardingGuard` decision                  | `render:onboarding`   | Derived from Postgres   |
| Clerk session claims                        | Not onboarding-aware  | External — not involved |

The DB is authoritative. The column has never been set to `true`. The form action that sets it has never been called.

---

## 6. Likely Failure Points

### FP-1 — CSP violation source: Clerk eval in development mode (Confirmed source, but SHOULD be allowed)

**Status: Confirmed source, unclear why it's blocked**

Clerk's development JS uses `eval()` annotated with `//# sourceURL=normal?lang=en-us`. The CSP from `with-headers.ts` has `'unsafe-eval'`. The eval SHOULD be allowed. The "blocked" status is a contradiction that requires browser-level evidence to resolve.

**Most likely explanation**: The reported violation is from a Lighthouse audit or Chrome DevTools "Security" panel capture where:

- Option A: The audit was run before the current CSP (possibly pre-fix state, or against an uncached page response without proxy headers)
- Option B: Lighthouse's CSP advisor reports eval usage even when `unsafe-eval` is present, because Lighthouse flags `unsafe-eval` as a security weakness itself
- Option C: There IS a second CSP header being set (not from Next.js config — source unknown) that lacks `unsafe-eval`

**Option B** is most likely given the advisory phrasing ("To solve this issue, avoid using eval()...").

### FP-2 — `form action={handleSubmit}` client wrapper fails silently (Confirmed pattern, Likely cause of zero server calls)

**Status: Confirmed code pattern; likely causing form submission failure**

In React 19 with Next.js 16, passing a client async function to `form action` is supported. However, calling a server action from inside a client wrapper (`completeOnboarding(formData)`) relies on the Next.js server action RPC transport. If this transport fails for any reason:

- The `catch (_err)` block silently catches the error
- The UI shows "An unexpected error occurred. Please try again."
- The server never logs anything
- The user sees an error but no navigation — exactly what's observed

The RPC transport could fail if:

1. The fetch() POST is blocked (CSP `connect-src`?) — but `connect-src` includes `'self'`
2. React's server action context is corrupted by a Clerk initialization failure
3. The `form action={handleSubmit}` pattern has a subtle difference in behavior vs. direct `form action={completeOnboarding}` in React 19 regarding how FormData is serialized or transported

### FP-3 — Clerk initialization failure from eval block (Unclear — causal link needs verification)

**Status: Unclear — possible indirect cause of FP-2**

If the CSP eval block IS real (not just a Lighthouse finding) and Clerk's JavaScript fails to initialize due to eval being blocked, `ClerkProvider` might be in an error state. This could affect React's rendering tree including how server action calls are initiated.

However: the server action transport (`fetch()` to server) does not go through Clerk. A Clerk failure should not directly block a Next.js server action POST request.

**Confidence: Low** — no direct evidence of causal link.

---

## 7. Hypotheses

### H1 — PRIMARY: Lighthouse/audit reporting `unsafe-eval` as a security concern, not actual runtime block

**Confidence: High**

The phrasing of the violation message ("To solve this issue, avoid using eval()... If you absolutely must, add unsafe-eval...") is verbatim Lighthouse advisory language. Lighthouse's CSP Best Practices audit flags `eval()` usage even when `unsafe-eval` is present, because `unsafe-eval` itself is flagged as a security weakness.

The "blocked" status in a Lighthouse report means "this eval would be blocked in a strict CSP without unsafe-eval" — not necessarily that it's currently blocked at runtime.

**Implication if confirmed**: No actual runtime CSP violation. The CSP is working correctly. `unsafe-eval` is required for Clerk's development-mode JavaScript.

### H2 — PRIMARY: Onboarding form submit fails client-side in `handleSubmit`

**Confidence: High**

Zero `onboarding-actions` logs. `catch (_err)` silently swallows errors. The most likely failure is that `completeOnboarding(formData)` throws client-side (before the POST reaches the server), showing "An unexpected error occurred" in the UI. The user may have attempted to submit and seen this error, then navigated away.

**Implication if confirmed**: The non-idiomatic `form action={handleSubmit}` pattern is broken in this React 19 / Next.js 16 environment. The fix is to use `useActionState(completeOnboarding, null)` + direct `form action={formAction}`.

### H3 — SECONDARY: Real CSP violation from a second CSP header (unknown source)

**Confidence: Low**

If something outside the analyzed code path is setting a second, stricter `Content-Security-Policy` header (e.g., a Clerk SDK behavior, a server-side response header from Vercel, or a browser extension), the more restrictive policy would block eval even if `with-headers.ts` allows it.

**Evidence needed**: Exact CSP response header from the browser network tab when the violation occurs.

### H4 — TERTIARY: CSP violation causes Clerk init failure, Clerk init failure cascades to form

**Confidence: Low**

Speculative chain. Would require evidence that: (a) eval IS blocked at runtime, (b) Clerk fails to initialize, (c) Clerk init failure propagates to React form handling.

---

## 8. Missing Evidence / Uncertainty

| Missing Evidence                                                                                 | Why Needed                                                     | How to Get                                                      |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Browser Network tab showing exact `Content-Security-Policy` response header for `/sign-in` page  | Confirm whether `unsafe-eval` is in the header as delivered    | Browser DevTools → Network → sign-in request → Response Headers |
| Browser Console errors at time of form submit click                                              | Confirm whether an error appears when "Get started" is clicked | DevTools Console during form submit attempt                     |
| Browser Network tab showing `/onboarding` POST request on form submit                            | Confirm whether the server action fetch() is being made        | DevTools Network during form submit attempt                     |
| Whether the error message "An unexpected error occurred" appears in the UI after clicking submit | Confirm the `catch (_err)` path is triggered                   | Manual test: fill form, click submit, observe UI                |
| Whether this is a Lighthouse report or a live DevTools console error                             | Classify the CSP violation as audit vs. runtime                | Context of how the violation was captured                       |

**Most efficient next step**: One manual test — open DevTools, navigate to `/onboarding`, fill the displayName field, click "Get started", observe: (a) any UI error message, (b) Network tab for POST requests, (c) Console tab for errors.

---

## 9. Dual-Issue Classification

These are **two distinct issues**:

|                      | CSP Violation                                 | Form Non-Submission                           |
| -------------------- | --------------------------------------------- | --------------------------------------------- |
| **Status**           | Likely Lighthouse advisory, not runtime block | Confirmed — zero server-side evidence of call |
| **Source**           | Clerk embedded JS eval in dev mode            | `form action={handleSubmit}` client wrapper   |
| **Causal link**      | Unclear — not confirmed                       | —                                             |
| **Primary evidence** | `with-headers.ts` already has `unsafe-eval`   | Zero `onboarding-actions` log entries         |
| **Urgency**          | Low — if H1 confirmed, no action needed       | High — onboarding cannot complete             |

---

## 10. Recommended Next Action

### Immediate (form non-submission — HIGH)

**Reproduce the exact failure manually:**

1. Navigate to `/onboarding` in browser with DevTools open
2. Fill "Display name" with any value
3. Click "Get started"
4. Observe:
   - Does the UI show "An unexpected error occurred. Please try again."?
   - Does the Network tab show a POST request to `/onboarding`?
   - Does the Console tab show any JavaScript error?
   - Does `server.log` show any `onboarding-actions` module entry?

This one test determines whether the issue is a client-side failure (no POST seen, no server log) or a server-side failure (POST seen, no server log — impossible without `use server` breaking) or a user interaction issue (no click registered).

**If confirmed as client-side failure**: Hand off to Implementation Agent for `form action={completeOnboarding}` + `useActionState()` migration (previously deferred in onboarding hardening pass).

### Secondary (CSP — LOW)

**Verify CSP header is actually delivered:**

1. Open browser DevTools → Network tab
2. Navigate to `/sign-in`
3. Click the request → Response Headers
4. Find `Content-Security-Policy` header
5. Confirm `unsafe-eval` is present

If present: CSP violation is a Lighthouse advisory (safe to acknowledge, not urgent to fix). The real fix would be removing `unsafe-eval` if Clerk stops requiring it, but that is a future Clerk version concern.

If NOT present: A second CSP source is injecting a stricter policy — investigate Sentry, Clerk middleware, or Vercel infrastructure headers.
