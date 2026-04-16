# Incident Intake

**Workflow**: Incident Investigation Workflow (`2a857370-6b74-46a7-aa84-15afb8dddb4c`)
**Date**: 2026-04-16
**Agent**: Debug Investigation Agent (Step 1)
**Status**: complete
**Prior art**: chats `80f77b48`, `a8838f22`, `c1fa534f`, task `2026-04-12-observability-multi-provider`

---

## Symptom

New Relic Browser CDN monitoring produces **no data on any environment** (local dev, Vercel preview, Vercel production). APM/backend telemetry works on local dev (NR Node.js agent connects). NR Browser (`PageView`, `BrowserInteraction`, `AjaxRequest`) never arrives in the NR Browser application.

---

## Environment

| Property                    | Value                                                                 |
| --------------------------- | --------------------------------------------------------------------- |
| Platform                    | Local dev + Vercel preview + Vercel production                        |
| Runtime                     | Node.js 24, Next.js 16 (`cacheComponents: true`)                      |
| NR Browser delivery         | CDN standalone agent (via `beforeInteractive` in layout)              |
| NR Account                  | `6443682` (US region)                                                 |
| NR Browser agent URL        | `https://js-agent.newrelic.com/nr-spa-1.312.1.min.js` (versioned ✓)   |
| `NEW_RELIC_BROWSER_ENABLED` | `true` in `.env.local`                                                |
| `NEW_RELIC_BROWSER_BEACON`  | **NOT SET** in `.env.local` — code defaults to `bam.eu01.nr-data.net` |

---

## Reproduction Steps

1. Local dev (`pnpm dev`), open browser, navigate to `http://localhost:3000`
2. Inspect HTML source — verify inline NREUM config script is present
3. Open browser DevTools → Network → filter for `nr-spa-1.312.1.min.js` — verify script loads (200)
4. Open DevTools → Network → filter for `bam.` domains — observe: requests go to `bam.eu01.nr-data.net`
5. Check NR Browser app for account `6443682` — no `PageView` events arrive

---

## Key Files Involved

| File                                          | Role                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `src/core/observability/new-relic-browser.ts` | `getNrBrowserCdnConfig()` — builds NREUM config; defaults beacon to EU      |
| `src/app/layout.tsx`                          | Injects inline NREUM config + `<Script strategy="beforeInteractive">`       |
| `src/core/env.ts`                             | `NEW_RELIC_BROWSER_BEACON` — optional, no default; code-level default is EU |
| `.env.example`                                | Duplicate `NEW_RELIC_BROWSER_BEACON` entries (lines 51 and 70)              |
| `.env.local`                                  | `NEW_RELIC_BROWSER_BEACON` not present → EU default used                    |
| `src/security/middleware/with-headers.ts`     | CSP — both `bam.nr-data.net` (US) and `bam.eu01.nr-data.net` (EU) allowed   |

---

## Confirmed Facts from Code Inspection

1. `NEW_RELIC_BROWSER_ENABLED=true` in `.env.local` ✓
2. `NEW_RELIC_BROWSER_AGENT_URL` = `nr-spa-1.312.1.min.js` (correctly versioned) ✓
3. `NEW_RELIC_BROWSER_LICENSE_KEY`, `APP_ID`, `ACCOUNT_ID` all set in `.env.local` ✓
4. `NEW_RELIC_BROWSER_BEACON` **not set** in `.env.local` — code defaults to `bam.eu01.nr-data.net`
5. NR account `6443682` is a US account → correct beacon is `bam.nr-data.net`
6. Prior remediation plan (chat `80f77b48`) used `bam.nr-data.net` in example — confirming US
7. `.env.example` has TWO `NEW_RELIC_BROWSER_BEACON` entries: line 51 = EU, line 70 = empty
8. CSP includes both US and EU beacon domains — not a blocker

---

## Pre-Investigation Hypotheses (ranked by evidence)

| Priority | Hypothesis                                                              | Evidence                                                     |
| -------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| **P0**   | Wrong beacon: EU endpoint used for US account                           | Code default = EU; `.env.local` has no beacon; account is US |
| **P1**   | Vercel env vars not configured                                          | Cannot verify from code — requires user confirmation         |
| **P2**   | Duplicate `NEW_RELIC_BROWSER_BEACON` in `.env.example` causes confusion | Lines 51 and 70 both define this var                         |
| **P3**   | Layout prerender caches empty state on Vercel                           | If Vercel build-time vars differ from runtime                |

---

## Open Questions for User

1. Is `NEW_RELIC_BROWSER_BEACON` set in Vercel project environment variables?
2. Are ALL `NEW_RELIC_BROWSER_*` vars set in Vercel project settings (preview + production)?
3. What region was the NR Browser application created in (US or EU)?
