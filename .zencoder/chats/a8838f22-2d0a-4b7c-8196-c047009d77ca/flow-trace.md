# Flow Trace Investigation

**Task ID**: 43 (Leantime)
**Step**: Flow Trace Investigation
**Date**: 2026-04-12
**Status**: complete

---

## Execution Path — Current (Broken on Vercel)

### Path A: Server-Side APM Bootstrap

```text
Vercel cold start
  └─ Next.js 16 bootstrap
       └─ src/instrumentation.ts → register()
            └─ process.env.NEXT_RUNTIME === 'nodejs'
                 └─ src/monitoring/server-init.ts → initializeServerObservability()
                      ├─ Checks NEW_RELIC_ENABLED=true + NEW_RELIC_LICENSE_KEY
                      └─ require('newrelic')       ← LATE LOAD — agent misses bootstrap
                           ├─ Logs: [New Relic] Server init loaded connected=false
                           └─ Agent starts AFTER Next.js framework patches → no HTTP instrumentation
```

**Divergence Point**: `require('newrelic')` in `instrumentation.ts` runs AFTER the Node.js HTTP module is already patched by Next.js. The NR agent requires `require('newrelic')` as the FIRST require in the process. On Vercel, the agent never establishes a transaction context, so `collector.isConnected()` remains false.

**Evidence**: `[NR Browser] Empty script loaded=true connected=false tx=false appId=false` in Vercel function logs

---

### Path B: Browser Script Delivery (Empty on Vercel)

```text
Browser request to page
  └─ layout.tsx renders <Script src="/observability/new-relic-browser.js" />
       └─ Browser requests /observability/new-relic-browser.js
            └─ route.ts → GET()
                 └─ await connection()
                      └─ getBrowserAgentScriptSafe()
                           └─ getBrowserTimingHeaderSafe()
                                └─ nr.agent?.collector?.isConnected()  → FALSE (agent not connected)
                                     └─ Returns ''
                                          └─ route returns empty 200 response
```

**Divergence Point**: `isConnected()` is false because the APM agent was never properly bootstrapped (Path A failed). The browser script is functionally dead.

---

### Path C: NODE_OPTIONS Preload Attempt (Rejected)

```text
Vercel build phase
  └─ NODE_OPTIONS=-r newrelic set as Vercel env var
       └─ vercel pull → Vercel builder bootstrap
            └─ Node.js starts with --require newrelic
                 └─ Crash: module 'newrelic' not found before node_modules installed
                      └─ Build fails
```

**Rejected**: Vercel's remote builder runs Node before `node_modules` is fully available during the build phase. The `--require` flag resolves immediately at process start, before the install step, so the module is not found.

**Note**: There is also ambiguity about whether `NODE_OPTIONS=-r newrelic` vs `NODE_OPTIONS=--require newrelic` is correct. The `-r` flag is a shorthand for `--require` in Node.js, but the Vercel env parsing may differ.

---

## Official Vercel Integration Execution Path

### Path D: Vercel Log Drain → New Relic Logs

```text
Vercel function execution
  └─ Serverless function logs to stdout
       └─ Vercel log drain (installed via NR integration)
            └─ HTTP POST → New Relic Logs API endpoint
                 └─ New Relic Logs ingests and indexes logs
                      └─ Available in NR Logs UI + NRQL queries
```

**No agent required**. No `NODE_OPTIONS`. Vercel sends logs via a webhook drain. Any `console.log/info/warn/error` output appears in New Relic Logs.

### Path E: OpenTelemetry Traces (Beta)

```text
Vercel function execution
  └─ OTel SDK instruments Next.js / Vercel functions
       └─ Traces exported to New Relic OTLP endpoint
            └─ Available in Distributed Tracing UI
```

**Status**: Beta. Requires enabling in the Vercel integration configuration UI. No code changes required in the repository for basic trace forwarding.

---

## What the Official Integration Does NOT Cover

| Capability                                   | Status                                    |
| -------------------------------------------- | ----------------------------------------- |
| APM transaction traces (New Relic format)    | ❌ Not provided — only OTel traces (Beta) |
| `getBrowserTimingHeader()` browser injection | ❌ Requires connected APM agent           |
| `nr.addCustomAttribute()`                    | ❌ Requires Node.js APM agent             |
| `nr.startSegment()` DI container spans       | ❌ Requires Node.js APM agent             |
| Log forwarding (stdout)                      | ✅ Works via log drain                    |
| Function invocation metrics                  | ✅ Via quickstart dashboard               |
| Distributed traces                           | ✅ Via OTel (Beta)                        |

---

## Identity and Tenant Context

No auth/tenant context is involved in this flow. New Relic is observability infrastructure, not a business-logic layer.

---

## Likely Divergence Points Summary

| Point                   | Root Cause                                            | Fix Direction                                                   |
| ----------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| APM agent not connected | Late `require('newrelic')` after Next.js patches HTTP | Needs preload OR acceptance that APM agent won't work on Vercel |
| Browser script empty    | APM agent not connected → `isConnected()=false`       | Remove dependency on APM agent for browser monitoring           |
| No logs in NR           | No log drain configured                               | Install official Vercel integration                             |
| No traces in NR         | No OTel configuration                                 | Enable OTel in Vercel integration (optional, Beta)              |

---

## Prior Art — Task Evidence

- `.copilot/tasks/2026-04-05-nr-browser-spa/` — browser SPA snippet rejected (88KB > 64KB limit)
- `.copilot/tasks/2026-04-08-vercel-newrelic-incident/` — `NODE_OPTIONS` preload rejected
- `docs/features/26 - New Relic Server & Browser Integration.md` — current guardrails and constraints

---

## Conclusion

The current repository is structurally incompatible with reliable NR APM on Vercel without a supported preload mechanism. The official Vercel integration (log drains) is the only approach confirmed to work without `NODE_OPTIONS`. A decision is required on whether browser monitoring should be decoupled from the APM agent or deferred.
