# Remediation Plan

**Task ID**: 43 (Leantime)
**Step**: Remediation Plan (Debug Investigation Agent)
**Date**: 2026-04-12
**Status**: USER DECISIONS INCORPORATED — AWAITING FINAL APPROVAL

---

## User Decisions Recorded

| Question                    | Decision                                                  |
| --------------------------- | --------------------------------------------------------- |
| **Q1 — Browser monitoring** | **Option B**: NR Browser standalone CDN agent             |
| **Q2 — APM on Vercel**      | **Option B**: Defer APM investigation to a follow-up task |
| **Q3 — OTel traces (Beta)** | **Yes**: Enable OTel traces, document as experimental     |

---

## Objective

Establish working New Relic telemetry for Vercel deployments using:

1. **Vercel log drain** (primary — log forwarding)
2. **NR Browser standalone CDN agent** (browser monitoring, decoupled from APM)
3. **OTel traces (Beta)** (distributed tracing via Vercel integration)

APM agent (`newrelic` npm) remains for local development only. Vercel APM investigation is deferred.

---

## Phase 1: Manual Prerequisites (User Actions — No Code)

### PR-1: Vercel Log Drain Integration

1. Go to one.newrelic.com → **Add Data** → search "Vercel"
   — OR — go to vercel.com/integrations and search "New Relic"
2. Click **Add integration**
3. Connect your Vercel account
4. Select projects: `nextjs-16-boilerplate` (all environments)
5. Allow permissions: read + write for log drains
6. Enter `NEW_RELIC_LICENSE_KEY` in the license key field
7. Click **Add Integration**

### PR-2: Enable OTel Traces (Beta)

After PR-1, in the configuration dialog:

- Go to **Traces (Beta)** section
- Toggle **ON**
- Click **Save changes**

### PR-3: Create NR Browser Application

In New Relic UI:

1. Go to one.newrelic.com → **Browser** → **Add application**
2. Select **Copy/Paste JavaScript code** method
3. Name the app (e.g., `nextjs-16-boilerplate-browser`)
4. Note down:
   - **Browser license key** (different from APM license key)
   - **Application ID** (numeric)
5. Select **SPA** agent type

### PR-4: Verify Vercel Environment Variables

In Vercel project settings → Environment Variables:

| Variable                        | Value                              | Note                            |
| ------------------------------- | ---------------------------------- | ------------------------------- |
| `NEW_RELIC_ENABLED`             | `true`                             |                                 |
| `NEW_RELIC_LICENSE_KEY`         | your APM license key               |                                 |
| `NEW_RELIC_APP_NAME`            | `nextjs-16-boilerplate`            |                                 |
| `NODE_OPTIONS`                  | **(must be blank or unset)**       | Do NOT set — causes build crash |
| `NEW_RELIC_BROWSER_LICENSE_KEY` | your browser license key from PR-3 | NEW                             |
| `NEW_RELIC_BROWSER_APP_ID`      | your browser app ID from PR-3      | NEW                             |

---

## Phase 2: Repository Changes

### Change 1 — New Env Vars Schema

**File**: `src/core/env.ts`

Add two new server-side env vars:

- `NEW_RELIC_BROWSER_LICENSE_KEY` — optional string
- `NEW_RELIC_BROWSER_APP_ID` — optional string (the numeric app ID)

These are used by the new browser script delivery approach.

### Change 2 — NR Browser Script Delivery Rework

**Files**: `src/app/observability/new-relic-browser.js/route.ts`, `src/core/observability/new-relic.ts`

**Current approach** (broken on Vercel):

- Route calls `getBrowserTimingHeaderSafe()` → `nr.getBrowserTimingHeader()` → requires connected APM agent

**New approach** (CDN-based, no agent dependency):

- Option A (fully CDN): Layout injects `<Script src="https://js-agent.newrelic.com/nr-spa.min.js" />` with NR config attributes
- Option B (route serves config): Route serves a small JS snippet that loads the CDN agent with the app ID and license key from env vars

**Recommended**: Option B (route-served config) keeps the delivery point consistent, avoids hardcoding keys in the layout, and allows `Cache-Control: no-store` to prevent stale config.

The route would serve:

```javascript
window.NREUM = {
  loader_config: {
    accountID: '...',
    trustKey: '...',
    agentID: '...',
    licenseKey: '...',
  },
  info: { beacon: 'bam.nr-data.net', licenseKey: '...', applicationID: '...' },
};
```

Then load the agent from CDN. This is the standard NR Browser copy-paste snippet format.

CSP already allows `js-agent.newrelic.com` and `bam.nr-data.net`. ✅

### Change 3 — Remove APM Agent Dependency from Browser Route

**File**: `src/core/observability/new-relic.ts`

Add a new exported function alongside `getBrowserAgentScriptSafe()`:

```typescript
export function getBrowserCdnSnippet(): string;
```

This returns the CDN-based snippet using `NEW_RELIC_BROWSER_LICENSE_KEY` and `NEW_RELIC_BROWSER_APP_ID` from env, with no NR agent dependency.

The existing `getBrowserTimingHeaderSafe()` and `getBrowserAgentScriptSafe()` remain for local APM-based dev.

### Change 4 — Suppress Noisy Vercel Warning

**File**: `src/app/observability/new-relic-browser.js/route.ts`

If `VERCEL_ENV` is set (preview or production) and the CDN path is active, remove the `[NR Browser] Empty script loaded=...` warning — it's no longer an error condition on Vercel.

### Change 5 — Update `validateNewRelicConfigValues()`

**File**: `src/core/env.ts`

Remove any `NODE_OPTIONS` requirement or check for Vercel environments. The validation should only require `NEW_RELIC_LICENSE_KEY` when `NEW_RELIC_ENABLED=true`.

### Change 6 — Documentation Update

**Files**: `docs/features/26 - New Relic Server & Browser Integration.md`, `.env.example`

- Document Vercel log drain as the primary observability path
- Document OTel traces (Beta) as experimental
- Document NR Browser CDN approach
- Document `NODE_OPTIONS` must remain blank on Vercel
- Add new env vars to `.env.example`

---

## Phase 3: Deferred

### APM Agent on Vercel (Q2 — Follow-up Task)

Potential approaches to investigate in a separate task:

- `@vercel/otel` combined with NR OTLP endpoint (as an APM proxy)
- Vercel's native Next.js instrumentation hooks
- NR's official `@newrelic/next` package (if available)

This does not block the current plan.

---

## Verification After Phase 2

1. Deploy to Vercel preview
2. **Logs**: one.newrelic.com → Logs → `FROM Log WHERE project_name = 'nextjs-16-boilerplate'`
3. **Browser**: one.newrelic.com → Browser → select your browser app → verify PageViews
4. **Traces**: one.newrelic.com → Distributed Tracing → filter by Vercel service
5. **Quickstart dashboard**: one.newrelic.com → Dashboards → Vercel

---

## Risk Assessment

| Risk                                    | Likelihood | Impact | Mitigation                                               |
| --------------------------------------- | ---------- | ------ | -------------------------------------------------------- |
| Browser CDN agent blocked by CSP        | Low        | Medium | CSP already allows `js-agent.newrelic.com`               |
| OTel Beta instability                   | Medium     | Low    | Document as experimental; doesn't affect logs or browser |
| Log drain latency                       | Certain    | Low    | Document 5-15 min ingestion delay                        |
| `VERCEL_ENV` not available during build | Low        | Low    | Check at runtime, not build                              |
| Free tier data ingest                   | Very Low   | None   | ~110MB/month at 1k req/day vs 100GB limit                |

---

## ⚠️ AWAITING USER APPROVAL TO PROCEED TO IMPLEMENTATION

Validation Strategy and Implementation steps are blocked until this plan is approved.
