# Task Plan: New Relic Browser SPA Agent Integration

**Task ID**: `2026-04-05-nr-browser-spa`
**Status**: ✅ Complete — All validation passed, smoke test issues resolved
**Created**: 2026-04-05
**Parent task**: `2026-04-05-per-request-caching` (NR integration sub-task)

---

## Objective

Replace the current APM `getBrowserTimingHeader()` browser injection with the standalone NR Browser SPA snippet approach, which correctly tracks Next.js App Router client-side navigation.

**Root cause (confirmed by debug investigation):**

- `getBrowserTimingHeader()` injects the APM app's "rum/lite" loader
- That loader only fires on `beforeunload` (full page unload)
- Next.js App Router uses client-side (SPA) navigation which never fires `beforeunload`
- Result: no browser data ever reaches New Relic

**Fix:**

- Inject the standalone NR Browser SPA snippet (Pro + SPA loader, `nr-loader-spa-*`)
- The snippet fires on route changes, captures AJAX, errors, and page timing in real-time
- The snippet is already configured and available from the NR UI (app ID: 538837440)

---

## Classification

| Dimension       | Value                                                         |
| --------------- | ------------------------------------------------------------- |
| Type            | Observability fix — browser monitoring approach change        |
| Blast radius    | Low — layout.tsx only; existing APM approach kept as fallback |
| Risk level      | Low — purely additive env var; easy rollback (unset env var)  |
| Runtime target  | Node.js SSR (Server Component render path)                    |
| Auth impact     | None                                                          |
| Security impact | Medium — browser ingest key management                        |
| E2E required    | No                                                            |
| Demo page       | No                                                            |

---

## Key Constraints

### Security

- The snippet contains `licenseKey: "NRJS-..."` — a **browser-only write-only ingest key**
  - Safe to inject into HTML (all users can see it in page source — by design)
  - Must NOT be committed to the repository
  - Must stay in `.env.local` / deployment secret store only
- The env var holding the snippet must be **server-side only** (not exposed to client bundle)
- No other secrets are involved

### Rollback

- The new env var `NEW_RELIC_BROWSER_SNIPPET` is optional
- If unset → falls back to existing `getBrowserTimingHeaderSafe()` (APM approach)
- Rollback = unset the env var → system reverts to prior behavior
- No code changes needed to roll back

### Architecture

- Injection logic stays in `src/core/observability/new-relic.ts` facade
- `layout.tsx` receives a string (snippet or empty) — no NR dependency in layout directly
- Env schema is the single source of truth for feature enablement

### Runtime

- `NEW_RELIC_BROWSER_SNIPPET` is a server-side env var (not `NEXT_PUBLIC_*`)
- Accessed only in `RootLayout` server component — correct placement
- `strategy="beforeInteractive"` on `<Script>` moves it to `<head>` — required by NR docs

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
  - Add `NEW_RELIC_BROWSER_SNIPPET` to `src/core/env.ts`
  - Add to `.env.example` with security comment
  - Update `src/core/observability/new-relic.ts` — `getBrowserSnippetSafe()`
  - Update `src/app/layout.tsx` — use snippet if set, else APM fallback
  - Revert `newrelic.js` logging level from `trace` back to `info`
  - Update user documentation / comment in `.env.example`
- [x] **Step 4 — Validation** · `validation-report.md`
  - `pnpm typecheck` — 0 errors
  - `pnpm lint --fix` — 0 errors
  - `pnpm test` — all pass (892+)
  - Manual smoke: env var set → snippet injected in page source → correct app ID (538837440)
  - Manual smoke: env var unset → falls back to `getBrowserTimingHeaderSafe()`

---

## Artifact Trail

| Artifact                                 | Status                                                            |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `plan.md`                                | ✅                                                                |
| `intake.md`                              | ✅ (this document + `plan.md` serve combined role)                |
| `01 - Architecture Guard - Summary.md`   | 🔲 Pending                                                        |
| `02 - Security & Auth - Summary.md`      | 🔲 Pending                                                        |
| `03 - Next.js Runtime - Summary.md`      | ⏭️ Skip — no new runtime surface beyond existing layout injection |
| `04 - Implementation Agent - Summary.md` | 🔲 Pending                                                        |
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

## Pause Points

- **After Step 1 (Architecture Review)**: pause for user review before proceeding
- **After Step 3 (Implementation)**: pause — user must manually set `NEW_RELIC_BROWSER_SNIPPET` in `.env.local` and smoke-test browser data in NR
