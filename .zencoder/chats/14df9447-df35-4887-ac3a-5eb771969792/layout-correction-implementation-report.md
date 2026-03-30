# Layout Correction Implementation Report

**Step**: Implementation — Layout Correction (Suspense with visible fallback)  
**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: 2026-03-18  
**Status**: IMPLEMENTED

---

## 1. Objective

Apply the Architecture Guard-approved shape from `blocking-route-layout-remediation-shape.md` to `src/app/layout.tsx`.

Approved changes:

- Restore `import { Suspense } from 'react'`
- Add local `RootLayoutShell` component (animated header skeleton)
- Wrap only the Clerk branch in `<Suspense fallback={<RootLayoutShell />}>`
- Do NOT wrap the non-Clerk branch
- Do NOT use `fallback={null}`

---

## 2. Affected Files / Modules

| File                 | Layer                       | Touch type                                     |
| -------------------- | --------------------------- | ---------------------------------------------- |
| `src/app/layout.tsx` | Delivery / App Router shell | Runtime behavior (Suspense boundary, fallback) |

- Contracts: no
- DI/composition: no
- Auth/security flows: no
- Runtime placement: yes (Suspense boundary scope)
- Public behavior: yes (layout renders visible skeleton during ClerkProvider init instead of null)
- Tests: no new tests required (no logic change; delivery-layer rendering behavior)

---

## 3. Implementation Plan

Narrow three-part edit to `src/app/layout.tsx` only:

1. Add `import { Suspense } from 'react'` (restore removed import)
2. Insert `function RootLayoutShell()` local component before `AppLayoutContent`, with an animated header skeleton matching the real `Header`'s h-16 sticky structure
3. Replace the unwrapped Clerk branch with `<Suspense fallback={<RootLayoutShell />}>` scoped around `<ClerkProvider>` only

Non-Clerk branch left unwrapped, as approved.

---

## 4. Changes Made

### `src/app/layout.tsx`

**Added import:**

```tsx
import { Suspense } from 'react';
```

**Added local component before `AppLayoutContent`:**

```tsx
function RootLayoutShell() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-black/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="h-5 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-9 w-20 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
      </div>
    </header>
  );
}
```

**Updated Clerk branch in `RootLayout` return:**

```tsx
{
  isClerkProvider ? (
    <Suspense fallback={<RootLayoutShell />}>
      <ClerkProvider
        signInUrl={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
        signUpUrl={env.NEXT_PUBLIC_CLERK_SIGN_UP_URL}
        waitlistUrl={env.NEXT_PUBLIC_CLERK_WAITLIST_URL}
        signInFallbackRedirectUrl={signInFallbackRedirectUrl}
        signUpFallbackRedirectUrl={signUpFallbackRedirectUrl}
        signInForceRedirectUrl={signInForceRedirectUrl}
        signUpForceRedirectUrl={signUpForceRedirectUrl}
      >
        <AppLayoutContent>{children}</AppLayoutContent>
      </ClerkProvider>
    </Suspense>
  ) : (
    <AppLayoutContent>{children}</AppLayoutContent>
  );
}
```

**No other files changed.**

---

## 5. Constraints Satisfied

| Requirement                                                                                     | Status       |
| ----------------------------------------------------------------------------------------------- | ------------ |
| Next.js 16 `cacheComponents: true` — Suspense ancestor for `use()` inside `ClientClerkProvider` | ✅ Satisfied |
| No `fallback={null}` above ClerkProvider                                                        | ✅ Satisfied |
| Suspense scoped to Clerk branch only                                                            | ✅ Satisfied |
| Non-Clerk branch unwrapped                                                                      | ✅ Satisfied |
| ClerkProvider props and position unchanged                                                      | ✅ Satisfied |
| `AppLayoutContent` unchanged                                                                    | ✅ Satisfied |
| No full-page spinner — fallback covers header region only                                       | ✅ Satisfied |

---

## 6. Validation / Verification

| Command                          | Result                     |
| -------------------------------- | -------------------------- |
| `pnpm typecheck`                 | ✅ Clean                   |
| `pnpm lint`                      | ✅ Clean                   |
| `pnpm arch:lint` (skott + madge) | ✅ Clean, no circular deps |
| `pnpm test`                      | ✅ 762/762 passing         |

**Pre-existing failure**: `src/core/db/migrations/config/drizzle.test.ts` — requires external `DATABASE_URL` for postgres migrations; unrelated to this change, present before and after.

---

## 7. Risks / Follow-ups

This correction restores Next.js 16 framework compliance and replaces the silent `fallback={null}` trap with a visible fallback. It does **not** fix the underlying navigation hang.

### Remaining open — navigation hang root cause

The concurrent RSC navigation conflict is still present:

- `src/app/users/layout.tsx` line 95: `redirect('/onboarding')` fires inside a streaming RSC response
- Clerk's `router.refresh()` fires ~472ms later during post-SSO session finalization
- Two concurrent RSC navigations conflict under React 19 concurrent mode — neither commits
- User is stuck on `/users` (or blank) with no error

**Required next step**: Next.js Runtime Agent must review and approve moving the `ONBOARDING_REQUIRED` redirect from `src/app/users/layout.tsx` to `src/proxy.ts` (middleware layer). A middleware-level 302 fires before any RSC fetch begins, eliminating the race entirely.

### Minor out-of-scope item noted

`src/app/onboarding/layout.tsx` wraps `OnboardingGuard` in `<Suspense fallback={null}>`. This is a minor issue (same `fallback={null}` pattern, lower risk since it is not at the root level). Not in scope for this pass.
