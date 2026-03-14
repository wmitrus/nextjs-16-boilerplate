# Onboarding Runtime Investigation

# "Why does sign-up flow stop at /onboarding?redirect_url=%2Fusers"

**Agent**: Next.js Runtime Agent  
**Mode**: Change / Flow Investigation  
**Status**: RISKY — one actionable navigation anti-pattern identified

---

## 1. Objective

Determine whether the flow stopping at `/onboarding?redirect_url=%2Fusers` after successful bootstrap is:

- intentional flow design (user action required), or
- a UI/runtime defect preventing navigation to `/users`

---

## 2. Current-State Findings

### File map (all confirmed via code inspection)

| File                                     | Runtime                           | Role                                                             |
| ---------------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `src/app/onboarding/layout.tsx`          | Server Component (Node)           | `OnboardingGuard` — identity check, onboarding state check       |
| `src/app/onboarding/page.tsx`            | Server Component (Node)           | Reads `searchParams.redirect_url`, renders `<OnboardingForm>`    |
| `src/app/onboarding/onboarding-form.tsx` | Client Component (`'use client'`) | Form UI, `handleSubmit`, `router.push`                           |
| `src/app/onboarding/actions.ts`          | Server Action (`'use server'`)    | Provisions, validates, updates DB, **returns `{ redirectUrl }`** |

### OnboardingGuard (layout.tsx)

- Resolves identity via Node DB lookup (internal UUID)
- Checks `user.onboardingComplete`:
  - `false` → renders the form page (passes `children`)
  - `true` → `redirect('/users')` — user who already onboarded is bounced back immediately
- `UserNotProvisionedError` → `redirect('/auth/bootstrap')`
- Wrapped in `<Suspense fallback={null}>`

### OnboardingPage (page.tsx)

```tsx
const { redirect_url } = await searchParams;
const safeRedirectUrl = sanitizeRedirectUrl(redirect_url ?? '', '/users');
return <OnboardingForm redirectUrl={safeRedirectUrl} />;
```

- Dynamic by design (reads `searchParams`) → **NOT cached** by `cacheComponents: true`
- Passes sanitized `redirectUrl` to the form

### OnboardingForm (onboarding-form.tsx) — CLIENT

```tsx
<form action={handleSubmit}>
  <input type="hidden" name="redirect_url" value={redirectUrl} />
  ...
  <input name="displayName" required />
  ...
</form>
```

Where `handleSubmit` is:

```tsx
const handleSubmit = async (formData: FormData) => {
  setIsPending(true);
  const res = await completeOnboarding(formData);
  if (res?.message) {
    router.push(res.redirectUrl ?? redirectUrl);
  }
  if (res?.error) {
    setError(res.error);
  }
};
```

### completeOnboarding (actions.ts) — SERVER ACTION

On success:

```typescript
return { message: 'Onboarding completed', redirectUrl: safeRedirectUrl };
```

Does **NOT** call `redirect()`. Returns a value and delegates navigation to the client.

---

## 3. Runtime Boundary Assessment

### Expected flow at `/onboarding`

```
OnboardingGuard (RSC Node)
  → identity resolved (DB lookup, internal UUID)
  → user found, onboardingComplete = false
  → renders form

OnboardingPage (RSC Node)
  → reads searchParams.redirect_url = '/users'
  → renders <OnboardingForm redirectUrl="/users" />

OnboardingForm (Client — hydrated in browser)
  → user fills displayName (required field)
  → user clicks "Get started"
  → browser validates required fields (displayName must be non-empty)
  → React 19 form action: calls handleSubmit(formData)

handleSubmit (client-side async)
  → calls completeOnboarding(formData) [Server Action, runs on server]
  → Server Action: provisions (idempotent), updates profile, sets onboardingComplete=true
  → returns { message: 'Onboarding completed', redirectUrl: '/users' }
  → client: router.push('/users')
```

### Condition that stops flow at /onboarding

**Condition 1 — BY DESIGN (primary condition):**  
`onboardingComplete = false` after bootstrap is intentional. Bootstrap provisions the user row with `onboardingComplete=false`. The form is the explicit gating mechanism before `/users` access. **The user must fill and submit the form.** This is not a bug.

**Condition 2 — RUNTIME CONCERN:**  
The `completeOnboarding` server action uses `return { redirectUrl }` instead of `redirect()`. Navigation to `/users` depends on:

1. Client-side `router.push` executing after the action resolves
2. The push not being cancelled, deferred, or swallowed by React's transition system
3. The RSC fetch for `/users` succeeding immediately after

This pattern is less reliable than the framework-native `redirect()` call.

---

## 4. Runtime Concern: Navigation Pattern Divergence

### What bootstrap uses (correct pattern)

`src/app/auth/bootstrap/page.tsx`:

```typescript
redirect(`/onboarding?redirect_url=${encodeURIComponent(safeTarget)}`);
redirect(safeTarget);
```

Uses `redirect()` from `next/navigation` — **server-side, framework-level redirect**. Next.js throws a `NEXT_REDIRECT` response that the client handles automatically. This is reliable regardless of client state.

### What the onboarding action uses (weaker pattern)

`src/app/onboarding/actions.ts`:

```typescript
return { message: 'Onboarding completed', redirectUrl: safeRedirectUrl };
```

Delegates navigation to the client's `router.push`. This introduces three failure modes:

**Failure mode A — React 19 form action transition interference**  
`<form action={handleSubmit}>` wraps `handleSubmit` in `startTransition`. React 19 is still in a pending transition when `router.push` is called. In most cases this works, but under React Compiler optimizations (`reactCompiler: true`), the behavior of closures within transitions may differ from unoptimized React.

**Failure mode B — `router.push` soft navigation vs stale RSC**  
`router.push('/users')` triggers a client-side RSC fetch. If the cache has a stale entry for `/users` (e.g., from `cacheComponents: true` interacting with the layout's RSC payload), the user might see a stale `/users` render that re-runs `UsersLayout`'s access check with outdated data. However, `UsersLayout` does a live DB check, so this should resolve correctly.

**Failure mode C — Client component unmount before navigation**  
If the Suspense boundary or navigation causes the `OnboardingForm` to unmount before `router.push` fires, the push is swallowed. This is unlikely but possible in rapid navigation scenarios.

### Impact of `cacheComponents: true`

`OnboardingPage` reads `searchParams` → **dynamic rendering** → not cached.  
`OnboardingGuard` does live DB lookups (not `fetch`-based) → React Compiler cannot safely cache it.  
`OnboardingForm` is a Client Component → never server-cached.

**`cacheComponents: true` is NOT a factor in this flow stopping.** The concern is orthogonal.

---

## 5. Docs vs Code Drift

No relevant docs to check for this flow. However:

**`.env.local` divergence** (confirmed, MAJOR):

- `.env.local`: `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/onboarding`
- `.env.example`: `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/bootstrap`

This means in the dev environment, new sign-ups skip `/auth/bootstrap` and land at `/onboarding` first, triggering a `UserNotProvisionedError` before being redirected to bootstrap. This adds latency and a server error log per sign-up. Does not break the flow, but is not the intended design.

---

## 6. Risks

### MAJOR — Server action returns URL instead of calling `redirect()`

**Surface**: `src/app/onboarding/actions.ts`  
**Risk**: `router.push` relies on client-side execution after a React 19 form action transition. Three failure modes exist (transition interference, stale cache, unmount race). Under `reactCompiler: true`, closure and memoization behavior adds additional uncertainty.  
**Contrast**: All other navigations in this flow (`bootstrap/page.tsx`, `OnboardingGuard`) use `redirect()` — framework-level, reliable, consistent.  
**Fix**: Replace `return { redirectUrl }` with `redirect(safeRedirectUrl)` called directly in the server action.

### MINOR — `form action={clientFn}` wrapping a Server Action

**Surface**: `onboarding-form.tsx`  
**Risk**: Using a client-side `handleSubmit` as the form `action` (which then calls the Server Action internally) loses progressive enhancement. If JavaScript fails to hydrate or load, the form submission does nothing. Not a real-world risk for a Clerk-authenticated app (Clerk requires JS), but it's an anti-pattern for App Router forms.  
**Fix**: If `redirect()` is moved into the server action, the form's `action` prop can be set directly to the Server Action reference: `<form action={completeOnboarding}>`. The `handleSubmit` wrapper would no longer be needed.

### INFORMATIONAL — `displayName` `required` + React 19 form actions

React 19 `form action={fn}` does run native browser validation before calling the function. The `required` attribute is respected. No risk here.

---

## 7. Summary of Answers

| Question                                          | Answer                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| What is `/onboarding` expected to do next?        | Render form; wait for user to fill `displayName` and submit; call `completeOnboarding`; navigate to `/users`                    |
| Is `onboardingComplete=false` by design?          | **YES** — bootstrap provisions user with `onboardingComplete=false`; the form is the required gate                              |
| Does the page require explicit user action?       | **YES** — form must be filled and submitted; no auto-advance                                                                    |
| Is there a UI/runtime issue?                      | **Potentially** — `router.push` navigation after a React 19 form action is less reliable than `redirect()` in the server action |
| Is this server-side, client-side, or intentional? | **Intentional flow design** + **client-side runtime concern** (navigation pattern)                                              |
| Next best fix target                              | Replace `return { redirectUrl }` + `router.push` with `redirect(safeRedirectUrl)` inside `completeOnboarding`                   |

---

## 8. Recommended Next Action

**Minimum safe fix**: Move navigation out of the client and into the server action.

In `src/app/onboarding/actions.ts`:

```typescript
// Instead of:
return { message: 'Onboarding completed', redirectUrl: safeRedirectUrl };

// Use:
redirect(safeRedirectUrl);
```

In `src/app/onboarding/onboarding-form.tsx`:

- Simplify: pass `completeOnboarding` directly as the form `action`
- Remove `handleSubmit`, `router.push`, and `isPending` state
- Use `useFormStatus()` or `useActionState()` for pending/error state

This aligns with how all other navigation in this flow is implemented (server-side `redirect()`), eliminates the React 19 transition/`router.push` concern, and restores the ability to pass the Server Action directly to the form's `action` prop.

**Before implementing**: This is a behavior change. The Implementation Agent should update tests accordingly. The Validation Strategy Agent should assess the minimum test scope.

**This step is Investigation only — no implementation performed.**
