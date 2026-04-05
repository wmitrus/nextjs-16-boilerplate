# Feature Intake: Per-Request DI Container Caching

**Task ID**: `2026-04-05-per-request-caching`
**Status**: ✅ Complete
**Source**: Gap analysis follow-up (`2026-04-04-gap-analysis-followup/intake.md`) + User brief (2026-04-05)

---

## Objective

Introduce request-scoped memoization of the application DI container so all Server Components within the same RSC render pass share a single Container instance and its service graph.

---

## Problem Statement (Verified in Code)

**Current behaviour** (`src/core/runtime/bootstrap.ts`, line 130):

```typescript
export function getAppContainer(): Container {
  return createRequestContainer(buildConfig());
}
```

`getAppContainer()` calls `createRequestContainer()` on every invocation. Each call:

- Constructs a new `Container` instance
- Instantiates a new `DrizzleMembershipRepository`
- Calls `createFeatureFlagService()` (GrowthBook SDK client setup cost)
- Instantiates a new `DrizzleProvisioningService`
- Registers all auth, authorization, feature-flag, and provisioning modules

**Observed call sites** (code-verified):
| File | Call Pattern |
|---|---|
| `src/app/security-showcase/page.tsx:57` | `getAppContainer().createChild()` |
| `src/app/feature-flags-demo/page.tsx:37` | `getAppContainer().createChild()` |
| `src/app/onboarding/layout.tsx:40` | `getAppContainer()` |
| `src/app/onboarding/actions.ts:32` | `getAppContainer()` |
| `src/app/users/layout.tsx:40` | `getAppContainer()` |
| `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts:32` | `getAppContainer()` |

In a typical RSC render for `/users`, both `users/layout.tsx` and the page can invoke `getAppContainer()`, producing two separate Container instances. These are architecturally incorrect — they represent divergent service graphs for the same request.

---

## Expected Behaviour After Change

1. Within one RSC render pass, every call to `getAppContainer()` returns the **same** Container instance.
2. The Container instance is scoped to the request and garbage-collected after the render pass completes.
3. Server Actions (`'use server'`) continue to produce a fresh Container per invocation (per existing pattern and design decision).
4. The public `getAppContainer()` API signature is unchanged — no call-site migration required.
5. Child containers (`getAppContainer().createChild()`) continue to work correctly — they are created from the shared parent.

---

## Scope

### In Scope

- Wrap the internal container factory in `src/core/runtime/bootstrap.ts` with `React.cache()` (React 19, available)
- Optional: introduce `src/core/runtime/request-memoize.ts` exporting targeted per-request read helpers (identity, tenant, feature flags, provisioning status) also using `React.cache()`
- Unit tests covering the caching invariant
- Integration test confirming shared container in a simulated multi-RSC call
- Typecheck and lint compliance

### Out of Scope

- Edge runtime path (`createEdgeRequestContainer` in `src/core/runtime/edge.ts`) — already fresh per invocation by design, no change
- Server Action cross-invocation caching (explicitly excluded by design decision)
- `AsyncLocalStorage`-based cross-context propagation (not required, no concrete need)
- Demo/showcase page (explicitly excluded by design decision)
- Playwright E2E spec (no demo page = no E2E pattern F obligation)
- Any changes to the `Container` class itself
- Any changes to module registrations

---

## Auth / Security Impact

None. The container caching mechanism does not touch auth logic, tenancy, or trust boundaries. Identity and tenant resolution are performed by services registered inside the container and are unaffected by whether the container is new or memoized.

---

## Runtime Placement Requirements

- `React.cache()` is a **React 19 Server Components API** — it must only be used in server-context modules
- The cached factory must **not** be imported or called from client components
- The `bootstrap.ts` module is already a server-only module (uses `env`, DI services, `pino` logger)
- Marking `bootstrap.ts` or the cache wrapper with `'server-only'` (or noting the existing implicit server-only constraint) must be verified

---

## Assumptions

1. React 19's `cache()` is available — confirmed (`"react": "19.2.4"` in `package.json`)
2. `cache()` from React deduplicates calls to the wrapped function within the same React server render pass and is invalidated per server request — this is documented React 19 API behaviour
3. `cache()` works in Server Actions for per-invocation deduplication (within one action execution, not across invocations)
4. `buildConfig()` produces a deterministic config on each call (verified — reads from `env` which is process-static)
5. The `getInfrastructure()` call inside `createRequestContainer()` already has its own process-level cache — wrapping the container factory above it adds the request scope layer without conflict

---

## Open Questions

None. All questions resolved in user Q&A session on 2026-04-05.

---

## Readiness Checklist

| Prerequisite                           | Status |
| -------------------------------------- | ------ |
| Problem verified in live code          | ✅     |
| React `cache()` availability confirmed | ✅     |
| Call sites inventoried                 | ✅     |
| Design decisions obtained from user    | ✅     |
| Architecture review complete           | ✅     |
| Runtime review complete                | ✅     |
| Constraints documented                 | ✅     |
| Validation strategy documented         | ✅     |
| **User design approval**               | ✅     |
