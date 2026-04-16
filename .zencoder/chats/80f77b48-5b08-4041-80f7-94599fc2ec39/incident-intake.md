# Incident Intake

**Workflow**: Incident Investigation Workflow (`80f77b48-5b08-4041-80f7-94599fc2ec39`)
**Date**: 2026-04-13
**Agent**: Debug Investigation Agent (Step 1)
**Status**: complete
**Prior art**: chat `a8838f22` (NR Vercel integration investigation), chat `c1fa534f` (NR Browser CDN feature)

---

## Symptom

New Relic Browser CDN monitoring does not function on Vercel deployments. The NR Browser standalone CDN agent (independent of the APM Node.js agent) was implemented as a workaround for Vercel's incompatibility with `NODE_OPTIONS=-r newrelic` APM preloading. The CDN approach is also failing.

**Specific failure**: No browser `PageView`, `BrowserInteraction`, or `AjaxRequest` events arrive in New Relic for the configured Browser application, even when `NEW_RELIC_BROWSER_ENABLED=true` and the required credentials (`NEW_RELIC_BROWSER_LICENSE_KEY`, `NEW_RELIC_BROWSER_APP_ID`, `NEW_RELIC_BROWSER_ACCOUNT_ID`) are set in the Vercel environment.

---

## Environment

| Property                  | Value                                                                       |
| ------------------------- | --------------------------------------------------------------------------- |
| Platform                  | Vercel (preview + production)                                               |
| Runtime                   | Node.js 24, Next.js 16 (Turbopack, `cacheComponents: true`)                 |
| NR Browser package        | Standalone CDN agent (`nr-spa.min.js`)                                      |
| NR Account                | `6443682`                                                                   |
| Prior task (APM incident) | `.copilot/tasks/2026-04-08-vercel-newrelic-incident/`                       |
| Prior task (browser SPA)  | `.copilot/tasks/2026-04-05-nr-browser-spa/`                                 |
| Prior investigation       | chat `a8838f22` — resulted in CDN approach decision                         |
| CDN implementation        | chat `c1fa534f` — implemented `src/core/observability/new-relic-browser.ts` |

---

## Prior Decisions (from chat a8838f22)

| Question                    | Decision                                      |
| --------------------------- | --------------------------------------------- |
| Browser monitoring approach | **CDN standalone agent** (decoupled from APM) |
| APM on Vercel               | Deferred to follow-up task                    |
| OTel traces                 | Enable as experimental                        |

---

## Reproduction Steps

1. Set on Vercel: `NEW_RELIC_BROWSER_ENABLED=true`, `NEW_RELIC_BROWSER_LICENSE_KEY=<browser_key>`, `NEW_RELIC_BROWSER_APP_ID=<app_id>`, `NEW_RELIC_BROWSER_ACCOUNT_ID=<account_id>`
2. Deploy to Vercel preview
3. Open browser DevTools → Network tab → look for `new-relic-browser.js` request
4. Open browser DevTools → Console → check for NR-related errors
5. Check NR Browser application for incoming data
6. Observe: no `PageView` events arrive in NR

---

## Key Files Involved

| File                                                  | Role                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/app/observability/new-relic-browser.js/route.ts` | Route handler serving the NR snippet                                                                                     |
| `src/core/observability/new-relic-browser.ts`         | CDN snippet generator (`getNrBrowserCdnSnippet()`)                                                                       |
| `src/core/observability/new-relic.ts`                 | APM-linked browser timing header (fallback path)                                                                         |
| `src/app/layout.tsx`                                  | Injects `<Script src="/observability/new-relic-browser.js">`                                                             |
| `src/core/env.ts`                                     | `NEW_RELIC_BROWSER_ENABLED`, `NEW_RELIC_BROWSER_LICENSE_KEY`, `NEW_RELIC_BROWSER_APP_ID`, `NEW_RELIC_BROWSER_ACCOUNT_ID` |
| `src/security/middleware/with-headers.ts`             | CSP headers (includes `js-agent.newrelic.com` and `bam.nr-data.net`)                                                     |
| `next.config.ts`                                      | `serverExternalPackages` includes `newrelic`                                                                             |

---

## Hypothesized Root Causes (pre-investigation)

1. `afterInteractive` script strategy → NR agent loads too late
2. Double-hop loading (route JS → dynamic script creation → NR CDN) → additional latency
3. Missing `NREUM.init` object → agent misconfiguration
4. Prerender caching of layout → env vars evaluated at build time, not runtime
5. Env vars not set on Vercel → silent empty response
