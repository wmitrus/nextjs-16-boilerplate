# Flow Trace Investigation

**Step**: Flow Trace
**Agent**: Debug Investigation Agent
**Date**: 2026-04-16
**Status**: complete

---

## Execution Path — Local Dev (CDN Mode)

```text
RootLayout()
  └─ getNrBrowserCdnConfig()                           [new-relic-browser.ts:19]
       ├─ env.NEW_RELIC_BROWSER_ENABLED → true
       ├─ env.NEW_RELIC_BROWSER_LICENSE_KEY → set
       ├─ env.NEW_RELIC_BROWSER_APP_ID → set
       ├─ env.NEW_RELIC_BROWSER_AGENT_URL → versioned URL (set)
       ├─ env.NEW_RELIC_BROWSER_BEACON → undefined (NOT SET)
       │    └─ fallback: 'bam.eu01.nr-data.net'        ← EU BEACON (WRONG for US account)
       └─ returns NrBrowserCdnConfig { ..., beacon: 'bam.eu01.nr-data.net' }

layout.tsx HTML output:
  <head>
    <script id="nr-browser-cdn-config" strategy="beforeInteractive">
      window.NREUM||(NREUM={});
      NREUM.init={distributed_tracing:{enabled:true}, ...};
      NREUM.loader_config={accountID:"6443682", trustKey:"6443682", ...};
      NREUM.info={
        beacon:"bam.eu01.nr-data.net",         ← WRONG (EU endpoint for US account)
        errorBeacon:"bam.eu01.nr-data.net",    ← WRONG
        licenseKey:"...",
        applicationID:"...",
        sa:1
      };
    </script>
    <script id="nr-browser-cdn" src="https://js-agent.newrelic.com/nr-spa-1.312.1.min.js" />
  </head>

Browser execution:
  1. NR SPA agent loads (beforeInteractive — correct timing) ✓
  2. Agent reads NREUM.info.beacon → "bam.eu01.nr-data.net"
  3. Agent sends PageView harvest to https://bam.eu01.nr-data.net/...
  4. EU endpoint receives request for US account 6443682
  5. EU endpoint: account not found / rejects → data silently discarded
  6. NR Browser app shows 0 events ← ROOT CAUSE 1
```

---

## Execution Path — Vercel (CDN Mode)

```text
Vercel Build Step:
  RootLayout() prerendered at build time
  └─ getNrBrowserCdnConfig()
       ├─ env.NEW_RELIC_BROWSER_ENABLED → depends on Vercel project settings
       ├─ If NOT configured on Vercel → returns null
       │    └─ No <script> tags in prerendered HTML
       │    └─ Zero NR browser monitoring ← ROOT CAUSE 2 (if env vars absent)
       └─ If configured → same EU beacon issue as local (ROOT CAUSE 1)

Browser execution (if env vars are set on Vercel):
  Same EU beacon mis-routing as local path above.
```

---

## State Transitions

| State           | Trigger                                                  | Result                              |
| --------------- | -------------------------------------------------------- | ----------------------------------- |
| Layout renders  | Per-request (local dev) or at build time (Vercel PPR)    | `getNrBrowserCdnConfig()` called    |
| Beacon resolved | `env.NEW_RELIC_BROWSER_BEACON ?? 'bam.eu01.nr-data.net'` | EU endpoint used (wrong for US)     |
| NR agent loads  | `beforeInteractive` script loads `nr-spa-1.312.1.min.js` | Agent reads `NREUM.info`            |
| Harvest attempt | Agent POSTs to beacon domain                             | EU endpoint rejects US account data |
| NR Browser      | Polls for events                                         | No events arrive — zero data        |

---

## Divergence Points

### Divergence 1 — Beacon Hard Default (all environments)

**Location**: `src/core/observability/new-relic-browser.ts:24`

```typescript
const beacon = env.NEW_RELIC_BROWSER_BEACON ?? 'bam.eu01.nr-data.net';
```

When `NEW_RELIC_BROWSER_BEACON` is not set (it is NOT set in `.env.local`), the code always defaults to the EU endpoint. NR account `6443682` is a US account — correct beacon is `bam.nr-data.net`. All telemetry silently sent to the wrong regional endpoint.

### Divergence 2 — Duplicate `.env.example` Entry (configuration)

**Location**: `.env.example` lines 51 and 70

Line 51: `NEW_RELIC_BROWSER_BEACON=bam.eu01.nr-data.net` (in NR Browser section)
Line 70: `NEW_RELIC_BROWSER_BEACON=` (empty — in NerdGraph/debugging section, misplaced)

When users run `pnpm env:init`, dotenv-derived parsers take the FIRST occurrence (`bam.eu01.nr-data.net`). But any tool that takes the last occurrence would get empty string. The variable being present at all in the NerdGraph section is a copy-paste error.

**Effect**: `NEW_RELIC_BROWSER_BEACON` is not set in `.env.local` (user likely removed the duplicate/empty value manually), leaving the code default to EU.

### Divergence 3 — Vercel env var gap (Vercel only)

Vercel project settings must explicitly include `NEW_RELIC_BROWSER_ENABLED=true` and all supporting vars. If absent, `getNrBrowserCdnConfig()` returns `null` at build time → prerendered HTML has no NR scripts → zero monitoring on Vercel.

**Note**: The `.env.example` has `NEW_RELIC_BROWSER_ENABLED=false` as default. Vercel deployments using `.env.example` as the basis for Vercel env configuration would have this disabled.

---

## Eliminated Hypotheses

| Hypothesis                       | Status         | Reason                                                                      |
| -------------------------------- | -------------- | --------------------------------------------------------------------------- |
| Unversioned agent URL (403)      | ELIMINATED     | Agent URL is `nr-spa-1.312.1.min.js` (versioned)                            |
| Wrong `strategy` on Script       | ELIMINATED     | Both config and CDN scripts use `beforeInteractive`                         |
| Missing NREUM.init               | ELIMINATED     | All three NREUM objects are set in inline script                            |
| CSP blocking agent load          | ELIMINATED     | `js-agent.newrelic.com` and both beacon domains in CSP                      |
| Double-hop loading               | ELIMINATED     | CDN path is direct in layout — no route handler involved                    |
| Missing `connection()` in layout | NOT APPLICABLE | Layout reads env vars (build-time constants), not request-time dynamic data |
