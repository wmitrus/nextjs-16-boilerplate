# 01 - Architecture Guard - Summary

## Task Context

- **Task ID**: `feature-flags-security-audit` (case `3344a061-a328-46f4-b51b-c72a67b7df06`)
- **Task Objective**: Review all specialist findings and produce the final correct implementation plan for the feature-flags security remediation, incorporating the resolved open questions.
- **Status**: COMPLETED — final plan locked; Phase 2 stale-cache fix decision appended
- **Last Updated**: 2026-04-02

---

## 1. Objective

Synthesize the Security, Runtime, and Validation Strategy reviews into one precise, implementation-ready plan. The two open questions in `constraints.md` are now resolved. All architectural decisions below are binding.

---

## 2. Resolved Open Questions

### Question 1 — GROWTHBOOK_API_HOST: protocol-only validation, no hostname restriction

GrowthBook is open-source and explicitly supports self-hosted on-prem deployments. The `apiHost` env var is the documented mechanism for this. Restricting hostname to `*.growthbook.io` would make this boilerplate unusable for enterprise use cases.

**Binding decision**: Validate `https:` protocol only. Any hostname is permitted. This blocks the SSRF vectors (cloud metadata endpoints use `http://`) while preserving on-prem compatibility.

**Correct guard** (to be placed in `factory.ts` before instantiating `GrowthBookFeatureFlagService`):

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

### Question 2 — Per-request init cost: resolved by switching to `GrowthBookClient`

`GrowthBook.init()` (old API) makes an outbound HTTP call per instance. Per-request instantiation would add network latency to every flag evaluation — unacceptable at scale.

The SDK v1.6.5 (already installed) ships `GrowthBookClient` — the stateless API:

|                     | `GrowthBook` (old, current)                      | `GrowthBookClient` (new, correct)                          |
| ------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| `setAttributes()`   | `async Promise<void>` — **mutates shared state** | Does not exist — context passed per call                   |
| `isOn()`            | Reads shared mutable state                       | `isOn(key, userContext): boolean` — synchronous, stateless |
| Feature caching     | Instance-level                                   | SDK-managed module-level TTL cache                         |
| Race condition risk | **Yes** (confirmed by type signature)            | **No**                                                     |

**Binding decision**: Replace the `GrowthBook` class with `GrowthBookClient`. Cache the client at module level (safe — contains only immutable feature definitions, no user state). Pass `userContext` to `client.isOn()` per call.

---

## 3. Architectural Assessment

The feature-flags module is structurally sound:

- ✅ Contract in `core/contracts/feature-flags.ts` — minimal, stable, no vendor types
- ✅ DI token `FEATURE_FLAGS.SERVICE` is the single wiring seam
- ✅ Factory is the composition boundary — env values flow in, `FeatureFlagService` flows out
- ✅ All SDK imports are confined to their respective `infrastructure/` directories
- ✅ `ResilientFeatureFlagService` applies fail-safe behavior universally
- ✅ Server-side evaluation only; env vars are server-only

The fixes below are all internal to existing files. No module boundaries change. No contract signatures change. Blast radius is minimal.

---

## 4. Final Implementation Plan

### Summary of Changes

| Fix                                    | Severity | File(s)                               | Test update required?             |
| -------------------------------------- | -------- | ------------------------------------- | --------------------------------- |
| CRIT-01 — GrowthBookClient migration   | CRITICAL | `GrowthBookFeatureFlagService.ts`     | Yes — rewrite mock and assertions |
| CRIT-02 — Public route registration    | CRITICAL | `route-policy.ts`                     | No unit test; E2E spec validates  |
| MAJ-01 — Path confinement for `--out`  | MAJOR    | `scripts/flags/export.ts`, `utils.ts` | Yes — add to `utils.test.ts`      |
| MAJ-02 — Path confinement for `--file` | MAJOR    | `scripts/flags/import.ts`             | Same as MAJ-01                    |
| MAJ-03 — API host protocol validation  | MAJOR    | `factory.ts`                          | Yes — add to `factory.test.ts`    |
| MAJ-04 — Error sanitization in logs    | MAJOR    | `ResilientFeatureFlagService.ts`      | Yes — update existing assertion   |
| MIN-01 — Replace `console.warn`        | MINOR    | `factory.ts`                          | Yes — update existing test        |

---

### Step R1 — CRIT-01: Switch `GrowthBookFeatureFlagService` to `GrowthBookClient`

**File**: `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts`

**What changes**:

- Import `GrowthBookClient` instead of `GrowthBook` from `@growthbook/growthbook`
- Rename `instanceCache` → `clientCache`, change value type to `{ client: GrowthBookClient; ready: Promise<void> }`
- Rename `getOrCreateInstance` → `getOrCreateClient`, construct `GrowthBookClient` instead of `GrowthBook`
- In `isEnabled`: `await ready`, then call `client.isOn(flag, { attributes: { id, company } })` — no `setAttributes()` call
- Keep the `GrowthBookFeatureFlagServiceConfig` interface unchanged (same constructor signature)
- Do NOT import `UserContext` as a named type from the SDK into the service (avoids vendor type leakage into the method body in a way that callers would see — it is fine to use inline)

**Resulting implementation**:

```typescript
import { GrowthBookClient } from '@growthbook/growthbook';

import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';

interface ClientEntry {
  client: GrowthBookClient;
  ready: Promise<void>;
}

const clientCache = new Map<string, ClientEntry>();

function getOrCreateClient(clientKey: string, apiHost: string): ClientEntry {
  const existing = clientCache.get(clientKey);
  if (existing) return existing;
  const client = new GrowthBookClient({ clientKey, apiHost });
  const ready = client.init({ timeout: 2000 }).then(() => undefined);
  const entry: ClientEntry = { client, ready };
  clientCache.set(clientKey, entry);
  return entry;
}

export interface GrowthBookFeatureFlagServiceConfig {
  clientKey: string;
  apiHost: string;
}

export class GrowthBookFeatureFlagService implements FeatureFlagService {
  private readonly clientKey: string;
  private readonly apiHost: string;

  constructor(config: GrowthBookFeatureFlagServiceConfig) {
    this.clientKey = config.clientKey;
    this.apiHost = config.apiHost;
  }

  async isEnabled(
    flag: string,
    context: AuthorizationContext,
  ): Promise<boolean> {
    const { client, ready } = getOrCreateClient(this.clientKey, this.apiHost);
    await ready;
    return client.isOn(flag, {
      attributes: {
        id: context.subject.id,
        company: context.tenant.tenantId,
      },
    });
  }
}
```

**Test file**: `GrowthBookFeatureFlagService.test.ts`

Rewrite the mock to target `GrowthBookClient` instead of `GrowthBook`. The mock needs `init` (returns Promise) and `isOn` (returns boolean). Remove `setAttributes`. Verify `isOn` is called with the correct `flag` and `attributes`.

Key test assertions:

- `mockClient.init` called with `{ timeout: 2000 }`
- `mockClient.isOn` called with `(flag, { attributes: { id, company } })`
- Returns `false` when `isOn` returns `false`
- Returns `true` when `isOn` returns `true`
- Uses distinct `clientKey` per test to avoid `clientCache` cross-contamination (same pattern as existing tests)

The comment explaining why MSW is kept in `__mocks__/handlers.ts` should be updated to reference `GrowthBookClient` instead of the old module singleton issue.

---

### Step R2 — CRIT-02: Add `/feature-flags-demo` to `PUBLIC_ROUTE_PREFIXES`

**File**: `src/security/middleware/route-policy.ts`

**What changes**: Add `'/feature-flags-demo'` to the `PUBLIC_ROUTE_PREFIXES` array.

```typescript
export const PUBLIC_ROUTE_PREFIXES = [
  '/',
  '/waitlist',
  '/env-summary',
  '/security-showcase',
  '/sentry-example-page',
  '/monitoring',
  '/feature-flags-demo', // ← add this
  '/api/security-test/ssrf',
  '/api/logs',
] as const;
```

No existing tests cover this file's array contents. The E2E spec `e2e/feature-flags-demo.spec.ts` is the validation for this change.

---

### Step R3 — MAJ-01 + MAJ-02: Path confinement for flag scripts

**File**: `scripts/flags/utils.ts`

Add `assertPathWithinBase()` function and `import path from 'node:path'` at the top. This is the canonical CWE-22 guard from AGENTS.md:

```typescript
import path from 'node:path';

export function assertPathWithinBase(
  resolvedPath: string,
  baseDir: string,
): void {
  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(resolvedPath);
  const expectedPrefix = normalizedBase.endsWith(path.sep)
    ? normalizedBase
    : normalizedBase + path.sep;
  if (
    normalizedPath !== normalizedBase &&
    !normalizedPath.startsWith(expectedPrefix)
  ) {
    throw new Error(
      `Security: file path escapes the allowed directory.\n` +
        `  Allowed base : ${normalizedBase}\n` +
        `  Resolved path: ${normalizedPath}\n`,
    );
  }
}
```

**File**: `scripts/flags/export.ts`

Import `assertPathWithinBase` and `path` from `node:path`. Add confinement check before `fs.writeFileSync`:

```typescript
import path from 'node:path';
// ...existing imports...
import {
  assertPathWithinBase,
  parseArg,
  resolveDriver,
  resolveProvider,
} from './utils';

// In run():
if (outFile) {
  const resolved = path.resolve(outFile);
  assertPathWithinBase(resolved, process.cwd());
  fs.writeFileSync(resolved, json, 'utf8');
  console.error(`[flags:export] Written to ${resolved}`);
}
```

**File**: `scripts/flags/import.ts`

Import `assertPathWithinBase` and `path`. Add confinement check in `readInput` before `fs.readFileSync`:

```typescript
import path from 'node:path';
// ...existing imports...
import {
  assertPathWithinBase,
  isSchemaNotFoundError,
  parseArg,
  resolveDriver,
  resolveProvider,
} from './utils';

function readInput(filePath: string | undefined): FlagsFile {
  let raw: string;
  if (filePath) {
    const resolved = path.resolve(filePath);
    assertPathWithinBase(resolved, process.cwd());
    raw = fs.readFileSync(resolved, 'utf8');
  } else {
    raw = fs.readFileSync('/dev/stdin', 'utf8');
  }
  return JSON.parse(raw) as FlagsFile;
}
```

**Test file**: `scripts/flags/utils.test.ts`

Add tests for `assertPathWithinBase`:

```typescript
describe('assertPathWithinBase', () => {
  it('does not throw for a path within the base', () => {
    const base = process.cwd();
    expect(() =>
      assertPathWithinBase(path.join(base, 'flags.json'), base),
    ).not.toThrow();
  });

  it('does not throw when path equals base', () => {
    const base = process.cwd();
    expect(() => assertPathWithinBase(base, base)).not.toThrow();
  });

  it('throws for a path traversal attempt', () => {
    const base = process.cwd();
    expect(() =>
      assertPathWithinBase(path.join(base, '..', 'outside.json'), base),
    ).toThrow(/Security: file path escapes/);
  });

  it('throws for an absolute path outside the base', () => {
    const base = process.cwd();
    expect(() => assertPathWithinBase('/etc/passwd', base)).toThrow(
      /Security: file path escapes/,
    );
  });
});
```

Add `import path from 'node:path'` and `import { assertPathWithinBase } from './utils'` to the test file.

---

### Step R4 — MAJ-03 + MIN-01: Factory — API host validation + replace `console.warn`

**File**: `src/modules/feature-flags/factory.ts`

Two changes in one file:

**MAJ-03**: Add `assertSafeGrowthBookApiHost()` function at the top of the file. Call it in the `growthbook` case before constructing `GrowthBookFeatureFlagService`.

**MIN-01**: Add module-level logger (same pattern as `ResilientFeatureFlagService`). Replace `console.warn` in the `default` case with `logger.warn`.

```typescript
import { resolveServerLogger } from '@/core/logger/di';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';
import type { DrizzleDb } from '@/core/db';

import { DrizzleFeatureFlagService } from './infrastructure/drizzle/DrizzleFeatureFlagService';
import { GrowthBookFeatureFlagService } from './infrastructure/growthbook/GrowthBookFeatureFlagService';
import { ResilientFeatureFlagService } from './infrastructure/resilient/ResilientFeatureFlagService';
import {
  StaticFeatureFlagService,
  parseStaticFlagsEnv,
} from './infrastructure/static/StaticFeatureFlagService';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'flags',
  module: 'feature-flags',
});

function assertSafeGrowthBookApiHost(apiHost: string): void {
  let parsed: URL;
  try {
    parsed = new URL(apiHost);
  } catch {
    throw new Error(`[feature-flags] Invalid GROWTHBOOK_API_HOST: "${apiHost}"`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `[feature-flags] GROWTHBOOK_API_HOST must use https: protocol. Received: "${parsed.protocol}"`,
    );
  }
}

// ... rest unchanged except:

    case 'growthbook': {
      if (!opts.growthbookClientKey) {
        throw new Error('[feature-flags] FEATURE_FLAG_PROVIDER=growthbook requires GROWTHBOOK_CLIENT_KEY to be set.');
      }
      const apiHost = opts.growthbookApiHost ?? 'https://cdn.growthbook.io';
      assertSafeGrowthBookApiHost(apiHost);
      return new GrowthBookFeatureFlagService({ clientKey: opts.growthbookClientKey, apiHost });
    }

    default: {
      logger.warn(
        { event: 'feature-flag:unknown-provider' },
        '[feature-flags] Unknown FEATURE_FLAG_PROVIDER value. Falling back to static (all flags off).',
      );
      return new StaticFeatureFlagService({});
    }
```

**Test file**: `factory.test.ts`

Three additions:

1. The existing test `'falls back to static (all off) for unknown provider values'` uses `vi.spyOn(console, 'warn')`. Update to use `mockLogger.warn` instead:

```typescript
it('falls back to static (all off) for unknown provider values', () => {
  const svc = createFeatureFlagService('unknown' as 'static', {});
  expect(svc).toBeInstanceOf(ResilientFeatureFlagService);
  expect(mockLogger.warn).toHaveBeenCalledWith(
    expect.objectContaining({ event: 'feature-flag:unknown-provider' }),
    expect.any(String),
  );
});
```

2. Add test for non-https protocol rejection:

```typescript
it('throws when GROWTHBOOK_API_HOST uses http: protocol', () => {
  expect(() =>
    createFeatureFlagService('growthbook', {
      growthbookClientKey: 'sdk-key',
      growthbookApiHost: 'http://cdn.growthbook.io',
    }),
  ).toThrow(/must use https: protocol/);
});
```

3. Add test confirming on-prem https host is accepted:

```typescript
it('accepts an on-prem https host for GrowthBook', () => {
  expect(() =>
    createFeatureFlagService('growthbook', {
      growthbookClientKey: 'sdk-key',
      growthbookApiHost: 'https://growthbook.mycompany.com',
    }),
  ).not.toThrow();
});
```

---

### Step R5 — MAJ-04: Sanitize error in `ResilientFeatureFlagService`

**File**: `src/modules/feature-flags/infrastructure/resilient/ResilientFeatureFlagService.ts`

Replace the `error` field in the `logger.warn` call with sanitized fields:

```typescript
    } catch (error) {
      logger.warn(
        {
          event: 'feature-flag:evaluation-error',
          flag,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        'Feature flag evaluation failed; defaulting to false (fail-safe)',
      );
      return false;
    }
```

**Test file**: `ResilientFeatureFlagService.test.ts`

Update the last test `'includes the thrown error in the warning log'`:

```typescript
it('logs errorMessage and errorName (not the raw error object) when delegate throws', async () => {
  const error = new Error('connection refused');
  const svc = new ResilientFeatureFlagService(makeDelegate(error));

  await svc.isEnabled('any-flag', ctx);

  expect(mockLogger.warn).toHaveBeenCalledWith(
    expect.objectContaining({
      errorMessage: 'connection refused',
      errorName: 'Error',
    }),
    expect.any(String),
  );
});
```

Note: rename the test description to reflect what it now verifies. The old description `'includes the thrown error in the warning log'` was accurate for the old assertion; the new description makes it explicit that the raw `error` object is NOT logged.

---

### Step R6 — Validation

Run all quality gates in order:

```shell
pnpm lint --fix
pnpm typecheck
pnpm test
```

All must pass. Expected: all existing tests pass, new tests for `assertPathWithinBase`, `assertSafeGrowthBookApiHost`, updated GrowthBook tests, updated resilient service test, and updated factory test all pass.

---

## 5. Risks

| Risk                                                 | Assessment                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GrowthBookClient` API compatibility                 | Confirmed: `GrowthBookClient` exported from `@growthbook/growthbook` v1.6.5 at main entry. `isOn(key, userContext)` matches the usage pattern.        |
| Module-level `clientCache` persistence               | Intentionally safe — `GrowthBookClient` instances hold only feature definitions (immutable after init), not user state.                               |
| Test isolation between `GrowthBookClient` mock tests | Handled: each test uses a unique `clientKey` to get a separate `clientCache` entry, matching the existing test pattern.                               |
| `factory.test.ts` update for `console.warn` → logger | The logger mock is already set up in `factory.test.ts`. The change is a straightforward spy swap.                                                     |
| E2E test for CRIT-02                                 | The E2E spec is written and typechecked. After CRIT-02 is deployed, it must be run against a real server to confirm the route is publicly accessible. |

---

## 6. Recommended Next Action

Spawn Implementation Agent with this summary as the primary input. Steps R1–R5 are independent and can be executed in parallel. Step R6 (validation) must run after all implementation steps complete.

No further architectural questions are open. No further specialist review is needed before implementation.

---

## Phase 2 — GrowthBook Stale Feature Cache: Architectural Decision

**Date**: 2026-04-02
**Trigger**: Debug Investigation confirmed that `GrowthBookClient._features` is frozen at server startup because `subscribe(instance)` is never called — meaning background HTTP refreshes and SSE pushes cannot propagate to the cached client.

---

### 1. Objective

Determine the correct fix for `GrowthBookFeatureFlagService`: which refresh mechanism is architecturally sound, which is not, and what the constraints are.

---

### 2. Current-State Findings

**Root cause** (confirmed from SDK source):

`init({ timeout: 2000 })` calls `startStreaming(this, { timeout: 2000 })`. Inside `startStreaming`, the check `if (options.streaming)` evaluates to `false` (option is `undefined`). Therefore `subscribe(instance)` is never called. The `GrowthBookClient` instance is never added to `subscribedInstances`.

When the SDK background HTTP refresh fires (every 60s via `staleTTL`), it calls `onNewFeatureData → subscribedInstances.forEach(refreshInstance)`. Since our instance is absent, `refreshInstance` (which calls `setPayload` to update `_features`) is never called. `this._features` remains permanently frozen at the snapshot taken during the first `init()` call.

**Force rules and targeting rules** added in GrowthBook after server startup are silently ignored.

**`refreshFeatures()` behaviour** (confirmed from SDK source):

```javascript
async refreshFeatures(options) {
  const res = await this._refresh({ ...(options || {}), allowStale: false });
  if (res.data) {
    await this.setPayload(res.data);  // ← directly updates this._features
  }
}
```

`refreshFeatures()` with `allowStale: false` returns data from the SDK module-level cache if fresh (< 60s), or makes an HTTP call if stale. After either path it calls `setPayload` directly on the instance — bypassing the subscription mechanism entirely.

**SSE activation** (confirmed from SDK source):

SSE is activated by `startAutoRefresh(instance)` which is called from `fetchFeatures` after every successful HTTP response from GrowthBook. `startAutoRefresh` opens an SSE connection **only if** all three conditions are true:

1. `cacheSettings.backgroundSync` is true (SDK default: true)
2. `supportsSSE.has(key)` — set only when GrowthBook server responds with `x-sse-support: enabled`
3. `polyfills.EventSource` is defined — on Node.js 24, `globalThis.EventSource` is natively available, so this is true

**Critical finding**: SSE activation is driven by the GrowthBook **server's response header**, not by the `streaming: true` client option. `streaming: true` only controls `subscribe(instance)`. Both candidate fix options (Option A and Option F) trigger `fetchFeatures` at least once, meaning SSE activates in both options if the GrowthBook server supports it. SSE exposure is equal across both options.

---

### 3. Trust Boundary Assessment

The module-level `clientCache` is the correct pattern: caching `GrowthBookClient` avoids repeated HTTP calls on every flag evaluation. The flaw is that the cached instance has no update pathway once `init()` completes.

The SDK's intended contract is:

- `streaming: true` → subscribe instance → receive background HTTP refresh pushes (60s cycle) and SSE real-time pushes
- Without `streaming: true` → call `refreshFeatures()` manually to update `this._features`

Both contracts are SDK-supported and architecturally sound. The question is which one fits this repository's runtime model.

---

### 4. Architectural Assessment

#### Option A — `streaming: true` in `init()` (APPROVED — preferred)

```typescript
const ready = client
  .init({ timeout: 2000, streaming: true })
  .then(() => undefined);
```

**What this does**:

- Calls `subscribe(instance)` → instance enters `subscribedInstances`
- When the SDK background HTTP refresh fires (60s TTL expiry), `onNewFeatureData` → `refreshInstance(instance, data)` → `setPayload` → `this._features` updated
- If SSE activates (server sends `x-sse-support: enabled`), SSE push events also update `this._features` in real-time via the same subscription path

**Why this is correct**:

- This is the SDK's own design intent for a long-lived cached client that needs to stay current
- Minimum change: 1 option field added to an existing call
- No custom TTL management code in the adapter
- No additional state (`lastRefreshed`) in `ClientEntry`
- Feature updates are received both on the SDK's 60s polling cycle and (if SSE available) in real-time
- SSE concern is not an argument against this option — SSE would have activated anyway on the first `fetchFeatures` call (both options) if the server supports it; the difference is only whether our instance receives the SSE push update

**SSE in Node.js 24 + persistent server**: acceptable. The SSE connection is a single outbound long-lived connection per `clientKey`. It is low-bandwidth (push-based, idle most of the time), and standard for feature flag systems. The SDK manages reconnection.

**SSE in Vercel serverless (warm reuse)**: warm instances reuse module-level state; the SSE connection persists for the lifetime of the warm instance. When the instance is recycled, the connection closes. No memory leak — the SDK does not accumulate connections. Acceptable.

**Test update required**: Mock must include `init` called with `{ timeout: 2000, streaming: true }`.

#### Option F — Explicit `refreshFeatures()` with `lastRefreshed` TTL tracking (NOT APPROVED)

```typescript
interface ClientEntry {
  client: GrowthBookClient;
  ready: Promise<void>;
  lastRefreshed: number;
}
```

With an explicit check before each `isEnabled()` call: if `now - lastRefreshed > REFRESH_INTERVAL_MS`, call `await client.refreshFeatures()`.

**Why this is rejected**:

1. **SSE exposure is identical**: SSE still activates on the first `fetchFeatures` call (same as Option A). SSE pushes update the SDK module-level `cache` Map but NOT our `this._features` (no subscription). Only when our explicit `refreshFeatures()` fires does `this._features` update. We get the SSE side effects of Option A without its benefits.

2. **Weaker update model**: Force rules and targeting changes take up to `REFRESH_INTERVAL_MS` (60s if matching SDK TTL) to appear. Option A delivers changes as soon as the 60s background refresh fires or immediately via SSE. Option F cannot do better than the SDK's own polling cycle without adding more complexity.

3. **Added complexity**: `ClientEntry` grows a `lastRefreshed` field. The TTL constant (`REFRESH_INTERVAL_MS`) is a new magic number in the adapter with no obvious contract. This duplicates logic that the SDK already owns.

4. **Concurrent refresh race**: Without a `refreshing: Promise<void> | null` guard, two concurrent requests past the TTL both call `refreshFeatures()`. The SDK deduplicates the HTTP call via `activeFetches`, but both await the same async `setPayload` path. This is safe but requires understanding SDK internals to reason about.

5. **No gain over Option A**: In any scenario where Option F would return a different result than Option A, Option A is the correct one (fresh features). Option F only approximates the behavior Option A gives natively.

#### Option C — `setInterval` at module level (REJECTED — stated explicitly)

Not appropriate for Next.js 16 App Router server components. Module-level `setInterval` in server-side code has unreliable lifetime under the App Router module evaluation model and would prevent clean process shutdown. Explicitly excluded.

---

### 5. Docs vs Code Drift

None. The existing `01 - Architecture Guard - Summary.md` did not address the refresh/subscription mechanism because the stale-cache bug was discovered after the original security audit. This section is the authoritative extension.

The `06 - Debug Investigation - Summary.md` proposed Option A as the minimum safe fix and flagged Option F as a viable alternative. The architectural assessment here confirms Option A and rejects Option F.

---

### 6. Risks

| Risk                                                       | Assessment                                                                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `streaming: true` opens SSE connection on GrowthBook Cloud | Real, but identical risk exists in Option F. Acceptable for both persistent and warm-serverless runtimes.                                    |
| Background HTTP refresh may fire mid-request               | `setPayload` is idempotent and safe to call concurrently. Subsequent `isOn()` calls read the updated `_features`. Timing risk is negligible. |
| Test assertion must include `streaming: true`              | Low risk. Test mock is straightforward to update.                                                                                            |
| Reverting this change would re-introduce stale cache       | The change is 1 option field. If reverted, restart the server to clear `clientCache`. Acceptable rollback.                                   |

---

### 7. Binding Decision

**`streaming: true` MUST be added to `client.init()` in `GrowthBookFeatureFlagService.ts`.**

The corrected implementation is:

```typescript
const ready = client
  .init({ timeout: 2000, streaming: true })
  .then(() => undefined);
```

No other changes to `GrowthBookFeatureFlagService.ts` are required.

**Option F (explicit `refreshFeatures()` with TTL tracking) is NOT approved.** It introduces adapter complexity that duplicates SDK functionality, delivers a weaker update model, and does not reduce SSE exposure compared to Option A.

**Option C (`setInterval`) is NOT approved.** Incompatible with Next.js App Router module lifecycle.

---

### 8. Required Implementation Actions

| Step   | File                                                                                       | Change                                                                       |
| ------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Fix-01 | `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts`      | Add `streaming: true` to `client.init({ timeout: 2000, streaming: true })`   |
| Fix-02 | `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.test.ts` | Update `init` mock assertion to include `{ timeout: 2000, streaming: true }` |

Run `pnpm lint --fix && pnpm typecheck && pnpm test` after both changes to confirm.

No module boundaries change. No contract signatures change. No new dependencies. Blast radius: 2 files.
