# Onboarding Client Probe — Implementation Report

**Session ID**: e7060e31-64b3-44c2-b93c-9f3b02dccd32  
**Agent**: Implementation Agent  
**Date**: 2026-03-17  
**Status**: IMPLEMENTED  
**Scope**: Post-guard client-side mount probe to identify where the onboarding flow stalls after `OnboardingGuard` succeeds

---

## 1. Objective

Add minimal client-side instrumentation to the `/onboarding` route to determine:

1. Whether the client tree hydrates and mounts after server guard completion
2. Whether `OnboardingForm` mounts (client side)
3. Whether the visible `[onboarding:hydrated]` marker appears (confirms client tree committed)

This probe does **not** change any form submission logic, guard logic, or auth behavior. It is purely diagnostic.

---

## 2. Affected Files / Modules

| File                                             | Change       | Layer          | Touches                |
| ------------------------------------------------ | ------------ | -------------- | ---------------------- |
| `src/app/onboarding/onboarding-client-probe.tsx` | **CREATED**  | `app` / client | —                      |
| `src/app/onboarding/page.tsx`                    | **MODIFIED** | `app` / server | public render output   |
| `src/app/onboarding/onboarding-form.tsx`         | **MODIFIED** | `app` / client | non-behavioral logging |

- No contracts modified
- No DI/composition changes
- No auth/security flow changes
- No runtime placement changes
- No tests updated (non-behavioral logging additions; no new behavior to assert)

---

## 3. Implementation Plan

1. Create `OnboardingClientProbe` — `'use client'` component using `usePathname` + `useState(false)` hydration gate + `useEffect` for mount/unmount logging via `getBrowserLogger()`
2. Render a visible `[onboarding:hydrated]` text marker only after hydration (SSR returns `null`)
3. Mount probe in `page.tsx` after `<OnboardingForm />` using a fragment
4. Add a single `useEffect` mount log to `OnboardingForm` via `getBrowserLogger()`
5. Validate: typecheck, lint, arch:lint, test

---

## 4. Changes Made

### 4.1 `src/app/onboarding/onboarding-client-probe.tsx` (CREATED)

```tsx
'use client';

import { usePathname } from 'next/navigation';
import * as React from 'react';

import { getBrowserLogger } from '@/core/logger/browser';

export function OnboardingClientProbe() {
  const pathname = usePathname();
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    const logger = getBrowserLogger();
    setHydrated(true);
    logger.info(
      {
        event: 'onboarding_client:mount',
        component: 'OnboardingClientProbe',
        pathname,
        hydrationMarker: 'client-tree-committed',
      },
      'OnboardingClientProbe: mounted and hydrated',
    );
    return () => {
      getBrowserLogger().debug(
        {
          event: 'onboarding_client:unmount',
          component: 'OnboardingClientProbe',
          pathname,
        },
        'OnboardingClientProbe: unmounted',
      );
    };
  }, [pathname]);

  if (!hydrated) return null;

  return (
    <p className="mt-2 text-center text-xs opacity-20">[onboarding:hydrated]</p>
  );
}
```

Key design choices:

- `useState(false)` hydration gate: returns `null` on SSR, visible marker only after `useEffect` fires (client-only)
- `[pathname]` dependency: ESLint-clean; pathname won't change on this fixed route
- `getBrowserLogger()` is the established client logging singleton (`src/core/logger/browser.ts`)
- Visible marker is subtle: `opacity-20`, no color, no layout impact

### 4.2 `src/app/onboarding/page.tsx` (MODIFIED)

Before:

```tsx
import { OnboardingForm } from './onboarding-form';

export default function OnboardingPage() {
  return <OnboardingForm />;
}
```

After:

```tsx
import { OnboardingClientProbe } from './onboarding-client-probe';
import { OnboardingForm } from './onboarding-form';

export default function OnboardingPage() {
  return (
    <>
      <OnboardingForm />
      <OnboardingClientProbe />
    </>
  );
}
```

- Form renders first (preserved render order)
- Probe appears below form (after hydration only)
- Fragment wrapper — no extra DOM elements

### 4.3 `src/app/onboarding/onboarding-form.tsx` (MODIFIED)

Added import and `useEffect` at component top:

```tsx
import { getBrowserLogger } from '@/core/logger/browser';

// inside OnboardingForm:
React.useEffect(() => {
  getBrowserLogger().info(
    {
      event: 'onboarding_form:mount',
      component: 'OnboardingForm',
    },
    'OnboardingForm: mounted',
  );
}, []);
```

- Empty deps array: fires once on mount only
- No behavior change to form submission logic, error handling, or state

---

## 5. Validation / Verification

| Check            | Result                                                                            |
| ---------------- | --------------------------------------------------------------------------------- |
| `pnpm typecheck` | **PASS**                                                                          |
| `pnpm lint`      | **PASS** (import order fix applied — `next/navigation` before `react`)            |
| `pnpm arch:lint` | **PASS** (no circular deps; 142 warnings pre-existing)                            |
| `pnpm test`      | **762/762 PASS** (1 pre-existing `drizzle.test.ts` DB timeout failure, unrelated) |

---

## 6. What the Probe Will Reveal

### Scenario A — Both logs appear in browser console + `[onboarding:hydrated]` visible

- **Confirmed**: Client tree hydrated, `OnboardingForm` and `OnboardingClientProbe` both mounted
- **Next action**: Form submission is the failure boundary — investigate why `form action={handleSubmit}` never reaches the server action
- **Likely fix**: Migrate to `form action={completeOnboarding}` + `useFormStatus()`

### Scenario B — `onboarding_form:mount` appears but `onboarding_client:mount` does not

- **Indicates**: Component ordering issue or probe-specific failure (unlikely)
- **Next action**: Check if `OnboardingClientProbe` throws on mount

### Scenario C — Neither log appears, no `[onboarding:hydrated]` visible

- **Indicates**: Client tree hydration failing silently before either component mounts
- **Possible causes**: RSC hydration mismatch, React 19 streaming issue, `<Suspense>` boundary behavior, Clerk provider interaction
- **Next action**: Check browser console for React hydration errors; inspect Next.js RSC payload

### Scenario D — `[onboarding:hydrated]` never appears but page looks normal

- **Indicates**: `useEffect` not firing — possible SSR-only render or React Compiler optimization removing effect
- **Next action**: Check if React Compiler is inlining/eliding the effect; add `'use no memo'` directive as diagnostic

---

## 7. Risks / Follow-ups

- **No behavioral regression risk**: All changes are additive logging only. Form submission, guard logic, and auth flow are untouched.
- **Diagnostic-only**: This probe and the `onboarding_form:mount` log should be removed after the root cause is confirmed and fixed.
- **Primary remaining suspect**: `form action={handleSubmit}` client wrapper is likely the failure point — the `catch (_err)` block silently swallows errors before they reach the server. Zero `module: 'onboarding-actions'` logs across 21 `/onboarding` visits confirms `completeOnboarding` was never called server-side.
- **Next implementation pass needed**: Migrate `OnboardingForm` to `form action={completeOnboarding}` + `useFormStatus()` — this is the idiomatic Next.js 16 server action pattern and eliminates the client-side catch swallowing.
