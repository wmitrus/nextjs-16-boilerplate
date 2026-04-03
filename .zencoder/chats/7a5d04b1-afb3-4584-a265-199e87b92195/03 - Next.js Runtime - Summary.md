# 03 - Next.js Runtime - Summary

## Task Context

- **Task ID**: `feature-flags-security-audit` (case `3344a061-a328-46f4-b51b-c72a67b7df06`)
- **Task Objective**: Runtime security assessment of the feature-flags system — focus on server/client boundaries, caching, env exposure, RSC patterns, and Edge vs. Node placement.
- **Current Run Scope**: Demo page RSC, factory bootstrap, env schema, GrowthBook module-level singleton, caching behavior.
- **Status**: COMPLETED
- **Last Updated**: 2026-04-02

---

## Scope Handled

- **Runtime entrypoints reviewed**: `src/app/feature-flags-demo/page.tsx` (RSC), `src/core/runtime/bootstrap.ts`, `src/modules/feature-flags/factory.ts`
- **App Router surfaces reviewed**: RSC page, no route handlers or server actions added
- **Runtime questions in scope**: server vs. client placement, caching risk, env var exposure, module-level singleton lifetime, `connection()` usage

---

## Findings

### RT-01 — `connection()` Correctly Applied in Demo Page RSC

**File**: `src/app/feature-flags-demo/page.tsx`

```typescript
async function FeatureFlagsDemoContent() {
  await connection();  // ← correct — opts route into dynamic rendering before getAppContainer()
  const requestContainer = getAppContainer().createChild();
  ...
}
```

✅ **SAFE** — `connection()` from `next/server` is called before `getAppContainer()`. This correctly prevents Next.js 16 prerender errors from `Date.now()` calls inside the DI infrastructure initializer (Pino logger). Compliant with the mandatory pattern in AGENTS.md.

---

### RT-02 — GrowthBook Module-Level Singleton Lifetime Risk

**File**: `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts`

```typescript
const instanceCache = new Map<string, CacheEntry>(); // module-level, process lifetime
```

**Runtime concern**: This module-level `Map` persists for the full process lifetime. Implications:

1. **Key rotation risk**: If `GROWTHBOOK_CLIENT_KEY` is rotated (new value deployed without restart), the stale cached instance continues using the old key until process restart. The new key only takes effect in fresh processes.

2. **Memory leak on test churn**: In vitest test runs, module-level Maps accumulate state across test files unless explicitly cleared. This caused the known GrowthBook test isolation issues documented in `EXTENDED_SUMMARY.md`.

3. **Next.js `cacheComponents: true` context**: With Cache Components enabled, RSC renders can be cached across requests. If a cached RSC render includes flag evaluation results from the GrowthBook singleton's shared state, those results may be served to different users/tenants from cache — **cross-tenant cache contamination**.

**Classification**: MAJOR for the cross-tenant cache risk; MINOR for key rotation; already captured as CRIT-01 in Security review for the attribute contamination angle.

---

### RT-03 — No Client Bundle Exposure Risk

All feature-flag evaluation code is in:

- Server-only module files (no `'use client'` directive)
- Node.js-only dependencies (`@growthbook/growthbook`, drizzle-orm)
- `src/modules/feature-flags/` — no imports from client components

✅ **SAFE** — Zero risk of GrowthBook SDK, Drizzle, or flag logic leaking to client bundles.

---

### RT-04 — Env Vars Correctly Classified as Server-Only

```typescript
// env.ts — server block:
FEATURE_FLAG_PROVIDER: z.enum(['static', 'db', 'growthbook']).default('static'),
FEATURE_FLAGS_STATIC: z.string().optional(),
GROWTHBOOK_CLIENT_KEY: z.string().optional(),
GROWTHBOOK_API_HOST: z.url().optional(),
```

✅ **SAFE** — All feature-flag env vars are in the T3-Env `server` block. None are prefixed `NEXT_PUBLIC_*`. They cannot be accessed in client components or leaked to the browser.

---

### RT-05 — Demo Page RSC: Flag Results Are Not Cacheable Per-Tenant (Expected)

The demo page RSC calls `await connection()` which opts the route into **fully dynamic rendering** (no static prerendering). This means:

- No SSG/ISR for this page
- Each request produces a fresh render
- Flag evaluation results are not cached at the page level

✅ **SAFE** — `connection()` ensures dynamic rendering. Flag values are re-evaluated per request.

However, **if `connection()` were removed** and the route became statically prerenderable, flag evaluation results would be cached and served to all users from the same static HTML — losing any tenant-specific evaluation. The `connection()` call is the critical guard preventing this.

---

### RT-06 — No Edge Runtime Usage for Feature Flags

Feature flag evaluation does not run in the Edge runtime (`src/proxy.ts` / middleware). The proxy is Edge-compatible; the `FEATURE_FLAGS.SERVICE` is registered only in `createRequestContainer()` (Node.js runtime), not in `createEdgeRequestContainer()`.

✅ **SAFE** — No Edge runtime placement issues. Drizzle ORM and GrowthBook SDK are both Node.js-only; correct placement avoids runtime incompatibility errors.

---

## Runtime Assessment Summary

| Surface                              | Status  | Notes                                                                    |
| ------------------------------------ | ------- | ------------------------------------------------------------------------ |
| RSC `connection()` pattern           | ✅ SAFE | Correctly applied                                                        |
| Client bundle exposure               | ✅ SAFE | No leakage                                                               |
| Server-only env vars                 | ✅ SAFE | All in server block                                                      |
| Dynamic rendering (no stale cache)   | ✅ SAFE | `connection()` enforces dynamic                                          |
| Edge runtime avoidance               | ✅ SAFE | Feature flags are Node-only                                              |
| Module-level singleton cross-request | ❌ RISK | Covered in CRIT-01 (Security summary)                                    |
| Cache Components cross-tenant risk   | ❌ RISK | GrowthBook singleton + cached render = cross-tenant flag values possible |

---

## Recommended Next Action

The critical runtime risk (RT-02) is the same as CRIT-01 in the Security summary: resolve shared mutable GrowthBook state before `cacheComponents: true` can produce a cross-tenant cache leak. The fix (per-request context instead of singleton attribute mutation) resolves both the security and the runtime risk simultaneously.
