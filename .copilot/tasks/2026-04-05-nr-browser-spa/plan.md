# Task Plan: New Relic Browser SPA Agent Integration

**Task ID**: `2026-04-05-nr-browser-spa`
**Status**: ✅ Complete — Vercel env-size follow-up resolved with request-time Node loader path
**Created**: 2026-04-05
**Parent task**: `2026-04-05-per-request-caching` (NR integration sub-task)

---

## Objective

Replace the current APM `getBrowserTimingHeader()` browser injection with a Browser SPA-compatible delivery path that correctly tracks Next.js App Router client-side navigation and remains safe for Vercel deployments.

**Root cause (confirmed by debug investigation):**

- `getBrowserTimingHeader()` injects the APM app's "rum/lite" loader
- That loader only fires on `beforeunload` (full page unload)
- Next.js App Router uses client-side (SPA) navigation which never fires `beforeunload`
- Result: no browser data ever reaches New Relic

**Fix:**

- Serve the browser loader from a public request-time Node route
- Prefer runtime `getBrowserTimingHeader()` generation in that route
- Keep env-backed snippet transport only as an optional local/dev fallback
- Avoid shipping an 88 KB copy/paste snippet through Vercel deployment env vars

---

## Classification

| Dimension       | Value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| Type            | Observability fix — browser monitoring delivery refactor                         |
| Blast radius    | Low — layout, public JS route, observability facade, docs                        |
| Risk level      | Low/Medium — runtime-safe but depends on Node agent availability at request time |
| Runtime target  | Node.js SSR + request-time Node route handler                                    |
| Auth impact     | None                                                                             |
| Security impact | Medium — browser ingest key management and public script route behavior          |
| E2E required    | No                                                                               |
| Demo page       | No                                                                               |

---

## Key Constraints

### Security

- The browser payload contains a browser `licenseKey` field — a **browser-only write-only ingest key**
  - Safe to inject into HTML or a public JavaScript asset (all users can see it in page source — by design)
  - Must NOT be committed to the repository
- Do not store the full copy/paste snippet in tracked files
- Local fallback env vars remain **server-side only**
- No sensitive server secrets are exposed to the client by this refactor

### Rollback

- `NEW_RELIC_BROWSER_SNIPPET` and `NEW_RELIC_BROWSER_SNIPPET_BASE64` are optional fallback inputs
- If the Node agent is unavailable at request time and no fallback is configured → the route degrades to an empty JS asset
- Rollback = revert the route to env-only delivery or disable browser injection entirely with `NEW_RELIC_ENABLED=false`
- No schema or data migration is involved

### Architecture

- Injection logic stays in `src/core/observability/new-relic.ts` facade
- `layout.tsx` only decides whether to load the public JS route
- The public JS route owns runtime generation and fallback selection
- Env schema remains the single source of truth for feature enablement

### Runtime

- The public JS route is pinned to `runtime = 'nodejs'`
- The public JS route is pinned to `dynamic = 'force-dynamic'`
- `layout.tsx` never calls `getBrowserTimingHeader()` during prerender
- `strategy="beforeInteractive"` on `<Script>` still moves the browser loader to `<head>`
- This avoids both the Next.js 16 prerender `Date.now()` constraint and Vercel Edge env-var limits

### Deployment

- Vercel documents a total 64 KB environment variable budget per deployment for Node runtimes, with no single variable larger than 64 KB
- Vercel documents a 5 KB per-variable limit for Edge Functions and Middleware
- The observed browser snippet size (`88,088` characters) exceeds the documented Node per-variable limit, so the full snippet must not be modeled as a normal Vercel env var

---

## Workflow Steps

- [x] **Step 1 — Architecture Review** · `01 - Architecture Guard - Summary.md`
  - Validate boundary placement (env schema, facade, layout)
  - Confirm snippet env var size handling strategy
  - Confirm fallback chain design
  - Confirm no client bundle exposure
- [x] **Step 2 — Security Review** · `02 - Security & Auth - Summary.md`
  - Audit browser ingest key handling
  - Confirm env var is server-side only
  - Confirm no key committed to repo
  - Confirm CSP is sufficient (already done for APM approach — verify applies to snippet)
- [x] **Step 3 — Implementation** · `04 - Implementation Agent - Summary.md`
  - Keep `NEW_RELIC_BROWSER_SNIPPET` / `_BASE64` only as optional local fallback inputs
  - Update `src/core/observability/new-relic.ts` — prefer request-time runtime generation, fallback to env-backed snippet
  - Update `src/app/layout.tsx` — load Browser SPA script without requiring a prevalidated env-backed snippet
  - Update `src/app/observability/new-relic-browser.js/route.ts` — force Node runtime + dynamic request-time execution
  - Update user documentation / comment in `.env.example`
  - Follow-up fix: align the task narrative with Vercel env-size limits and deployment-safe guidance
- [x] **Step 4 — Validation** · `validation-report.md`
  - `pnpm lint --fix` — focused touched files clean
  - focused Vitest coverage-free run for `src/core/observability/new-relic.test.ts`
  - focused Vitest coverage-free run for `src/app/observability/new-relic-browser.js/route.test.ts`
  - verify route response semantics still degrade cleanly when no loader resolves
  - verify the layout now depends only on `NEW_RELIC_ENABLED`

---

## Artifact Trail

| Artifact                                 | Status                                                            |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `plan.md`                                | ✅                                                                |
| `intake.md`                              | ✅ (this document + `plan.md` serve combined role)                |
| `01 - Architecture Guard - Summary.md`   | ✅                                                                |
| `02 - Security & Auth - Summary.md`      | ✅                                                                |
| `03 - Next.js Runtime - Summary.md`      | ⏭️ Skip — no new runtime surface beyond existing layout injection |
| `04 - Implementation Agent - Summary.md` | ✅                                                                |
| `06 - Debug Investigation - Summary.md`  | ✅                                                                |
| `validation-report.md`                   | ✅                                                                |

---

## Debug Investigation Evidence (from `2026-04-05-per-request-caching`)

Confirmed findings from prior debug investigation session:

- APM app (ID: 494140442) — backend connected ✅, browser monitoring enabled in NR UI
- NREUM script IS injected into page (confirmed in browser source) ✅
- `"agent":""` field → APM "rum" lite loader (not SPA) — confirmed via `api.js` source analysis
- `RUM_STUB = 'window.NREUM||(NREUM={});NREUM.info = %s; %s'` → js_agent_loader appended inline
- Standalone browser app (ID: 538837440) configured Pro + SPA loader in NR UI ✅
- Snippet in `docs/newrelic-agent-snippet.js` — gitignored ✅, NOT injected anywhere

---

## Operational Conclusion

- The original env-snippet model is acceptable for local `.env.local` fallback only
- It is not the correct primary deployment model for Vercel once the snippet exceeds the documented env-var limits
- The repository now uses a lower-friction deployment path:
  - `layout.tsx` loads the public loader route when `NEW_RELIC_ENABLED=true`
  - the route generates the loader from the Node agent at request time
  - env-backed snippet values remain optional fallback transport only

## Sources

- Vercel environment variable limits: https://vercel.com/docs/projects/environment-variables
- Vercel environment variable CLI management: https://vercel.com/docs/cli/env
- New Relic browser installation paths: https://docs.newrelic.com/docs/browser/browser-monitoring/installation/install-browser-monitoring-agent/
