# Preview Deploy Suspense Failure — Investigation Report

**Session ID**: e7060e31-64b3-44c2-b93c-9f3b02dccd32  
**Agent**: Debug / Investigation Agent  
**Date**: 2026-03-30  
**Input**: `logs/preview-deploy.log` — Vercel preview deploy CI run (PR #27, commit `edb0ca1`)  
**Status**: ROOT CAUSE CONFIRMED

---

## 1. Objective

Investigate the preview deploy build failure. User reports the build is failing "because of some suspense". Identify the exact root cause and the precise fix required.

---

## 2. Symptom Summary

Build fails during `Generating static pages` phase (16/22 complete). The error is thrown by Next.js's static prerender worker:

```
Error: Route "/sign-in/[[...sign-in]]": Uncached data was accessed outside of <Suspense>.
    at body (<anonymous>)
    at html (<anonymous>)
```

```
Error occurred prerendering page "/sign-in/[[...sign-in]]"
Export encountered an error on /sign-in/[[...sign-in]]/page: /sign-in/[[...sign-in]], exiting the build.
Next.js build worker exited with code: 1
```

References `https://nextjs.org/docs/messages/blocking-route`.

---

## 3. Confirmed Evidence

### 3.1 `connection()` Called at Page Top Level — Sign-In

`src/app/sign-in/[[...sign-in]]/page.tsx`:

```tsx
export default async function Page() {
  await connection();  // VIOLATION: at page function top level, no page-level Suspense
  ...
}
```

### 3.2 Same Violation in Sign-Up

`src/app/sign-up/[[...sign-up]]/page.tsx`:

```tsx
export default async function SignUpPage() {
  await connection();  // same violation
  ...
}
```

Sign-up would fail identically — build aborted before reaching it.

### 3.3 `cacheComponents: true` Is Active

`next.config.ts`:

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  ...
};
```

### 3.4 Next.js 16.1.7 Installed (Upgraded from 16.1.6)

From deploy log line 234: `+ next 16.1.7`

`package.json` specifies `"next": "16.1.6"` with `^` range. The `pnpm-lock.yaml` was updated in the latest commit (`dee127c`), bumping Next.js to `16.1.7`. This version bump likely tightened the enforcement of the "uncached data outside Suspense" rule.

### 3.5 Root Layout Suspense Is NOT Sufficient

`src/app/layout.tsx` wraps content in Suspense for the Clerk branch. In Next.js 16 Cache Components mode, an **ancestor layout's** Suspense boundary does not substitute for a **page-level** Suspense around the component calling `connection()`. The dynamic access must be enclosed in Suspense at the component calling it, not only at a distant layout ancestor.

### 3.6 Next.js 16 Docs Pattern for `connection()` + `cacheComponents`

Per the Next.js 16 `connection()` documentation:

```tsx
// CORRECT: connection() in a child component, wrapped in Suspense at page level
async function DynamicContent() {
  await connection();
  ...
}

export default function Page() {
  return (
    <Suspense>
      <DynamicContent />
    </Suspense>
  );
}
```

The sign-in and sign-up pages do the OPPOSITE — they call `connection()` at the top of the exported Page function itself.

---

## 4. Execution Path

```
next build (static generation, cacheComponents=true)
  └── /sign-in/[[...sign-in]] prerender
        └── html > body (RootLayout, sync, no dynamic access here)
              └── <Suspense fallback={<RootLayoutShell />}>  ← layout-level only
                    └── <ClerkProvider>
                          └── <AppLayoutContent>
                                └── {children} = Page()
                                      └── await connection()  ← THROWS here
```

Next.js prerender worker encounters `connection()` inside `Page()` and checks: is this component wrapped in a Suspense boundary **at the page segment level**? Answer: NO. The only Suspense is in the root layout, which is not close enough. Next.js throws the blocking-route error and reports it at `body` / `html` (the root of the prerender tree).

---

## 5. Source-of-Truth Analysis

- `connection()` was intentionally placed to prevent sign-in/sign-up from being statically cached — correct intent
- The **placement** is wrong: `connection()` must be inside a Suspense-wrapped child component, not at the exported Page function's top level
- Root layout Suspense is for the layout's own dynamic content (Clerk auth state in header), not a substitute for page-level dynamic boundaries

---

## 6. Likely Failure Points

1. **Confirmed**: `sign-in/[[...sign-in]]/page.tsx:8` — `await connection()` at page top level
2. **Confirmed**: `sign-up/[[...sign-up]]/page.tsx:8` — identical pattern

---

## 7. Hypotheses

### H1 — CONFIRMED: `connection()` at Page Top Level Without Page-Level Suspense

The Next.js 16 Cache Components model requires `connection()` to be called from a child component wrapped in `<Suspense>`. Both pages call it at the top level of the exported Page function.

### H2 — Likely: Next.js 16.1.7 Tightened Enforcement

16.1.7 (upgraded from 16.1.6 via lockfile update) likely enforces the "blocking route" rule more strictly. The violation was latent; 16.1.7 surfaced it as a hard build error.

### H3 — Eliminated: Root Layout Suspense Mis-Configuration

The root layout's Suspense is correctly structured for its purpose. The failure is in the page components, not the layout.

---

## 8. Missing Evidence / Uncertainty

- **Unclear**: Whether prior builds on 16.1.6 passed — if yes, 16.1.7 is the tipping point. If builds were not running previously, the violation was always present.
- **Needs verification**: Sign-up failure is inferred, not directly observed in logs (build aborted before reaching it).

---

## 9. Recommended Next Action

**READY FOR IMPLEMENTATION** — root cause is confirmed, fix is unambiguous.

### Fix: 2 Files

**Pattern to apply to both `sign-in` and `sign-up` pages**:

```tsx
// BEFORE:
export default async function Page() {
  await connection();
  // ...content
}

// AFTER:
import { Suspense } from 'react';

async function SignInPageContent() {
  // or SignUpPageContent
  await connection();
  // ...same content unchanged
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SignInPageContent />
    </Suspense>
  );
}
```

**Files to change**:

- `src/app/sign-in/[[...sign-in]]/page.tsx`
- `src/app/sign-up/[[...sign-up]]/page.tsx`

**Tests to review**:

- `src/app/sign-in/[[...sign-in]]/page.test.tsx`
- `src/app/sign-up/[[...sign-up]]/page.test.tsx`

**Blast radius**: Low. Two local page files. No contracts, auth logic, DI, or module boundaries affected. Rendered output is identical — only the async wrapper structure changes.

**Delegate to**: Implementation Agent.
