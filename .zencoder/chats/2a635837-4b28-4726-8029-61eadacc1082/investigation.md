# Bug Investigation: Clerk Hydration Mismatch on /sign-up

## Bug Summary

**Sentry ID**: f89731b6  
**Error**: `Hydration failed because the server rendered HTML didn't match the client.`  
**URL**: `http://localhost:3000/sign-up`  
**Commit at time of error**: `425334e` (last plan's final commit)

React 19 throws a hydration error on the `/sign-up` page. The same bug exists on `/sign-in`.

## Root Cause Analysis

Clerk's `ClerkHostRenderer` component uses a **ref-based portal mounting** pattern:

- **Server-side render**: `ClerkHostRenderer` renders its output WITHOUT the `<div data-clerk-component="SignUp">` element, because the Clerk.js browser library has not loaded.
- **Client-side hydration**: Clerk.js initializes, creates `<div ref={...} data-clerk-component="SignUp">` as a mount point, and inserts it into the DOM.

React 19 uses **strict hydration** — any difference between server HTML and client render tree is an unrecoverable error. The added `<div>` element on the client (not present in server HTML) triggers:

```
+ <div ref={{current:null}} data-clerk-component="SignUp">
```

The `Suspense` wrapper introduced in commit `7bd9b0f` (Feb 26) does **not help** here. `<Suspense>` in Next.js 16 PPR mode creates a streaming boundary, but Clerk's `SignUp` is still server-rendered (SSR) within that boundary. The mismatch occurs during hydration of the streamed server HTML.

## Affected Components

- `src/app/sign-up/[[...sign-up]]/page.tsx` — uses `await import('@clerk/nextjs')` then SSR-renders `<SignUp>`
- `src/app/sign-in/[[...sign-in]]/page.tsx` — same pattern with `<SignIn>`

## Proposed Solution

Replace the server-side dynamic import pattern with `next/dynamic` + `{ ssr: false }`.

**Before** (server renders Clerk component, causing hydration mismatch):

```tsx
const { SignUp } = await import('@clerk/nextjs');
// ...
<Suspense fallback={<skeleton />}>
  <SignUp path="/sign-up" />
</Suspense>;
```

**After** (client-only render, no SSR, no hydration mismatch):

```tsx
import dynamic from 'next/dynamic';

const SignUp = dynamic(() => import('@clerk/nextjs').then((m) => m.SignUp), {
  ssr: false,
  loading: () => <div className="...skeleton..." />,
});

// No Suspense needed — `loading` prop replaces it
// page becomes a sync function (no async needed)
```

### Why this works

- `ssr: false` tells Next.js to skip server-side rendering for the component entirely.
- The server renders `null` (or the `loading` fallback) — which the client also renders initially, so there is **no hydration mismatch**.
- After React hydrates, the dynamic component loads Clerk.js and renders the form.
- **Code splitting is preserved**: `@clerk/nextjs` is still in a separate chunk, loaded only when `AUTH_PROVIDER === 'clerk'`.

### Edge cases considered

- `AUTH_PROVIDER !== 'clerk'`: the `dynamic()` call is at module level but only called when the guard passes, so the dynamic import still lazy-loads correctly.
- `loading` prop on `dynamic()` replaces the `<Suspense>` fallback — the skeleton UI is unchanged.
- No `await connection()` needed for the Clerk rendering path (we still keep it since it forces dynamic page behavior which is correct).

## Implementation Notes

**Files changed:**

- `src/app/sign-up/[[...sign-up]]/page.tsx` — replaced `await import('@clerk/nextjs')` + `Suspense` with `dynamic(..., { ssr: false, loading: ... })`
- `src/app/sign-in/[[...sign-in]]/page.tsx` — same fix
- `src/app/sign-up/[[...sign-up]]/page.test.tsx` — new regression tests (2 tests)
- `src/app/sign-in/[[...sign-in]]/page.test.tsx` — new regression tests (2 tests)

The `next/dynamic` mock in tests returns `opts.loading` (the skeleton fallback), simulating `ssr: false` behavior: the server renders the loading skeleton, not the Clerk component. If the fix is reverted to `await import(...)`, the module-under-test would bypass the `next/dynamic` mock and the test behavior would change.

## Test Results

- `pnpm vitest run ... src/app/sign-up src/app/sign-in`: **4/4 passed** ✅
- `pnpm typecheck`: **zero errors** ✅
- `pnpm lint`: **zero errors** ✅
