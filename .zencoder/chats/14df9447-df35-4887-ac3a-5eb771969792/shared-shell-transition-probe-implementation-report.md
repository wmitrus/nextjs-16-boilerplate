# Shared-Shell Client Transition Probe — Implementation Report

**Session ID**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Agent**: Implementation Agent  
**Date**: `2026-03-18`  
**Status**: IMPLEMENTED  
**Scope**: Minimal shared-shell client route-transition probe for the `/users -> /onboarding` handoff investigation

---

## 1. Objective

Add a persistent client-side probe at the highest safe shared boundary in the React tree — the root `AppLayoutContent` — to determine whether the App Router ever commits the client pathname from `/users` to `/onboarding`.

This probe:

- survives the `/users -> /onboarding` route transition (it is mounted at the root, above both routes)
- logs every committed client pathname via `getBrowserLogger()` → transmits to `/api/logs` → appears in `server.log` as `browser-ingest`
- renders a tiny always-visible DOM marker showing the currently committed client pathname

This probe does **not** change onboarding logic, guard logic, bootstrap logic, middleware, routing, Clerk config, or form submission.

---

## 2. Affected Files / Modules

| File                                            | Change       | Layer          | Touches                                                         |
| ----------------------------------------------- | ------------ | -------------- | --------------------------------------------------------------- |
| `src/app/components/route-transition-probe.tsx` | **CREATED**  | `app` / client | —                                                               |
| `src/app/layout.tsx`                            | **MODIFIED** | `app` / server | non-behavioral: adds one client component to `AppLayoutContent` |

- No contracts modified
- No DI/composition changes
- No auth/security flow changes
- No runtime placement changes (client component, `'use client'`, correct placement)
- No tests added (non-behavioral diagnostic logging; no new behavior to assert; mirrors the pattern of `OnboardingClientProbe` which also has no tests)

---

## 3. Implementation Plan

1. Create `RouteTransitionProbe` as a `'use client'` component in `src/app/components/route-transition-probe.tsx`
2. Use `usePathname()` and `useEffect([pathname])` to log every committed client pathname
3. Render a fixed-position DOM marker `[route:{committedPath}]` that confirms the committed client pathname visually
4. Import and render `<RouteTransitionProbe />` in `AppLayoutContent` inside `src/app/layout.tsx`, after `<GlobalErrorHandlers />`
5. Validate: typecheck, lint, arch:lint, test

**Probe placement rationale**:

`AppLayoutContent` is rendered inside `ClerkProvider` (for Clerk configs) and wraps all routes including `/users` and `/onboarding`. A `'use client'` component placed here:

- mounts once on first page load
- persists across all App Router client transitions (pathname changes do not unmount it)
- is the highest client boundary in the repository-owned tree

`HeaderAuthControls` was considered but not chosen because: it is in `src/modules/auth/ui/` which owns auth UI concerns, not route diagnostics. Adding route tracking to it would cross concerns.

`GlobalErrorHandlers` was considered but not chosen because: it is in `src/shared/components/error/` and its single responsibility is global error capture. Route tracking would pollute its concern.

Creating a new `RouteTransitionProbe` in `src/app/components/` mirrors the pattern of `CopyrightYear.tsx` in the same directory — small, single-concern, delivery-layer client components.

---

## 4. Changes Made

### 4.1 `src/app/components/route-transition-probe.tsx` (CREATED)

```tsx
'use client';

import { usePathname } from 'next/navigation';
import * as React from 'react';

import { getBrowserLogger } from '@/core/logger/browser';

export function RouteTransitionProbe() {
  const pathname = usePathname();
  const [committedPath, setCommittedPath] = React.useState(pathname);

  React.useEffect(() => {
    const logger = getBrowserLogger();

    setCommittedPath(pathname);

    logger.info(
      {
        event: 'route_probe:pathname_committed',
        component: 'RouteTransitionProbe',
        pathname,
      },
      'RouteTransitionProbe: pathname committed to client tree',
    );

    return () => {
      getBrowserLogger().debug(
        {
          event: 'route_probe:cleanup',
          component: 'RouteTransitionProbe',
          pathname,
        },
        'RouteTransitionProbe: effect cleanup',
      );
    };
  }, [pathname]);

  return (
    <p className="pointer-events-none fixed right-0 bottom-0 z-50 p-1 font-mono text-[10px] text-black/10 select-none">
      [route:{committedPath}]
    </p>
  );
}
```

**Key design choices**:

- `usePathname()`: returns the current committed App Router pathname. Updates only after the router has fully committed a new route. This is the authoritative client-side signal.
- `useEffect([pathname])`: fires on mount AND on every pathname change. Satisfies `react-hooks/exhaustive-deps`. Same pattern as `OnboardingClientProbe`.
- `setCommittedPath(pathname)`: updates the visible DOM marker to the latest committed pathname.
- `getBrowserLogger().info(...)`: follows the established browser logging pattern. Goes to browser console AND, when `NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED=true`, transmits to `/api/logs` → re-logged as `browser-ingest` in `server.log`.
- Cleanup `debug` log on effect re-run: diagnostic artifact, no impact.
- Visual marker: `fixed right-0 bottom-0 z-50` — always visible at bottom-right corner. `pointer-events-none select-none` — does not interfere with user interaction. `text-black/10` — nearly transparent, unobtrusive.

**Events emitted**:

| Event                            | When                                                  | What it proves                                    |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| `route_probe:pathname_committed` | On mount (initial pathname) AND every pathname change | The React tree committed this pathname as current |
| `route_probe:cleanup`            | Before each effect re-run                             | Debug breadcrumb only                             |

### 4.2 `src/app/layout.tsx` (MODIFIED)

Added import and one JSX line in `AppLayoutContent`:

```diff
 import { GlobalErrorHandlers } from '@/shared/components/error/global-error-handlers';

+import { RouteTransitionProbe } from './components/route-transition-probe';
+
 import { normalizeClerkPostAuthRedirect } from '@/modules/auth/lib/clerk-redirects';
 ...

 function AppLayoutContent({ children }: { children: React.ReactNode }) {
   return (
     <>
       <HeaderWithAuth />
       <GlobalErrorHandlers />
+      <RouteTransitionProbe />
       {(env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview') && (
         <SpeedInsights />
       )}
       {children}
     </>
   );
 }
```

No other changes. The probe is in the same server→client handoff pattern used by `HeaderWithAuth → HeaderAuthControls` and `GlobalErrorHandlers`.

---

## 5. Validation / Verification

| Check            | Result                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` | **PASS**                                                                                                  |
| `pnpm lint`      | **PASS** (2 errors fixed: Prettier Tailwind class order, import ordering)                                 |
| `pnpm arch:lint` | **PASS** (no circular deps; 1 pre-existing WARN about global container in request flows)                  |
| `pnpm test`      | **762/762 PASS** (1 pre-existing `drizzle.test.ts` suite failure from missing `DATABASE_URL` — unrelated) |

---

## 6. How to Interpret the Probe During the Next Failing Run

### Signal A — Both `route_probe:pathname_committed` events appear in `server.log` with correct pathnames

```
{ event: 'route_probe:pathname_committed', pathname: '/users' }    ← on initial mount
{ event: 'route_probe:pathname_committed', pathname: '/onboarding' } ← after transition
```

**Interpretation**: The App Router committed the transition client-side. The earliest failing boundary has moved to **after** route commit — inside the `/onboarding` client subtree itself (hydration, `OnboardingForm` mount, etc.).

**Next action**: Investigate why `onboarding_client:mount` and `onboarding_form:mount` never fire despite committed route.

### Signal B — Only `/users` appears, `/onboarding` never appears

```
{ event: 'route_probe:pathname_committed', pathname: '/users' }    ← on initial mount
(nothing further)
```

**Interpretation**: The App Router never committed the `/users -> /onboarding` transition client-side, despite server-side success. The failing boundary is **at or before the App Router client route-commit step**.

**Likely causes to investigate next**:

1. Clerk provider intercepting or blocking the soft navigation
2. A top-level `<Suspense>` boundary holding the `/onboarding` subtree and never settling (streaming issue)
3. A client-side redirect firing before commit (e.g., from a Clerk `useAuth` hook)
4. Next.js router skipping the soft navigation and doing a hard reload (which would show up differently)

**Next action**: Security/Auth Agent should review whether Clerk's `ClerkProvider` or client-side middleware intervenes in the navigation between `/users` and `/onboarding`. Next.js Runtime Agent should review the `<Suspense fallback={null}>` in the root layout and whether it can trap a streaming response indefinitely.

### Signal C — `route_probe:pathname_committed` never appears at all (not even `/users`)

**Interpretation**: The `RouteTransitionProbe` itself never mounted. The App Router client tree failed to hydrate at the root level.

**Next action**: Check for React hydration errors, JS parse errors, or root `<ClerkProvider>` failure blocking the entire client tree.

### DOM evidence

In browser DevTools → Elements:

- Look for `<p>` tag at the bottom-right corner of the page
- Its text content will be `[route:/users]` if the probe mounted and committed to `/users`
- It will update to `[route:/onboarding]` if the transition commits

If the element is **absent**: the client tree did not hydrate at all (Scenario C).  
If the element shows **`[route:/users]`** and never changes: the transition did not commit client-side (Scenario B).  
If the element shows **`[route:/onboarding]`**: the transition committed (Scenario A).

### Network evidence

In browser DevTools → Network:

- Filter by `/api/logs`
- Each `route_probe:pathname_committed` event fires a `POST /api/logs` via `sendBeacon` (or `fetch`)
- If no `/api/logs` requests appear at all: browser transport is blocked or not transmitting (check `NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED`)

### Server log evidence

In `logs/server.log` (with `LOG_TO_FILE_DEV=true`):

- Look for `"type":"browser-ingest"` entries containing `"event":"route_probe:pathname_committed"`
- If present with `pathname: '/users'` only: Scenario B
- If present with both `/users` and `/onboarding`: Scenario A
- If absent entirely: Scenario C, or browser transport failure

---

## 7. Risks / Follow-ups

- **No behavioral regression risk**: All changes are additive logging and a non-interactive visual marker. No form, guard, auth, or routing behavior changed.
- **Diagnostic-only**: `RouteTransitionProbe` should be removed after the root cause is confirmed and fixed.
- **StrictMode double-fire**: In React 18+ dev with StrictMode, `useEffect` fires twice on mount. This produces two `route_probe:pathname_committed` events with `/users` on initial load. This is expected dev noise and does not affect diagnostic interpretation.
- **Visual marker**: The `[route:{pathname}]` marker is nearly invisible (`text-black/10`) but present in the DOM. It will not affect screenshots or layout, but should be removed before production use.
- **Primary remaining suspect** (from prior investigation): the App Router client transition / route-commit boundary between `/users` and `/onboarding`. This probe is designed to confirm or rule out that boundary definitively.
