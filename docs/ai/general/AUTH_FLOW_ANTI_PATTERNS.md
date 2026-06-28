# Auth Flow Lessons Learned, Contract, and Anti-Patterns

## Purpose

This document captures the final lessons learned from debugging the Clerk + Next.js 16 + App Router + DB-backed onboarding flow in this repository.

Its purpose is to prevent future regressions, avoid repeated anti-patterns, and provide a stable reference for:

- architecture decisions
- auth/onboarding routing decisions
- implementation reviews
- AI agent instructions and review prompts

This document is normative for auth/bootstrap/onboarding flow decisions unless a newer architecture decision explicitly supersedes it.

---

## Executive Summary

The core failure pattern was not a simple Clerk bug, DB bug, or onboarding form bug.

The real failure came from combining:

- Clerk post-SSO client refresh behavior
- streaming RSC redirects
- a heavy bootstrap/provisioning boundary
- and route transitions resolved too late in the render path

The most important lesson is:

> In a Clerk + Next.js App Router system with DB-backed onboarding truth, the decision that a user must complete onboarding must not be made in a streaming server layout on the hot path immediately after SSO.  
> It must be resolved earlier using a lightweight, edge-readable routing signal, while DB remains the source of truth.

---

## Final Architectural Principles

### 1. Clerk is not the source of truth for onboarding completion

Clerk is responsible for authentication and session establishment.

Clerk is **not** the source of truth for:

- provisioning completeness
- tenant membership completeness
- onboarding completeness

Those remain in the application database.

### 2. The database remains the only source of truth

The application database is authoritative for:

- whether a user exists internally
- whether provisioning completed
- whether a tenant exists
- whether membership exists
- whether onboarding is complete

Any client signal, middleware signal, or cookie signal is only a routing hint, never business truth.

### 3. Edge middleware cannot depend on DB reads

`src/proxy.ts` / edge auth middleware must not assume access to the database.

If middleware must redirect based on onboarding-required state, it must use an **edge-readable routing signal**, not a DB lookup.

### 4. Middleware-level onboarding redirect is the right place for the hot-path routing decision

If a user must be redirected to `/onboarding`, that decision should be made before entering the heavy streaming RSC route tree whenever possible.

This is especially important immediately after Clerk SSO / sign-in / sign-up completion.

### 5. Users layout is a fallback safety net, not the hot-path onboarding router

`src/app/users/layout.tsx` may remain a DB-backed safety net.

It must **not** be treated as the primary hot-path mechanism for deciding onboarding redirects after SSO.

### 6. Cookie-based onboarding signal is allowed only as a transient routing hint

A cookie such as `__onboarding_pending` may be used to bridge state from a server-owned boundary to edge middleware.

This cookie:

- is allowed only as a routing hint
- must not be treated as authorization truth
- must not replace DB-backed checks
- must be cleared as soon as onboarding completes

### 7. Cookie mutation must happen only in runtime-legal boundaries

Cookie mutation (`set`, `delete`) must happen only in:

- Route Handlers
- Server Actions

It must **not** happen during `page.tsx` / `layout.tsx` render.

### 8. Shared provider/root layout boundaries must remain stable

The shared root layout around `ClerkProvider` and the route shell must be kept as stable and minimal as possible.

Avoid introducing hidden streaming traps or opaque route transitions at this boundary.

---

## Final Auth / Bootstrap / Onboarding Flow Contract

This section describes the intended shape of the flow.

### High-level flow

1. User authenticates with Clerk
2. Post-auth landing goes to an app-owned bootstrap boundary
3. Provisioning/user resolution occurs in an app-owned server boundary
4. If onboarding is incomplete:
   - a transient routing signal may be set in a runtime-legal boundary
   - middleware may redirect to `/onboarding`
5. Onboarding form submission updates DB truth
6. Completion action clears transient routing signal
7. Subsequent requests to `/users` are allowed directly

### Invariants

The following invariants must hold:

- DB is always the truth for onboarding completion
- middleware never becomes the truth for onboarding
- cookie signal is routing-only
- post-auth redirect decisions must avoid streaming RSC races
- onboarding-required should be resolved before the hot `/users` render path whenever possible
- recovery/status UI must be separated from provisioning hot path if the hot path proves unstable

---

## Anti-Patterns and What Was Wrong

### Anti-Pattern 1: Redirecting to `/onboarding` from `UsersLayout` on the hot path

**What happened**

`UsersLayout` used `redirect('/onboarding')` as the main redirect path when onboarding was incomplete.

**Why it was wrong**

Immediately after Clerk SSO, this redirect raced with Clerk-driven client refresh behavior.
That created an RSC navigation race where:

- `/users` committed
- `/onboarding` never reliably committed
- React could fail to commit either route transition cleanly

**Rule**

Do not use streaming `layout.tsx` redirect as the primary onboarding redirect immediately after post-auth landing.

---

### Anti-Pattern 2: `fallback={null}` above the shared Clerk/provider shell

**What happened**

A high-level `Suspense fallback={null}` wrapped the shared route/provider shell.

**Why it was wrong**

This hid route-settlement failures and made the application appear to be frozen on "Rendering..." with poor observability.

**Rule**

Do not use `fallback={null}` above `ClerkProvider` or above the shared auth/navigation shell.

---

### Anti-Pattern 3: Removing Suspense above the Clerk branch entirely

**What happened**

Suspense was removed from the root boundary to test whether it was trapping route commit.

**Why it was wrong**

With `cacheComponents: true`, Next.js requires correct Suspense structure around blocking route data. Removing it entirely triggered `blocking-route` failures.

**Rule**

Do not remove required Suspense boundaries around the Clerk branch under Next.js 16 cache component constraints.

**Correct pattern**

Use a visible, minimal fallback and scope Suspense narrowly to the Clerk branch, not as a global null boundary.

---

### Anti-Pattern 4: Mutating cookies in `page.tsx` / `layout.tsx`

**What happened**

`cookies().set()` was attempted inside `src/app/auth/bootstrap/page.tsx`.

**Why it was wrong**

In Next.js App Router, cookie mutation is only allowed in:

- Route Handlers
- Server Actions

It is not valid during Server Component render.

**Rule**

Never call `cookies().set()` or `cookies().delete()` in `page.tsx` or `layout.tsx` render logic.

---

### Anti-Pattern 5: Using cookie as the source of truth

**What happened**

### Anti-Pattern 6: Consuming one-time verification tokens during initial GET render

**What happened**

`/auth/verify-email` consumed the verification token during the initial page render.

**Why it was wrong**

- a plain GET request triggered a destructive state transition
- link previewers, prefetchers, or accidental reloads could consume the token
- the UI had no explicit user confirmation boundary for a one-time auth action

**Rule**

Do not consume single-use auth tokens during initial `page.tsx` render.

**Correct pattern**

- GET may read `searchParams` and render a ready/error state
- a Server Action or Route Handler POST must perform token consumption
- successful verification may then redirect to the sign-in page

There was a risk that `__onboarding_pending` could become more than a routing hint.

**Why it would have been wrong**

Cookies can be stale, forged, or drift from DB state.
They are not authoritative business state.

**Rule**

Cookies may only be used as transient routing hints, never as onboarding truth or authorization truth.

---

### Anti-Pattern 6: Putting raw cookie/path redirect logic directly into `src/proxy.ts`

**What happened**

There was temptation to add direct cookie/path branching in the proxy file.

**Why it was wrong**

That would bypass existing routing/security composition and duplicate logic already intended to live in the middleware/auth pipeline.

**Rule**

Do not add raw ad hoc auth/onboarding redirect logic directly in `src/proxy.ts`.
Route decisions must flow through the existing middleware/auth abstractions.

---

### Anti-Pattern 7: Assuming edge middleware can query the DB

**What happened**

Early fix attempts implicitly assumed onboarding-required could be resolved from the DB in the edge runtime.

**Why it was wrong**

The edge runtime cannot be treated as a DB-reading environment for this flow.

**Rule**

Do not design auth/onboarding middleware around DB reads in the edge runtime.

---

### Anti-Pattern 8: Using a heavy bootstrap `page.tsx` as the direct Clerk post-auth landing target

**What happened**

Clerk landed directly on a heavy bootstrap page that performed:

- provisioning
- user lookup
- redirect logic
- error handling
  inside a streaming RSC page boundary

**Why it was wrong**

This created an unstable post-SSO boundary and kept the critical decision point inside a fragile render path.

**Rule**

Do not use a heavy provisioning `page.tsx` as the direct post-auth landing route when the route proves unstable under App Router/Clerk timing.

---

### Anti-Pattern 9: Removing probes too early

**What happened**

Temporary instrumentation/probes were removed before the final boundary was conclusively closed.

**Why it was wrong**

This reduced observability and made subsequent failing runs harder to classify.

**Rule**

Keep temporary auth/onboarding route probes until stable E2E success is confirmed repeatedly.

---

### Anti-Pattern 10: Chasing broad hypotheses instead of narrowing boundaries

**What happened**

The investigation repeatedly mixed:

- bootstrap
- Postgres
- onboarding
- client hydration
- provider shell
- Clerk
- middleware

**Why it was wrong**

---

### Anti-Pattern 11: AuthJS E2E helpers that only provision completed users

**What happened**

The AuthJS E2E provisioning helper initially forced `onboardingComplete: true` for every provisioned test user.

**Why it was wrong**

That made the focused AuthJS browser proof blind to the exact branch that repeatedly regressed in production-style debugging: incomplete user sign-in settling on `/onboarding` before continuing to the ready route.

Session-route health and completed-user dashboard entry could still pass while the incomplete-user onboarding path remained broken.

**Rule**

AuthJS E2E provisioning helpers must support explicit onboarding-state control whenever auth/bootstrap/onboarding regressions are in scope.

**Correct pattern**

- support an explicit `onboardingComplete` override in the AuthJS E2E provisioning path
- include a focused browser scenario that proves an incomplete AuthJS user goes through `/auth/signin -> /onboarding -> ready route`
- do not mark focused AuthJS auth-flow validation complete with only session-route or completed-user evidence

Without a strict boundary-by-boundary model, many steps became expensive and inconclusive.

**Rule**

For App Router auth problems, debug in this order:

1. server entry
2. redirect decision
3. route commit
4. shared provider/shell boundary
5. subtree mount
6. submit flow
7. post-submit return path

---

## Patterns That Were Confirmed As Good

### Good Pattern 1: DB-backed source of truth with edge-readable routing hint

This is the key compromise that fits this repository well:

- DB remains authoritative
- middleware gets a lightweight edge-readable signal
- users layout remains a server-backed fallback

### Good Pattern 2: Thin and stable root layout

The root layout should remain as simple as possible:

- `ClerkProvider`
- minimal shell
- minimal shared client boundary complexity

### Good Pattern 3: Runtime-legal mutation boundaries

Use:

- Route Handlers for request/response mutation like `Set-Cookie`
- Server Actions for mutation and post-submit state cleanup

### Good Pattern 4: Keep recovery UI separate from hot-path provisioning logic

If a heavy post-auth bootstrap page proves unstable, split:

- hot-path bootstrap decision boundary
- UI-only recovery/status page

### Good Pattern 5: Keep server safety nets even after moving hot-path routing earlier

Even if middleware redirects earlier, server-side DB-backed guardrails must remain.

---

## Required Rules for Future Auth Flow Changes

Any future auth/bootstrap/onboarding change must satisfy all of the following:

1. It must not reintroduce streaming RSC redirect races on the hot post-SSO path.
2. It must not mutate cookies in illegal Next.js runtime boundaries.
3. It must not move onboarding truth from DB into Clerk or cookies as a shortcut.
4. It must not add new raw redirect logic directly into `src/proxy.ts`.
5. It must keep `UsersLayout` as fallback safety net, not as hot-path redirect orchestrator.
6. It must preserve stable root/provider layout behavior under Next.js 16.
7. It must include observability sufficient to classify:
   - route decision
   - route commit
   - subtree mount
   - submit success
8. It must be reviewed against:
   - Next.js App Router runtime legality
   - Clerk middleware/onboarding patterns
   - repository security boundaries
   - modular monolith boundaries

---

## Recommended Placement in Project Documentation

This document fits best as an architecture/supporting reference, not as the main top-level project README.

### Best primary location

Recommended path:

`docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`

This makes sense because:

- it is cross-cutting
- it affects architecture, runtime, security, and AI implementation guidance
- it is not just product documentation
- it is not only for one agent

### Also link it from

1. **Architecture Guard instructions**
   - because many of the mistakes were architectural, not just implementation bugs

2. **Next.js Runtime Agent instructions**
   - because several failures were runtime-illegal or App Router-specific

3. **Security/Auth Agent instructions**
   - because middleware, source of truth, and auth-routing boundaries matter here

4. **Any auth/onboarding feature workflow prompt templates**
   - especially if they touch Clerk, middleware, bootstrap, or onboarding redirects

### Optional secondary location

If you keep a docs tree for runtime/architecture decisions, also consider:

`docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

But keep one canonical source and link to it elsewhere.

---

## Suggested Cross-References to Add

Link this document from:

- mode manifests or architecture review instructions
- auth-specific implementation prompts
- onboarding feature prompts
- runtime troubleshooting docs
- any “do not regress these flows” checklist

Suggested wording for AI instructions:

> Before proposing or implementing changes to Clerk auth, bootstrap routing, onboarding redirects, root layout auth boundaries, or middleware onboarding enforcement, read `AUTH_FLOW_ANTI_PATTERNS.md` first, then use `AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios.

---

## Final One-Sentence Lesson

In a Clerk + Next.js App Router application with DB-backed onboarding truth, the onboarding-required redirect must be decided before the hot streaming RSC path using a lightweight edge-readable routing hint, while DB remains the only source of truth and all cookie mutation stays in runtime-legal boundaries.
