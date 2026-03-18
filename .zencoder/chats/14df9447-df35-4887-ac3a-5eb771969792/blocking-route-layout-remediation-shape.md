# Blocking-Route Layout Remediation Shape

**Agent**: Architecture Guard  
**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: 2026-03-18  
**Status**: Approved remediation shape defined — do not implement without reading this in full

---

## 1. Objective

Review the current `src/app/layout.tsx` state after the Suspense removal and define the minimum correct layout shape that satisfies:

1. Next.js 16 `cacheComponents: true` blocking-route compliance (the new "Data that blocks navigation was accessed outside of `<Suspense>`" enforcement)
2. Avoidance of the `fallback={null}` silent-trap pattern that masked the navigation hang
3. Correct ClerkProvider placement
4. Accurate scope of the Suspense boundary

---

## 2. Current-State Findings

### `src/app/layout.tsx` (post-removal state)

The outer `<Suspense fallback={null}>` has been removed. The current state is:

```tsx
<body className={...}>
  {isClerkProvider ? (
    <ClerkProvider ...>
      <AppLayoutContent>{children}</AppLayoutContent>
    </ClerkProvider>
  ) : (
    <AppLayoutContent>{children}</AppLayoutContent>
  )}
</body>
```

### `next.config.ts` — confirmed active configuration

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,   // ← Cache Components / PPR model active
  reactCompiler: true,
  ...
};
```

`cacheComponents: true` is the Next.js 16 Cache Components model. Under this model, Next.js enforces that any component that accesses **dynamic per-request data** (cookies, headers, Clerk auth state, etc.) must be wrapped in a `<Suspense>` boundary. Without Suspense, the framework throws:

> `Error: Data that blocks navigation was accessed outside of <Suspense>`

### Error stack — confirmed blame point

```
ClientClerkProvider
ClerkProvider
RootLayout
src/app/layout.tsx
```

`ClientClerkProvider` (the internal client component inside `@clerk/nextjs`'s `ClerkProvider`) uses React's `use()` hook to read Clerk's per-request auth state. `use()` requires a Suspense ancestor. Without one, Next.js 16 throws the blocking-route error.

**Conclusion**: The Suspense above `ClerkProvider` is not optional — it is a framework requirement under `cacheComponents: true`. The original placement was structurally correct. The original `fallback={null}` was the only wrong part.

---

## 3. Docs vs Code Drift

The `implementation-report.md` made the claim:

> "ClerkProvider does not suspend. Clerk's `ClerkProvider` is synchronous — it does not throw promises. It does not require an outer Suspense to function."

**This claim is incorrect and has been falsified by runtime evidence.**

`@clerk/nextjs` v6's `ClerkProvider` contains an internal `ClientClerkProvider` that calls `use()` on per-request auth state. Under `cacheComponents: true`, this requires a Suspense ancestor. The removal caused an immediate Next.js error.

The implementation assumption (ClerkProvider doesn't suspend) was incorrect for Next.js 16 with `cacheComponents: true`. This is an architectural constraint specific to this repo's configuration.

---

## 4. Architectural Assessment

### The two-part problem — correctly separated

There are **two distinct problems** that must not be collapsed into a single fix:

**Problem 1 (Suspense fallback policy)**: The `fallback={null}` above ClerkProvider silently traps concurrent navigation failures. This is an observability and UX failure. Fix: replace with a visible fallback.

**Problem 2 (Navigation hang root cause)**: The concurrent RSC navigation conflict (layout-level `redirect('/onboarding')` racing with Clerk's `router.refresh()` during post-SSO session finalization). This is an App Router routing bug. Fix: move the `ONBOARDING_REQUIRED` redirect to `src/proxy.ts` (middleware layer).

The Suspense removal attempted to fix both with one change. It fixed neither:

- Problem 1 was "fixed" in the wrong direction (removed fallback entirely → now causes a framework error)
- Problem 2 was not addressed (the hang root cause is in `UsersLayout`, not in the Suspense placement)

### Correct Suspense placement — architecturally

The Suspense must be **above `ClerkProvider`**, scoped to the Clerk branch. Reasoning:

1. `ClientClerkProvider` is the source of the blocking `use()` call — Suspense must be an ancestor of it
2. Suspense below ClerkProvider (e.g., inside AppLayoutContent) would not cover the blocking access point
3. Suspense is only required for the Clerk branch — the non-Clerk branch has no `use()` call

### Correct fallback — architecturally

The fallback must:

1. **Not be `null`** — null causes the silent-trap pattern. When the App Router is loading or a concurrent transition is interrupted, the fallback is shown. A null fallback shows a blank page with zero user signal and no probe visibility.
2. **Be visible** — a minimal layout shell matching the Header's visual footprint (`h-16`, sticky, border-b). This makes loading states and hang states observable by both users and probes.
3. **Not be a full-page spinner** — a page-level spinner would cause CLS on every page load. It must be scoped to the header shell height only.

### Impact on probe visibility

With a visible fallback in place of `null`:

- When the concurrent transition conflict occurs, the Suspense shows the header shell skeleton instead of blank
- The `RouteTransitionProbe` (inside AppLayoutContent, inside ClerkProvider, inside Suspense) would be replaced by the fallback during suspension — **this means the probe still would not log during the suspension phase**
- This is acceptable: the probe logging gap already tells us the route was not committed, and now the user sees a visible state rather than blank

This does NOT fix the navigation hang itself. The probe evidence gap (no `/onboarding` commit) would remain. The visible fallback only makes the failure observable.

### `OnboardingLayout` Suspense — secondary finding

`src/app/onboarding/layout.tsx` also has `<Suspense fallback={null}>` wrapping `OnboardingGuard`. This is a separate pattern (streaming an async server component), not the same as the root issue. However:

- `fallback={null}` here also silently hides slow guard execution from users
- The onboarding loading skeleton (`src/app/onboarding/loading.tsx`) already exists and provides the correct visible loading state for this route
- **Follow-up**: Consider whether the `fallback={null}` in `OnboardingLayout` should reference the `OnboardingLoading` skeleton instead — but this is a MINOR improvement, not a blocker

---

## 5. Risks

| Risk                                                                                            | Severity     | Status                                        |
| ----------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------- |
| Suspense removal from around ClerkProvider violates Next.js 16 `cacheComponents: true` contract | **CRITICAL** | Confirmed by runtime error — must be reversed |
| `fallback={null}` silently traps concurrent navigation failures                                 | **MAJOR**    | Must be replaced with visible fallback        |
| Navigation hang root cause (concurrent RSC conflict) remains unaddressed                        | **MAJOR**    | Separate fix required at `src/proxy.ts` level |
| `OnboardingLayout`'s `fallback={null}` hides slow guard execution                               | **MINOR**    | Improvement opportunity, not a blocker        |

---

## 6. Approved Minimum Fix Shape

### Target file: `src/app/layout.tsx`

**The minimum safe correction is a two-part change:**

1. **Restore** the `<Suspense>` above the Clerk branch
2. **Replace** `fallback={null}` with a visible header shell skeleton

**Approved shape:**

```tsx
import { Suspense } from 'react';  // restore import

// Minimal header shell — shown while ClerkProvider initializes
// Matches the Header component's h-16 sticky structure
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

// Inside RootLayout return:
<body className={...}>
  {isClerkProvider ? (
    <Suspense fallback={<RootLayoutShell />}>
      <ClerkProvider ...>
        <AppLayoutContent>{children}</AppLayoutContent>
      </ClerkProvider>
    </Suspense>
  ) : (
    <AppLayoutContent>{children}</AppLayoutContent>
  )}
</body>
```

### Why this shape is correct

| Requirement                                                  | Satisfied? | How                                                                                  |
| ------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------ |
| Next.js 16 `cacheComponents` blocking-route compliance       | ✅ YES     | Suspense above ClerkProvider satisfies `use()` ancestor requirement                  |
| No `fallback={null}` trap above shared route-commit boundary | ✅ YES     | Fallback is a visible header shell                                                   |
| ClerkProvider correctly placed                               | ✅ YES     | Position unchanged                                                                   |
| No Suspense wrapping the non-Clerk branch unnecessarily      | ✅ YES     | Suspense scoped to Clerk branch only                                                 |
| Navigation hang fixed                                        | ❌ NO      | This shape does not fix the hang — that requires a separate proxy.ts fix (see below) |

---

## 7. Exact Target File / Component Boundaries

### Required change — `src/app/layout.tsx`

| Element                                                            | Action                               |
| ------------------------------------------------------------------ | ------------------------------------ |
| `import { Suspense } from 'react'`                                 | Restore                              |
| `<Suspense fallback={null}>` (old, wrapping both branches)         | Do not restore                       |
| `<Suspense fallback={<RootLayoutShell />}>` scoped to Clerk branch | Add                                  |
| `function RootLayoutShell()`                                       | Add as local component in layout.tsx |
| ClerkProvider props and position                                   | Unchanged                            |
| AppLayoutContent                                                   | Unchanged                            |

### Not in scope for this fix

| File                            | Why not in scope                                                       |
| ------------------------------- | ---------------------------------------------------------------------- |
| `src/app/users/layout.tsx`      | Root cause fix for navigation hang — requires separate middleware pass |
| `src/proxy.ts`                  | Navigation hang root cause fix — separate pass                         |
| `src/app/onboarding/layout.tsx` | Minor improvement only — not required for compliance                   |

---

## 8. Forbidden Patterns — Explicitly Prohibited

1. **`<Suspense fallback={null}>` wrapping ClerkProvider** — forbidden. Silently traps concurrent navigation failures. Makes navigation hangs invisible to probes, users, and error reporters.

2. **No Suspense above ClerkProvider with `cacheComponents: true`** — forbidden. Violates Next.js 16 runtime contract. Causes immediate "Data that blocks navigation was accessed outside of `<Suspense>`" error.

3. **Single Suspense wrapping BOTH Clerk and non-Clerk branches** — wrong. The non-Clerk branch does not access blocking data and does not require Suspense. Wrapping both conflates two different cases unnecessarily.

4. **Suspense placed inside ClerkProvider but outside AppLayoutContent** — would not satisfy the blocking data requirement because `ClientClerkProvider` itself (inside ClerkProvider) is the one calling `use()`. Any Suspense placed inside ClerkProvider is downstream of the blocking access.

5. **Replacing the visible fallback with a full-page spinner or modal** — wrong. The fallback should only cover the header shell region. A full-page spinner would cause layout shift on every page load.

---

## 9. Navigation Hang — Separate Required Fix

**This architecture correction does NOT fix the navigation hang.**

The navigation hang root cause is:

- `UsersLayout` calls `redirect('/onboarding')` inside a streaming RSC response
- This creates an RSC-level client navigation to `/onboarding`
- Clerk's `router.refresh()` fires ~472ms later during post-SSO session finalization
- The two concurrent RSC navigations conflict; React never commits either
- The probe for `/onboarding` never fires; the user is stuck

**Required separate fix**: Move the `ONBOARDING_REQUIRED` redirect from `src/app/users/layout.tsx` to `src/proxy.ts` (the middleware layer). A middleware-level redirect sends an HTTP 302 before any RSC fetch begins, eliminating the race condition entirely.

This is a Next.js Runtime Agent decision that must be reviewed before implementation.

---

## 10. Recommended Next Action

**Step 1 (unblock immediately — Implementation Agent)**: Apply the shape defined in Section 6 to `src/app/layout.tsx`. This restores Next.js 16 compliance and replaces `fallback={null}` with a visible header shell.

**Step 2 (navigation hang fix — Next.js Runtime Agent review first)**: Design and implement the `ONBOARDING_REQUIRED` redirect at the `src/proxy.ts` middleware layer, removing the redirect from `UsersLayout`. This is the root cause fix for the navigation hang.

**Step 3 (optional minor improvement)**: Replace `fallback={null}` in `src/app/onboarding/layout.tsx` with an import of `OnboardingLoading` (which already exists at `src/app/onboarding/loading.tsx`).

Do not proceed to Step 2 until Step 1 is validated. Do not proceed to Step 2 without Next.js Runtime Agent review of the proxy.ts redirect approach.
