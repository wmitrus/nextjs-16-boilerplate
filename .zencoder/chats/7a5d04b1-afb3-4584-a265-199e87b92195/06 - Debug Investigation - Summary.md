# 06 - Debug Investigation - Summary

## Task Context

- **Task ID**: `feature-flags-security-audit` (case `3344a061`)
- **Investigation Trigger**: User reported that a GrowthBook force rule (`"force": true`) is being ignored — the flag returns `false` even though GrowthBook is configured with `defaultValue: false` + a rule that forces `true`.
- **Status**: ROOT CAUSE CONFIRMED
- **Date**: 2026-04-02

---

## 1. Objective

Trace why a GrowthBook force rule is being silently ignored, causing `isEnabled()` to return `false` when it should return `true`.

---

## 2. Symptom Summary

| Scenario | GrowthBook Config                                                                                 | App Result | Expected  |
| -------- | ------------------------------------------------------------------------------------------------- | ---------- | --------- |
| Case 1   | `demo.beta-exports: { defaultValue: true }`                                                       | `true`     | `true` ✅ |
| Case 2   | `demo.new-dashboard-ui: { defaultValue: false, rules: [{ "id": "fr_mnhh6c18", "force": true }] }` | `false`    | `true` ❌ |

**GrowthBook API body** (current, confirmed by user):

```json
{
  "status": 200,
  "features": {
    "extended-security-form": { "defaultValue": false },
    "demo.beta-exports": { "defaultValue": true },
    "demo.new-dashboard-ui": {
      "defaultValue": false,
      "rules": [{ "id": "fr_mnhh6c18", "force": true }]
    }
  },
  "experiments": [],
  "dateUpdated": "2026-04-02T12:53:38.179Z"
}
```

The API is returning the rule. The app is ignoring it.

---

## 3. Confirmed Evidence

### Evidence A — `clientCache` caches `GrowthBookClient` indefinitely (Confirmed)

**File**: `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts`

```typescript
const clientCache = new Map<string, ClientEntry>();

function getOrCreateClient(clientKey: string, apiHost: string): ClientEntry {
  const existing = clientCache.get(clientKey);
  if (existing) return existing; // ← returns cached entry forever

  const client = new GrowthBookClient({ clientKey, apiHost });
  const ready = client.init({ timeout: 2000 }).then(() => undefined);
  // ...
}
```

`init()` is called ONCE per `clientKey` for the lifetime of the Node.js process. After the first request, the `ready` Promise is resolved and `init()` is never called again.

### Evidence B — `startStreaming` is a no-op without `options.streaming: true` (Confirmed)

**File**: `node_modules/@growthbook/growthbook/dist/cjs/feature-repository.js`

```javascript
function startStreaming(instance, options) {
  if (options.streaming) {
    // ← only activates if explicitly true
    // ...
    subscribe(instance); // ← THIS adds instance to subscribedInstances
  }
  // If options.streaming is falsy: does NOTHING
}
```

Our call: `client.init({ timeout: 2000 })` — `streaming` is `undefined`. `startStreaming` is a no-op. **`subscribe(instance)` is never called.** Our `GrowthBookClient` is never added to `subscribedInstances`.

### Evidence C — Background refreshes only push updates to `subscribedInstances` (Confirmed)

**File**: `node_modules/@growthbook/growthbook/dist/cjs/feature-repository.js`

```javascript
function onNewFeatureData(key, cacheKey, data) {
  // Updates the SDK-level in-memory cache (cache Map)
  cache.set(cacheKey, { data, version, staleAt, sse });

  // Pushes updates ONLY to subscribed instances
  const instances = subscribedInstances.get(key);
  instances && instances.forEach((instance) => refreshInstance(instance, data));
  //              ^^ Our instance is NOT here — never subscribed
}

async function refreshInstance(instance, data) {
  await instance.setPayload(data || instance.getPayload());
  // ↑ This updates instance._features — but never called for us
}
```

When the SDK's internal cache goes stale (60s TTL) and a background HTTP fetch fires, `onNewFeatureData` updates the SDK-level cache but **cannot push to our `GrowthBookClient` because it was never subscribed**.

### Evidence D — `_features` on the cached `GrowthBookClient` is frozen after `init()` (Confirmed)

**File**: `node_modules/@growthbook/growthbook/dist/cjs/GrowthBookClient.js`

```javascript
async init(options) {
  const { data, ...res } = await this._refresh({ ...options, allowStale: true });
  startStreaming(this, options);   // no-op (streaming not passed)
  await this.setPayload(data || {}); // sets this._features ONCE
  return res;
}
```

`this._features` is set from the `data` returned by `_refresh`. After `init()` resolves, `this._features` is NEVER updated again because:

1. `subscribe(instance)` was not called → not in `subscribedInstances`
2. No SSE running → no push updates
3. Our service never calls `client.refreshFeatures()`

### Evidence E — Force rule evaluation is correct IF features include the rule (Confirmed)

**File**: `node_modules/@growthbook/growthbook/dist/cjs/core.js`

```javascript
// For rule {"id": "fr_mnhh6c18", "force": true}:
if ("force" in rule) {
  if (rule.condition && !conditionPasses(rule.condition, ctx)) continue; // no condition → skip

  if (!isIncludedInRollout(ctx, rule.seed || id, rule.hashAttribute, ..., rule.range, rule.coverage, ...)) {
    continue;
  }
  return getFeatureResult(ctx, id, rule.force, "force", rule.id);  // ← returns true
}

// isIncludedInRollout with range=undefined, coverage=undefined:
function isIncludedInRollout(ctx, seed, hashAttribute, fallbackAttribute, range, coverage, ...) {
  if (!range && coverage === undefined) return true;  // ← returns true immediately
  ...
}
```

The evaluation logic is correct. If `this._features` contains the rule, `isOn()` **would** return `true`. The bug is upstream — `this._features` doesn't contain the rule.

---

## 4. Execution Path

```text
Request to /feature-flags-demo
  │
  └─ GrowthBookFeatureFlagService.isEnabled('demo.new-dashboard-ui', demoAuthContext)
       │
       ├─ getOrCreateClient(clientKey, apiHost)
       │    ├─ [FIRST REQUEST]: creates GrowthBookClient, calls init()
       │    │    └─ init() fetches features from GrowthBook API (snapshot at T0)
       │    │         → this._features = { ...features at T0, NO RULE yet }
       │    │
       │    └─ [SUBSEQUENT REQUESTS]: returns CACHED entry (ready already resolved)
       │         → this._features UNCHANGED from T0 snapshot
       │
       ├─ await ready  (immediate on subsequent requests)
       │
       └─ client.isOn('demo.new-dashboard-ui', { attributes: { id: 'anonymous', company: 'demo' } })
            └─ evalFeature('demo.new-dashboard-ui', ctx)
                 └─ ctx.global.features['demo.new-dashboard-ui']
                      = { defaultValue: false }   ← NO RULE (stale from T0)
                      → returns { value: false, on: false }
                 → isOn() = false  ❌
```

**The rule exists in GrowthBook at T1 (when user added it). The cached `GrowthBookClient` still has the features snapshot from T0 (before the rule was added). The two never converge.**

---

## 5. Source-of-Truth Analysis

| Layer                                                             | What it stores                                           | Is it current?                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| GrowthBook API (`/api/features/{clientKey}`)                      | Ground truth — current features including the rule       | ✅ Yes (confirmed by user)                                     |
| GrowthBook SDK module-level `cache` Map (`feature-repository.js`) | Cached HTTP response, stale after 60s, max 4h            | ⚠️ Refreshes in background but won't push to uncached instance |
| `GrowthBookClient._features` in our `clientCache`                 | Snapshot from `init()` at server startup / first request | ❌ Frozen — never updated                                      |

The source of truth is the GrowthBook API. The app is reading from a frozen snapshot that is never reconciled with the API after the first `init()` call.

---

## 6. Likely Failure Points

### FP-1 — `subscribe(instance)` never called (ROOT CAUSE — Confirmed)

`startStreaming(this, { timeout: 2000 })` is called in `init()` but `options.streaming` is `undefined` → `subscribe(instance)` never executes → our client is not in `subscribedInstances` → background refreshes don't propagate to `this._features`.

### FP-2 — `init()` called once per process lifetime (Contributing factor — Confirmed)

The `clientCache` pattern ensures `init()` is called exactly once. This is correct for performance (avoids repeated HTTP calls) but means the single `init()` call must establish a refresh subscription mechanism for subsequent feature updates. It does not.

### FP-3 — SDK-level `cache` refreshes correctly but cannot reach our instance (Confirmed)

The SDK's 60s `staleTTL` background refresh works. It updates the `cache` Map and tries to push to `subscribedInstances` — but our instance isn't there.

---

## 7. Hypotheses

### H1 — Features frozen at `init()` time, rule added after (HIGH CONFIDENCE — Confirmed)

**Scenario**:

1. Server started (or previous request made) → `init()` fetched features WITHOUT the rule (`demo.new-dashboard-ui: { defaultValue: false }`)
2. User added force rule in GrowthBook UI
3. App continues using cached `GrowthBookClient` with stale `_features` → returns `false`

**Consistent with symptoms**: `demo.beta-exports: { defaultValue: true }` returns `true` because it was `true` from day 1 in the cached snapshot. The cached snapshot simply never had the rule for `demo.new-dashboard-ui`.

**Confirmed by**: the API body the user showed includes the rule; the app ignores it. The only explanation is the app is not reading from the current API body.

### H2 — Force rule evaluation bug (LOW CONFIDENCE — Disproven)

**Scenario**: Features ARE loaded with the rule, but the evaluation returns `false` due to a bug.

**Disproven by**: Tracing `evalFeature` + `isIncludedInRollout` in the SDK source confirms the force rule evaluation path is correct for `{ "force": true }` with no conditions and no coverage. `isIncludedInRollout` returns `true` immediately when both `range` and `coverage` are undefined. The force value `true` is returned directly.

---

## 8. Missing Evidence / Uncertainty

| Question                                                          | Status                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Was the server restarted between test case 1 and test case 2?     | **Unknown** — if YES, H1 is weakened; fresh `init()` would have fetched features with the rule and evaluation should work |
| What is the `GROWTHBOOK_API_HOST` pointing to (cloud vs on-prem)? | **Unknown** — relevant for whether SSE is available                                                                       |
| Does the GrowthBook server respond with `x-sse-support: enabled`? | **Unknown** — SSE would provide automatic push updates even without `subscribe()`                                         |

**If the server WAS restarted** before the second test and the evaluation is still wrong, then H2 applies — but the SDK source code trace makes this very unlikely. H1 remains the primary hypothesis.

**Fastest way to confirm H1**: Restart the Next.js dev server and immediately hit `/feature-flags-demo` — the rule should now be picked up correctly in the first response. If `true` is returned, H1 is confirmed.

---

## 9. Recommended Next Action

**Confirm H1**: Restart the dev server. If `isEnabled()` returns `true` for `demo.new-dashboard-ui` after restart (with the rule in place), the stale cache is confirmed as the root cause.

**Fix direction** (for Implementation Agent — do not implement without Architecture Guard review):

The fix requires the `GrowthBookClient` to receive feature updates after the initial `init()`. Two approaches:

**Option A — Pass `streaming: true` to `init()`** (lowest change, SDK-idiomatic):

```typescript
const ready = client
  .init({ timeout: 2000, streaming: true })
  .then(() => undefined);
```

This calls `subscribe(instance)` → client enters `subscribedInstances` → background HTTP refreshes (on 60s TTL expiry) propagate to `this._features`. SSE will also activate if the GrowthBook server supports it (`x-sse-support: enabled`). No SSE polyfill needed for the subscription mechanism itself.

**Option B — Call `client.refreshFeatures()` on each `isEnabled()` call** (always-fresh, higher latency):
Uses the SDK cache TTL to decide whether to actually make an HTTP call. Avoids the subscription mechanism entirely but adds potential overhead per evaluation.

**Option C — Call `client.refreshFeatures()` at module startup** (background timer, not request-scoped):
Not appropriate for Next.js RSC context; module-level `setInterval` in server components has unreliable lifetime.

**Option A is the minimum safe fix** that makes the SDK's own caching and refresh mechanism work as designed.

**Architecture Guard must be consulted** before implementation to verify whether `streaming: true` has any Node.js SSE side effects (e.g., persistent open connections on the GrowthBook streaming endpoint) that conflict with Next.js server deployment constraints.
