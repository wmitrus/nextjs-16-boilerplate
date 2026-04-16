# Root Cause Analysis: NR Browser Zero Beacon Requests

## Status: RESOLVED

## Root Cause

**`NEW_RELIC_BROWSER_AGENT_URL` pointed to the wrong file format.**

`nr-spa-1.312.1.min.js` is a webpack **module chunk** — it pushes one module bundle to
`self["webpackChunk:NRBA-1.312.1.PROD"]`:

```javascript
(self["webpackChunk:NRBA-1.312.1.PROD"]=self["webpackChunk:NRBA-1.312.1.PROD"]||[]).push([[478],{...modules...}]);
```

Without the NR webpack runtime (loader), `self["webpackChunk:NRBA-1.312.1.PROD"]` is just a
plain JavaScript array. Pushing a module chunk to a plain array stores the data but **never
executes it**. The NR agent code loads into memory, but the modules are never invoked.

The correct file is `nr-loader-spa-1.312.1.min.js` (65KB), which:

- Contains the webpack runtime
- Contains the `i.p="https://js-agent.newrelic.com/"` public path
- Has the chunk URL mapping: `478 → "nr-spa-1.312.1.min.js"`
- Reads `window.NREUM` config
- Initializes the SPA agent features
- **Automatically loads `nr-spa-1.312.1.min.js` as a dynamic webpack chunk** (via `i.e(478)`)

## Evidence

| Signal                                             | Value                                                  |
| -------------------------------------------------- | ------------------------------------------------------ |
| `nr-spa-1.312.1.min.js` `.push([[` calls           | 1 (single chunk push, no runtime)                      |
| `nr-loader-spa-1.312.1.min.js` webpack public path | `i.p="https://js-agent.newrelic.com/"`                 |
| Loader chunk map                                   | `478: "nr-spa"` → auto-loads `nr-spa-1.312.1.min.js`   |
| HAR agent loads                                    | 9 (all 200 OK)                                         |
| HAR beacon requests                                | 0 (bam.eu01.nr-data.net completely absent)             |
| Sentry requests in HAR                             | Present and working (different domain, different init) |
| CSP for `bam.eu01.nr-data.net`                     | Correctly allowed in `connect-src`                     |
| NREUM config in HTML                               | Correct (beacon, accountID, appID, licenseKey all set) |

## Affected Environments

All three: local dev, Vercel preview, Vercel production — all used `nr-spa-X.min.js`.

## Fix Applied

Changed `NEW_RELIC_BROWSER_AGENT_URL` in `.env.local`:

```
Before: https://js-agent.newrelic.com/nr-spa-1.312.1.min.js
After:  https://js-agent.newrelic.com/nr-loader-spa-1.312.1.min.js
```

## Files Changed

- `.env.local` — Updated `NEW_RELIC_BROWSER_AGENT_URL` to `nr-loader-spa-1.312.1.min.js`
- `.env.example` — Updated comment/example to document correct loader format
- `AGENTS.md` — Updated `NEW_RELIC_BROWSER_AGENT_URL` constraint documentation
- `docs/features/26 - New Relic Server & Browser Integration.md` — Updated URL examples

## Operator Actions Required

1. **Vercel**: Update `NEW_RELIC_BROWSER_AGENT_URL` in ALL environments (Production, Preview, Development) to:
   `https://js-agent.newrelic.com/nr-loader-spa-1.312.1.min.js`
2. **Redeploy** all Vercel environments after updating the env var
3. **No code changes** to `src/` required — the URL is the only change

## Verification

After local dev server reload with new URL:

- Browser Network tab: `nr-loader-spa-1.312.1.min.js` loads (200 OK)
- Browser Network tab: `nr-spa-1.312.1.min.js` auto-loads shortly after (200 OK) — loaded by loader webpack runtime
- NR UI → Browser apps → Local dev app: PageView events appear within 30–60 seconds

## Previous False Leads

1. ~~NREUM config not set~~ — Config was correctly set before agent execution
2. ~~`beforeInteractive` script sequencing issue~~ — `app-bootstrap.js` correctly sequences inline before external
3. ~~CSP blocking~~ — CSP correctly allows both `js-agent.newrelic.com` and `bam.eu01.nr-data.net`
4. ~~Browser extension blocking~~ — No blocked entries in HAR; domain completely absent
5. ~~EU beacon configuration~~ — Correct after previous session fix; not the root cause
