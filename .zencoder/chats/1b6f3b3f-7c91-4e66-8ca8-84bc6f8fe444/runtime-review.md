# Runtime Review — Clerk Sign-Up & Provisioning Flow

**Agent**: Next.js Runtime Agent  
**Inputs**: incident-intake.md, security-review.md  
**Date**: 2026-03-13

---

## 1. Objective

Validate the runtime execution order, server/client placement, edge vs. node responsibilities, and framework-level behavior of the complete Clerk sign-up → bootstrap → onboarding flow. Determine whether runtime sequencing, Next.js execution mechanics, or caching behavior contributes to or explains the documented provisioning failures.

---

## 2. Current-State Findings

### 2.1 `proxy.ts` Is the Next.js 16 Proxy Entry Point (Not `middleware.ts`)

**File**: `src/proxy.ts`

Next.js 16 has renamed "middleware" to "proxy" at the framework level. `MIDDLEWARE_FILENAME = 'middleware'` is deprecated and `PROXY_FILENAME = 'proxy'` is the new convention (confirmed in `node_modules/next/dist/lib/constants.js` and `node_modules/next/dist/build/index.js`). Next.js 16 issues a deprecation warning if `middleware.ts` is used and recommends `proxy.ts`.

`src/proxy.ts` is correctly placed at the `src/` root — `PROXY_LOCATION_REGEXP = '(?:src/)?proxy'` — and is therefore detected and compiled as the Next.js proxy by the framework build system.

**This file runs at the Edge runtime** by default (no explicit `export const runtime = 'nodejs'` in proxy.ts, and Next.js proxy/middleware defaults to Edge).

The handler structure: `clerkMiddleware(async (auth, request) => { ... })` wraps the entire security pipeline. For `AUTH_PROVIDER=clerk`, Clerk's `clerkMiddleware` runs first, makes Clerk's `auth()` function available inside the callback, and the security pipeline (security headers → internal API guard → rate limiting → `withAuth`) runs within it.

### 2.2 Route Classification Affects Request Flow Before Identity Resolution

**File**: `src/security/middleware/with-auth.ts`, `src/security/middleware/route-classification.ts`

The `withAuth` middleware in proxy.ts runs with:

```typescript
withAuth(next, {
  dependencies: securityDependencies,
  enforceResourceAuthorization: false,
});
```

`enforceResourceAuthorization: false` means Step 4 (authorization check calling `authorizeRouteAccess`) is **skipped entirely in the edge middleware**. The edge middleware only performs: authentication gate, auth-route redirect, onboarding enforcement (always `true` in edge mode), and unauthenticated rejection.

For the bootstrap route (`/auth/bootstrap`), `isBootstrapRoute = true`. The flow in `withAuth` is:

```
resolveIdentity()                     ← called first (no DB lookup in edge)
    ↓
ctx.isBootstrapRoute === true?
    userId present → handler(req, ctx) ← pass through to RSC
    userId absent  → redirect /sign-in
```

**Critical ordering**: `resolveIdentity()` is called BEFORE the `isBootstrapRoute` check. In Edge mode, `RequestScopedIdentityProvider` has no `lookup` option and cannot throw `UserNotProvisionedError` — it returns the Clerk external userId or null. Safe today. If ever run in Node mode with a DB-backed identity provider, new users hitting `/auth/bootstrap` would trigger `UserNotProvisionedError` before reaching the bootstrap bypass, causing a 500 instead of a clean pass-through.

### 2.3 Clerk Auth State Availability at Different Runtime Points

**Files**: `src/proxy.ts`, `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`

In `proxy.ts`, Clerk auth state is obtained from `auth()` (the function passed into `clerkMiddleware`) at Edge request time:

```typescript
clerkMiddleware(async (auth, request) => {
  const getAuthResult = createAuthResultGetter(auth);  // lazily cached
  const requestIdentitySource = createRequestIdentitySource(getAuthResult);
  ...
})
```

The `createRequestIdentitySource` reads `{ userId, orgId, sessionClaims }` from `auth()`. Notably, `emailVerified` is **not extracted** in the proxy-level identity source — it only extracts `userId`, `orgId`, and `email`. The proxy does not pass `emailVerified` downstream.

In the RSC bootstrap page (Node runtime), a separate `ClerkRequestIdentitySource` is instantiated via `getAppContainer()`. This calls Clerk's `auth()` from `@clerk/nextjs/server`, which reads from the same session cookie. This is an **independent call to Clerk** — not reusing the edge-resolved auth state.

**Result**: Two independent auth resolutions per sign-up request: one at Edge (proxy), one at Node (RSC). Both read from the same session JWT so they return consistent results for the same request, but they are structurally independent with no shared state.

### 2.4 Session Claims at Sign-Up Time — The Core Timing Problem

**File**: `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`

When Clerk's `<SignUp path="/sign-up" />` component completes the sign-up flow client-side:

1. Clerk issues a new session JWT
2. Sets the session cookie in the browser
3. Triggers the redirect to `/auth/bootstrap` (via `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`)

The session JWT issued at this point contains claims for the **newly created user**. For `orgId`: Clerk only sets `orgId` in the session when the user has an active organization in their session. A brand-new self-service signup has NO organization membership — `orgId` is null in the JWT.

**This is deterministic, not flaky**. For `org+provider` mode, `orgId` will never be present in a fresh sign-up session without:

- A prior org invitation that the user accepted during sign-up
- Explicit client-side Clerk org switching after sign-up (which cannot happen before bootstrap since the force redirect is immediate)

There is **no timing window** in the current flow where `orgId` could be populated between Clerk sign-up completion and bootstrap page render. The redirect is synchronous from the browser's perspective.

### 2.5 The Bootstrap RSC — Node Runtime, Dynamic Rendering

**File**: `src/app/auth/bootstrap/page.tsx`

The bootstrap page:

- Uses `searchParams` (Next.js dynamic API) → forces dynamic rendering
- Calls `cookies()` and `headers()` (Next.js dynamic APIs) → confirms dynamic rendering
- No `export const dynamic` declaration needed — already fully dynamic
- No `export const runtime` — runs in Node runtime (default for RSC pages without explicit edge runtime)

With `cacheComponents: true` (PPR), the bootstrap page is in the **dynamic segment** (fully request-scoped, not pre-rendered). No caching risk.

`getAppContainer()` creates a fresh container per call. `ClerkRequestIdentitySource` instances are per-container. The `cached` Promise field resets per container. Clerk `auth()` is called once per bootstrap page render. This is correct.

### 2.6 The Bootstrap → Onboarding Redirect — RSC `redirect()`

**File**: `src/app/auth/bootstrap/page.tsx`

```typescript
if (!user.onboardingComplete) {
  redirect(`/onboarding?redirect_url=${encodeURIComponent(safeTarget)}`);
}
```

`redirect()` from `next/navigation` in an RSC throws a special Next.js error that is caught by the framework and triggers a 307 redirect response. This is correct and standard.

The `redirect_url` parameter is URL-encoded and passed to the onboarding page via `searchParams`. The onboarding page reads it via `await searchParams` (Next.js 15+ async searchParams pattern). This is correct.

### 2.7 Onboarding Layout — Guard Runs as Async RSC

**File**: `src/app/onboarding/layout.tsx`

```typescript
export default async function OnboardingLayout({ children }) {
  return (
    <Suspense fallback={null}>
      <OnboardingGuard>{children}</OnboardingGuard>
    </Suspense>
  );
}
```

`OnboardingGuard` is an async RSC wrapped in `Suspense`. This is valid React 19 / App Router streaming. The `Suspense fallback={null}` produces a brief null render before the guard resolves. This is a UX concern (flash of empty content) but not a correctness issue.

The guard calls `getAppContainer()` (Node runtime, DB-backed), resolves `identity.id` (internal UUID via DB lookup), then checks `userRepository.findById(identity.id)`. If `UserNotProvisionedError` is thrown (user authenticated in Clerk but no DB mapping), it redirects to `/auth/bootstrap`. This is the correct safety net.

**Important**: The `OnboardingGuard` and the later `completeOnboarding` server action are in **separate request scopes** — the guard runs during page render, the action runs on form submit. They each call `getAppContainer()` independently and create separate `ClerkRequestIdentitySource` instances. No shared state between them, which is correct.

### 2.8 The `completeOnboarding` Server Action — Node Runtime

**File**: `src/modules/auth/ui/onboarding-actions.ts`

Marked `'use server'` at file level. Runs in Node runtime (server actions run in Node by default in Next.js App Router). Called from `OnboardingForm` (client component) via:

```typescript
const res = await completeOnboarding(formData);
```

This is a direct server action invocation from a client component — valid React 19 pattern. The server action:

1. Calls `getAppContainer()` → fresh Node container
2. `identitySource.get()` → `auth()` called again (separate from layout render call)
3. Calls `ensureProvisioned(...)` — second provisioning call (intended to be idempotent)
4. Updates profile and onboarding status

**Runtime concern**: Between the layout render (step 2.7) and the server action invocation (this step), the Clerk session remains the same (same browser tab, same session). The `auth()` call in the server action will return the same `userId`, `orgId`, and session claims as the layout's `auth()` call. So the two provisioning calls receive the same inputs — truly idempotent for the same session. Safe.

**BUT**: The form `action` is a JavaScript function handler, not a native server action binding:

```typescript
<form action={handleSubmit} className="space-y-6">
```

This is React 19's function-as-action pattern. Progressive enhancement is not supported — requires JavaScript. Acceptable for this use case but worth noting.

### 2.9 `BootstrapErrorUI` — Client Component in RSC Return

**File**: `src/app/auth/bootstrap/bootstrap-error.tsx`

This is a `'use client'` component returned from the RSC bootstrap page. It uses `useClerk()` (for sign-out) and `useRouter()`. Both require being descendants of their respective context providers.

`useClerk()` requires being inside `<ClerkProvider>`. The root layout wraps all children in `<ClerkProvider>` when `AUTH_PROVIDER === 'clerk'`. So `BootstrapErrorUI` rendered by the bootstrap page IS inside `ClerkProvider`. Correct.

However: the root layout wraps `ClerkProvider` in `<Suspense fallback={null}>`. During SSR, this means the initial HTML output will have `null` content (the fallback) while the ClerkProvider hydrates client-side. The `BootstrapErrorUI` will not be visible until JavaScript hydrates. This is a hydration/flash concern, not a correctness bug, but it does mean server-rendered error content is not visible until JS loads.

### 2.10 Root Layout `Suspense` Wrapping ClerkProvider

**File**: `src/app/layout.tsx`

```tsx
<Suspense fallback={null}>
  {isClerkProvider ? (
    <ClerkProvider ...>
      <AppLayoutContent>{children}</AppLayoutContent>
    </ClerkProvider>
  ) : (
    <AppLayoutContent>{children}</AppLayoutContent>
  )}
</Suspense>
```

`ClerkProvider` from `@clerk/nextjs` is a Client Component. `isClerkProvider` is derived from `env.AUTH_PROVIDER` (a server-side env var evaluated at render time). The `Suspense` wrapper here is intended to handle the React 19 async rendering boundary.

**Runtime concern with `cacheComponents: true`**: The root layout itself may be eligible for partial pre-rendering (PPR). The layout's dynamic behavior depends on its children — since bootstrap/onboarding pages are dynamic, the pages in the dynamic segment won't be pre-rendered. The `Suspense` around `ClerkProvider` is compatible with PPR but means the ClerkProvider subtree is always in the dynamic shell. Correct for auth-sensitive routes.

### 2.11 `users/layout.tsx` — Node Provisioning Gate

**File**: `src/app/users/layout.tsx`

```typescript
export default async function UsersLayout({ children }) {
  const access = await resolveNodeProvisioningAccess(getAppContainer());
  // handles: UNAUTHENTICATED, BOOTSTRAP_REQUIRED, ONBOARDING_REQUIRED, TENANT_CONTEXT_REQUIRED, TENANT_MEMBERSHIP_REQUIRED, FORBIDDEN
  return children;
}
```

This layout calls `resolveNodeProvisioningAccess` which internally calls:

1. `identityProvider.getCurrentIdentity()` → DB lookup for internal UUID
2. `userRepository.findById(userId)` → checks `onboardingComplete`
3. `tenantResolver.resolve(identity)` → resolves tenant context

**Runtime issue**: `resolveNodeProvisioningAccess` in `evaluateNodeProvisioningAccess` checks `user.onboardingComplete` BEFORE resolving tenant context. The order is:

1. Identity → DB lookup
2. User → onboarding check
3. Tenant → only if user is provisioned and onboarded

For `org+provider` mode, if tenant resolution fails (e.g., `TenantNotProvisionedError`), the users layout redirects to `/onboarding?reason=tenant-context-required`. But the user has just completed onboarding (`onboardingComplete: true`). They will be redirected back to onboarding which will then redirect them to `/users` (because `onboardingComplete: true`)... creating a redirect loop for this specific failure case.

**Verified redirect loop**: `users/layout.tsx` → `/onboarding?reason=tenant-context-required` → `OnboardingGuard` finds `onboardingComplete: true` → `redirect('/users')` → back to `users/layout.tsx` → loop.

This loop occurs in `org+provider` mode when:

1. Bootstrap provisioned the user (created DB user + membership)
2. User completed onboarding (set `onboardingComplete: true`)
3. BUT the tenant resolver now fails (e.g., `orgId` dropped from session, org deleted in Clerk)

### 2.12 `getAppContainer()` Called Multiple Times Across a Single Logical Flow

**Files**: Multiple

Within the `/onboarding` render + form submission cycle, `getAppContainer()` is called:

- In `OnboardingGuard` (layout render) → container A
- In `completeOnboarding` (server action) → container B

Within the `/users` render cycle:

- In `UsersLayout` → container C

Each creates a new `ClerkRequestIdentitySource` and calls Clerk's `auth()` separately. The DB connection is shared via `getInfrastructure()` process-scope cache. This is correct for isolation but inefficient — 2-3 independent `auth()` calls per page render/action cycle. Not a correctness issue but a structural observation relevant to the "repeatedly calls provisioning" symptom.

---

## 3. Runtime Boundary Assessment

### Server vs. Client Placement

| Component                    | Placement                 | Correct?                    |
| ---------------------------- | ------------------------- | --------------------------- |
| `proxy.ts` + `withAuth`      | Edge runtime              | ✓                           |
| `ClerkRequestIdentitySource` | Server-only (Node + Edge) | ✓                           |
| `BootstrapPage` (`page.tsx`) | RSC, Node                 | ✓                           |
| `BootstrapErrorUI`           | Client Component          | ✓ (uses Clerk/router hooks) |
| `OnboardingGuard` (layout)   | RSC, Node                 | ✓                           |
| `OnboardingPage` (page)      | RSC, Node                 | ✓                           |
| `OnboardingForm`             | Client Component          | ✓ (needs useState, router)  |
| `completeOnboarding`         | Server Action, Node       | ✓                           |
| `UsersLayout`                | RSC, Node                 | ✓                           |

No server-only code in client components. No client-only hooks in server components. Placement is correct throughout.

### Edge vs. Node Placement

| Runtime Layer                | What Runs                                 | What It Does                                             |
| ---------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| **Edge** (proxy.ts)          | `clerkMiddleware` → security pipeline     | Auth presence gate, rate limit, security headers. No DB. |
| **Node** (RSC pages/layouts) | `getAppContainer()` → DB-backed container | Provisioning, user lookup, tenant resolution             |
| **Node** (server actions)    | `getAppContainer()` → DB-backed container | Provisioning, profile update, onboarding completion      |

Edge correctly has no DB access. Node correctly performs all DB-backed operations. Boundary is clean.

### Caching / Dynamic Rendering

| Page/Layout             | Dynamic? | Why                                                           |
| ----------------------- | -------- | ------------------------------------------------------------- |
| `bootstrap/page.tsx`    | Dynamic  | Uses `searchParams`, `cookies()`, `headers()`, Clerk `auth()` |
| `onboarding/layout.tsx` | Dynamic  | Uses Clerk `auth()` via DB lookup                             |
| `onboarding/page.tsx`   | Dynamic  | Uses `searchParams`                                           |
| `users/layout.tsx`      | Dynamic  | Uses Clerk `auth()` via DB lookup                             |
| `sign-up/page.tsx`      | Dynamic  | Uses `connection()` explicitly                                |
| `sign-in/page.tsx`      | Dynamic  | Uses `connection()` explicitly                                |

All auth-sensitive pages are dynamic. No caching risk for user/tenant-sensitive data.

**Note**: `connection()` is called in sign-in/sign-up pages but NOT in bootstrap or onboarding pages. This is acceptable because those pages already use other dynamic APIs (`cookies`, `headers`, `searchParams`, `auth()`), which opts them into dynamic rendering without needing `connection()`.

### `cacheComponents: true` (PPR) Impact

With PPR enabled (`cacheComponents: true`), Next.js attempts to pre-render static shells at build time. All pages in the auth flow are fully dynamic — the framework will not attempt to pre-render their content. `BootstrapErrorUI` as a Client Component within a dynamic RSC will be sent as part of the dynamic RSC payload, not as a separately cached component. No caching risk.

---

## 4. Docs vs. Code Drift

### Drift 1 — `proxy.ts` naming

The auto-rule in `AGENTS.md` describes `src/proxy.ts` as "Node.js runtime request proxy (replaces middleware for Node use cases)". This is misleading. `proxy.ts` is the **Next.js 16 proxy** (the renamed middleware), runs at **Edge runtime**, and has no Node.js dependency. It is not a Node.js runtime proxy. The description in the docs suggests it replaces middleware for Node — but it IS the framework's middleware mechanism (just named differently in Next.js 16). It runs at Edge, not Node.

The docs in `docs/architecture/15 - Edge vs Node Composition Root Boundary.md` correctly describe `proxy.ts` as edge middleware. The AGENTS.md auto-rule is inaccurate on this point.

### Drift 2 — Request Lifecycle diagram

`docs/architecture/03 – Request Lifecycle.md` shows a diagram where `NodeEntry` is "Server Action / Route Handler" — it does not include RSC layouts/pages (`OnboardingGuard`, `UsersLayout`, `BootstrapPage`) in the Node path. These are RSC components that perform Node-tier provisioning checks (`getAppContainer()`, DB calls). The diagram understates the Node execution surface.

### Drift 3 — `connection()` usage inconsistency

`sign-in/page.tsx` and `sign-up/page.tsx` explicitly call `await connection()` to opt into dynamic rendering. `bootstrap/page.tsx` and `onboarding/layout.tsx` do NOT — they rely on their use of dynamic APIs (`cookies`, `headers`, `auth()`) to implicitly force dynamic rendering. This inconsistency is not a bug (both approaches work) but it is an undocumented convention difference.

---

## 5. Risks

### MAJOR

**RT-1** — `org+provider` mode: `orgId` structurally absent at sign-up time, no interstitial step possible

- The `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/bootstrap` forces an immediate redirect from Clerk sign-up to bootstrap.
- There is no runtime step between sign-up completion and bootstrap where the user could acquire Clerk org membership.
- `auth()` at bootstrap render time returns the post-sign-up session JWT, which has `orgId: null` for users without pre-existing org membership.
- This is a **deterministic failure** for all self-service signups under `org+provider` mode — not flaky, not a race condition.
- The runtime delivers the session claims faithfully; the flaw is in the flow design: bootstrap executes provisioning unconditionally before the user has any chance to acquire org context.

**RT-2** — Redirect loop for `org+provider` users who completed onboarding but lost Clerk org context

- `UsersLayout` calls `resolveNodeProvisioningAccess` → `TenantNotProvisionedError` or `MissingTenantContextError` → redirects to `/onboarding?reason=tenant-context-required`
- `OnboardingGuard` in `/onboarding` layout → `user.onboardingComplete === true` → redirects back to `/users`
- Loop: `/users` → `/onboarding` → `/users` → ...
- Trigger: user's Clerk session no longer carries `orgId` (e.g., session refresh dropped org context, user removed from org in Clerk).
- This is a **hard redirect loop with no escape hatch** except signing out.

**RT-3** — `resolveIdentity()` called before `isBootstrapRoute` check in `withAuth` — latent Node mode hazard

- Today safe (Edge, no DB lookup).
- If proxy.ts is ever explicitly switched to Node runtime (`export const runtime = 'nodejs'`), the identity provider would have a DB lookup and could throw `UserNotProvisionedError` for new users on the bootstrap route.
- The framework would return a 500 error instead of passing through to the bootstrap RSC.
- This is a latent, not currently active, risk — but it's one refactor away from being triggered.

### MINOR

**RT-4** — `BootstrapErrorUI` requires JavaScript to render (Suspense fallback = null)

- Root layout wraps `ClerkProvider` in `<Suspense fallback={null}>`.
- Server-rendered HTML of the bootstrap error page will show nothing until JavaScript hydrates.
- If JavaScript fails to load, users see a blank page instead of the error message.
- Not a correctness issue; acceptable for a JS-first app, but worth documenting.

**RT-5** — `connection()` inconsistency across auth flow pages

- `sign-in` and `sign-up` pages explicitly call `connection()` to opt into dynamic rendering.
- `bootstrap/page.tsx` and `onboarding/layout.tsx` rely on implicit dynamic API usage.
- Both approaches are correct with Next.js App Router dynamic rendering rules, but the inconsistency means future contributors may not know which pattern to follow.

**RT-6** — Two independent Clerk `auth()` calls per `/onboarding` page render

- `OnboardingGuard` (layout) calls `getAppContainer()` → `auth()` call #1
- `completeOnboarding` (server action on form submit) → `getAppContainer()` → `auth()` call #2
- While these are separate request contexts (render vs. action), within the render itself, the guard is the only call. This is fine.
- However, if `getAppContainer()` is ever called multiple times within a single RSC, each call triggers a new `auth()` call. Currently not an issue; latent if code is refactored.

### INFORMATIONAL

**RT-7** — `proxy.ts` naming change (Next.js 16 deprecation)

- `middleware.ts` is deprecated in Next.js 16. `proxy.ts` is the new convention.
- The repository correctly uses `proxy.ts`. No action needed. But `AGENTS.md` description is inaccurate.

**RT-8** — Onboarding form `action` is a JavaScript function (not progressive enhancement)

- `<form action={handleSubmit}>` with a client-side async handler.
- Server action is invoked programmatically, not via native form POST.
- Requires JavaScript. Acceptable for this use case.

---

## 6. Recommended Next Action

### Must Address Before Implementation

**RT-1 (MAJOR)**: The `org+provider` flow design is broken by construction at the runtime level. The fix direction is NOT to change the Clerk session token or add org creation to bootstrap — that would violate provider isolation. Instead:

**Direction**: Detect the "authenticated + no org context" state in bootstrap and render a **waiting/instruction page** (Client Component) that:

1. Renders a message: "You need to join or create a workspace to continue"
2. Uses Clerk's client-side org UI (`<CreateOrganization>` or `<OrganizationSwitcher>`) to let the user create/select an org
3. After org selection, triggers a `window.location.replace('/auth/bootstrap')` to re-run bootstrap with the new org context in the session

This is runtime-safe: it uses Clerk's own client-side SDK for org management, does not require any server-side org creation, and only triggers bootstrap re-run after the session token has been refreshed with the new `orgId`.

**RT-2 (MAJOR)**: The redirect loop must be broken. The `TENANT_CONTEXT_REQUIRED` case in `UsersLayout` should redirect to a dedicated **tenant recovery page** (e.g., `/auth/bootstrap?reason=tenant-lost`) rather than `/onboarding`, which is guarded by onboarding completion status and creates the loop.

**RT-3 (MINOR, latent)**: Move `isBootstrapRoute` and `isOnboardingRoute` guard checks to **before** `resolveIdentity()` in `withAuth.ts`. These routes do not need identity resolution at the middleware/proxy level — they are self-managing RSC pages.

### Runtime Constraints for Implementation

1. All provisioning reads from Clerk session must happen in **Node RSC/server action scope**, not in Edge proxy
2. Clerk's `auth()` in RSC always reads the current request's session JWT — there is no way to force a session refresh at the RSC level; session refresh must happen client-side via Clerk SDK
3. `cacheComponents: true` (PPR) means any new pages in the auth flow that use dynamic APIs are correctly dynamic — no `export const dynamic = 'force-dynamic'` is needed if the page calls `auth()`, `cookies()`, `headers()`, or `searchParams`
4. Do not introduce `export const runtime = 'nodejs'` in `proxy.ts` — this would change the proxy runtime and may break Clerk middleware behavior on Vercel edge
5. Do not add DB calls to `proxy.ts` — the edge/node boundary documented in `docs/architecture/15 - Edge vs Node Composition Root Boundary.md` must be preserved

---

## Recommendation

**Safe to implement** with the constraints above. The identified failures are structural flow design issues (wrong redirect target, missing interstitial state handling), not fundamental runtime architecture problems. The server/client placement, edge/node boundary, and caching behavior are all correct. Runtime fixes are low blast radius and confined to the bootstrap page, users layout, and middleware ordering.
