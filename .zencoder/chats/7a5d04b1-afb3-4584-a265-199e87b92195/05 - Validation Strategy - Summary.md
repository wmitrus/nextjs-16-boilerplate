# 05 - Validation Strategy - Summary

## Task Context

- **Task ID**: `feature-flags-security-audit` (case `3344a061-a328-46f4-b51b-c72a67b7df06`)
- **Task Objective**: Answer the two open questions from `constraints.md`, clarify the correct GrowthBook fix strategy, validate the modular monolith architecture of the feature-flags system, and confirm minimum required validation scope for the remediation.
- **Mode**: Change Validation
- **Status**: COMPLETED
- **Last Updated**: 2026-04-02

---

## 1. Objective

Answer the two open questions from `constraints.md`:

1. **Question 1 (allowlist scope)**: Should the GrowthBook API host be restricted in code? Does GrowthBook support on-prem instances?
2. **Question 2 (per-request init cost)**: What does "per-request init cost" mean, and how does it affect the CRIT-01 fix?

Then validate the feature-flags implementation against modular monolith patterns and confirm the minimum validation scope.

---

## 2. Mode

**Mode 2: Change Validation** — scoped to the feature-flags security remediation.

---

## 3. Open Questions — Answers

---

### Answer to Question 1 — GROWTHBOOK_API_HOST: Do NOT restrict the hostname

**Short answer**: Yes, GrowthBook officially supports on-prem / self-hosted instances. The hostname allowlist proposed in the security audit (`*.growthbook.io` only) would break that use case and should NOT be in code.

**What GrowthBook on-prem is**: GrowthBook is open-source. Many enterprises run their own GrowthBook server on their own infrastructure (e.g., `https://growthbook.mycompany.com`, `https://flags.internal.example.com`). The `GROWTHBOOK_API_HOST` env var exists precisely to support this.

**What validation IS correct**: Restrict the **protocol only** — require `https:`. This provides meaningful SSRF protection because:

- Cloud metadata endpoints (`169.254.169.254`, `fd00:ec2::254`) use `http://` — blocked by `https:` check ✅
- Internal VPC services commonly use `http://` for local traffic — blocked ✅
- Malicious `file://`, `ftp://` etc. — blocked ✅
- Legitimate GrowthBook cloud: `https://cdn.growthbook.io` — allowed ✅
- Legitimate GrowthBook on-prem: `https://growthbook.mycompany.com` — allowed ✅

**Correct guard in code**:

```typescript
function assertSafeGrowthBookApiHost(apiHost: string): void {
  let parsed: URL;
  try {
    parsed = new URL(apiHost);
  } catch {
    throw new Error(
      `[feature-flags] Invalid GROWTHBOOK_API_HOST: "${apiHost}"`,
    );
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `[feature-flags] GROWTHBOOK_API_HOST must use https: protocol. Received: "${parsed.protocol}"`,
    );
  }
}
```

This satisfies the AGENTS.md SSRF rule (protocol validation at point of use) without restricting hostname — which is the correct risk-proportionate approach for an admin-controlled env var.

---

### Answer to Question 2 — Per-Request Init Cost: NOT a problem with the correct SDK API

**What "per-request init cost" means**:

`gb.init()` in the old `GrowthBook` class makes an **HTTP network call** to GrowthBook's API to fetch feature definitions (`{apiHost}/api/features/{clientKey}`). If you create a new `GrowthBook` instance per request AND call `gb.init()` each time, every feature flag evaluation would incur:

- A full HTTP round-trip to the GrowthBook API (typically 100–500ms over internet, or ~5–50ms on internal network)
- Under load (100 req/s), this means 100 outbound HTTP calls/second to GrowthBook
- The default timeout is 2000ms — this blocks the request for up to 2 seconds on cold start

This would make the GrowthBook adapter practically unusable at production scale.

**Why this concern is RESOLVED by the correct SDK choice**:

The GrowthBook SDK v1.6.5 (already installed in this project) ships **two distinct APIs**:

| API          | Class              | Caching                                     | Per-request mutable state?                                         |
| ------------ | ------------------ | ------------------------------------------- | ------------------------------------------------------------------ |
| Legacy (old) | `GrowthBook`       | Instance-level                              | YES — `setAttributes()` mutates shared state ← **CRIT-01 problem** |
| Modern (new) | `GrowthBookClient` | **SDK-managed module-level cache with TTL** | NO — user context passed per-call ← **correct**                    |

The `GrowthBookClient`:

- Initializes **once** (module level) — fetches features from the API and caches them
- Has built-in TTL-based cache refresh (`configureCache({ staleTTL })`)
- Evaluates flags **synchronously** against the cached payload using `client.isOn(key, userContext)` — the `userContext` is passed per-call, no mutation of shared state
- Provides `createScopedInstance(userContext)` — creates a `UserScopedGrowthBook` that wraps the shared client with per-request context

**The fix for CRIT-01 is to switch from `GrowthBook` to `GrowthBookClient`**:

```typescript
// Current broken pattern (old GrowthBook API — shared mutable state):
const instanceCache = new Map<string, CacheEntry>();
// ... gb.setAttributes(userContext) ← mutates shared state ← WRONG

// Correct pattern (new GrowthBookClient API):
import { GrowthBookClient } from '@growthbook/growthbook';

const clientCache = new Map<string, GrowthBookClient>();

function getOrCreateClient(
  clientKey: string,
  apiHost: string,
): GrowthBookClient {
  const existing = clientCache.get(clientKey);
  if (existing) return existing;
  const client = new GrowthBookClient({ clientKey, apiHost });
  clientCache.set(clientKey, client);
  return client;
}

export class GrowthBookFeatureFlagService implements FeatureFlagService {
  async isEnabled(
    flag: string,
    context: AuthorizationContext,
  ): Promise<boolean> {
    const client = getOrCreateClient(this.clientKey, this.apiHost);
    if (!client.ready) {
      await client.init({ timeout: 2000 });
    }
    // userContext is passed per-call — no shared mutable state
    return client.isOn(flag, {
      attributes: {
        id: context.subject.id,
        company: context.tenant.tenantId,
      },
    });
  }
}
```

**Result**: The `clientCache` caches only the `GrowthBookClient` instance (safe — immutable feature definitions, SDK handles TTL refresh). The per-call `isOn(flag, userContext)` is **synchronous** and uses no shared mutable state. **Zero per-request HTTP cost. Zero race condition.**

---

## 4. Architecture Verification — Modular Monolith Patterns

### Contract Layer (`src/core/contracts/feature-flags.ts`)

```typescript
export interface FeatureFlagService {
  isEnabled(flag: string, context: AuthorizationContext): Promise<boolean>;
}
```

✅ **Correct** — minimal, stable interface. Uses `AuthorizationContext` from the shared contract layer. No vendor types. No `getVariant()` or `FeatureFlagContext` (correctly deferred).

### DI Token (`src/core/contracts/index.ts`)

```typescript
export const FEATURE_FLAGS = { SERVICE: Symbol('FeatureFlagService') };
```

✅ **Correct** — Symbol token in core contracts. The only wiring seam for callers.

### Module Index (`src/modules/feature-flags/index.ts`)

Exports: `InMemoryFeatureFlagService`, `StaticFeatureFlagService`, `parseStaticFlagsEnv`, `DrizzleFeatureFlagService`, `GrowthBookFeatureFlagService`, `ResilientFeatureFlagService`, `isFeatureEnabled`.

⚠️ **Minor concern**: The module index exports all concrete adapter classes publicly. In a strict modular monolith, only what external callers need should be exported from the module barrel. The adapters are internally composed by the factory — external code should only receive `FeatureFlagService` via DI. Exporting all adapter classes from `index.ts` is not a hard violation (scripts legitimately use them), but it's worth noting.

### Factory (`src/modules/feature-flags/factory.ts`)

✅ **Correct** — `createFeatureFlagService` is the single composition seam. Takes typed env values, not raw process.env. Returns `FeatureFlagService` (interface). Wraps delegate in `ResilientFeatureFlagService`. No vendor types leak to callers.

### Bootstrap Wiring (`src/core/runtime/bootstrap.ts`)

```typescript
container.register(
  FEATURE_FLAGS.SERVICE,
  createFeatureFlagService(env.FEATURE_FLAG_PROVIDER, { ... }),
);
```

✅ **Correct** — DI token used as wiring seam. Factory called at container construction time. Env vars read from the T3-Env schema (validated, typed). No provider SDK types in bootstrap.

### Provider Isolation

✅ **GrowthBook SDK imports confined to** `src/modules/feature-flags/infrastructure/growthbook/` only — confirmed no leakage to contracts, core, or app layer.

✅ **Drizzle imports confined to** `src/modules/feature-flags/infrastructure/drizzle/` only.

### Resilient Wrapper Pattern

✅ **Correct** — `ResilientFeatureFlagService` wraps the delegate with fail-safe behavior (any exception → `false`). Applied universally by factory. Contract documents the guarantee. Callers do not need try/catch.

### Overall Architecture Assessment

The feature-flags implementation follows the modular monolith pattern correctly:

- Contract in `core/contracts/` ✅
- DI token in `core/contracts/index.ts` ✅
- Adapters in `modules/feature-flags/infrastructure/` ✅
- Factory as composition seam ✅
- No vendor SDK types in contracts or app layer ✅
- Server-side evaluation only ✅
- Env vars typed and server-only ✅

---

## 5. Validation-Risk Assessment

| Risk                                                        | Level    | Validated?                                                  |
| ----------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| GrowthBook cross-tenant attribute contamination             | CRITICAL | ❌ No test validates concurrent isolation                   |
| `setAttributes` is async — race condition is confirmed real | CRITICAL | ❌ SDK d.ts confirms `setAttributes(): Promise<void>`       |
| Route policy mismatch for `/feature-flags-demo`             | CRITICAL | ❌ E2E tests untested against production-config server      |
| Path traversal in flag scripts                              | MAJOR    | ❌ No test exercises `--out` / `--file` with traversal path |
| GROWTHBOOK_API_HOST protocol validation                     | MAJOR    | ❌ No test for non-https host rejection                     |
| Error object sanitization in ResilientService               | MAJOR    | ❌ No test verifies logger call fields                      |
| DB schema: `tenant_id` text type                            | Resolved | ✅ DB integration test exercises non-UUID values            |
| Static adapter: flag parsing                                | OK       | ✅ Unit test covers happy path and edge cases               |
| Drizzle adapter: tenant isolation                           | OK       | ✅ DB integration test covers all isolation scenarios       |

---

## 6. Recommended Validation Scope

### Minimum Required Validation

**After every fix**:

```shell
pnpm typecheck
pnpm lint --fix
pnpm test
```

**CRIT-01 (switch to `GrowthBookClient`)**:

- `GrowthBookFeatureFlagService.test.ts` must still pass
- Add one test: two concurrent `isEnabled()` calls with different `context.tenant.tenantId` values must each return the result for their own context — no cross-contamination

**CRIT-02 (add `/feature-flags-demo` to `PUBLIC_ROUTE_PREFIXES`)**:

- Run E2E spec against a real dev server after fix:
  ```shell
  pnpm build && pnpm start &
  sleep 5
  pnpm e2e --grep "Feature Flags Demo"
  ```
- All 5 tests must pass without stored auth state

**MAJ-01/MAJ-02 (path confinement in scripts)**:

- Add unit tests in `scripts/flags/utils.test.ts` for the new `assertPathWithinBase()` function:
  - Valid path within CWD → no throw
  - `../outside` → throws with clear message
  - Absolute path outside CWD → throws
- Run: `pnpm test` (unit suite covers scripts)

**MAJ-03 (protocol-only allowlist for `GROWTHBOOK_API_HOST`)**:

- Add unit tests for `assertSafeGrowthBookApiHost()`:
  - `https://cdn.growthbook.io` → no throw
  - `https://growthbook.mycompany.com` → no throw (on-prem must work)
  - `http://cdn.growthbook.io` → throws
  - `http://169.254.169.254` → throws
  - `file:///etc/passwd` → throws
  - Invalid URL string → throws

**MAJ-04 (error sanitization in ResilientFeatureFlagService)**:

- Add test verifying logger receives `errorMessage: string` and `errorName: string`, NOT an object or raw error

### Optional Additional Validation

- Integration test for GrowthBook concurrent isolation (using `Promise.all` with two contexts and MSW-intercepted responses that differ based on `attributes.company`)
- Manual smoke: visit `/feature-flags-demo` in browser after CRIT-02 fix while logged out

### Validation Explicitly NOT Required

- Re-running DB integration tests unless schema changes (no schema changes needed)
- Re-running auth flow E2E tests — the only auth change is adding one public route, which does not affect protected route logic
- Storybook/visual regression — no UI components changed by any of these fixes

---

## 7. Validation Commands or Checks

```shell
# After all fixes:
pnpm lint --fix
pnpm typecheck
pnpm test

# After CRIT-02 fix specifically:
pnpm build && pnpm start &
sleep 5
pnpm e2e --grep "Feature Flags Demo"
```

---

## 8. Recommended Next Action

**For the Implementation Agent**:

1. **CRIT-01**: Replace `GrowthBook` with `GrowthBookClient` in `GrowthBookFeatureFlagService.ts`. Cache the `GrowthBookClient` at module level (safe — no mutable user state). Pass `userContext` to `client.isOn()` per call. Confirm `GrowthBookClient` is exported from `@growthbook/growthbook` (it is — confirmed in SDK types).

2. **CRIT-02**: Add `'/feature-flags-demo'` to `PUBLIC_ROUTE_PREFIXES` in `route-policy.ts`.

3. **MAJ-01/MAJ-02**: Add `assertPathWithinBase()` to `scripts/flags/utils.ts`. Call it in `export.ts` before `fs.writeFileSync` and in `import.ts` before `fs.readFileSync`. Use `process.cwd()` as the base for `--out`. Use `process.cwd()` as the base for `--file`.

4. **MAJ-03**: Add `assertSafeGrowthBookApiHost()` to `factory.ts` (protocol-only, no hostname restriction). Call it before `new GrowthBookFeatureFlagService(...)`.

5. **MAJ-04**: Sanitize `error` in `ResilientFeatureFlagService` to `{ errorMessage, errorName }`.

**Questions resolved — no remaining blocks for Implementation Agent.**
