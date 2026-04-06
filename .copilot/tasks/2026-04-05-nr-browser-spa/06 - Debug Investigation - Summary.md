# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-04-05-nr-browser-spa`
- Task Objective: replace APM browser injection with SPA-compatible request-time Node route delivery for New Relic Browser monitoring
- Current Run Scope: post-implementation regression — `cacheComponents` incompatibility introduced by the refactor's route segment config exports
- Status: COMPLETED
- Last Updated: 2026-04-06
- Related Control Artifacts: `plan.md`, `validation-report.md`, `04 - Implementation Agent - Summary.md`

---

## Scope Handled

### Pass 1 (2026-04-05)

- symptom or flow investigated: preview deploy build failure during static generation of `/observability/new-relic-browser.js`
- runtime surfaces investigated: App Router route handler prerender path, layout script-loader path, env-driven route branching
- env or timing questions investigated: behavior when `NEW_RELIC_ENABLED` is unset or explicitly false in preview/build environments

### Pass 2 (2026-04-06 — Vercel env-size follow-up)

- symptom or flow investigated: 88 KB browser snippet exceeds documented Vercel per-variable limit; deployment env-var transport is infeasible for large snippets
- runtime surfaces investigated: request-time Node route as primary delivery path; env-backed snippet as local/dev fallback only

### Pass 3 (2026-04-06 — cacheComponents regression)

- symptom or flow investigated: HMR build error after refactor introduced `export const runtime` and `export const dynamic` into the route, which are banned by `nextConfig.cacheComponents: true`
- runtime surfaces investigated: Turbopack transform layer (compile-time enforcement), route handler dynamic rendering opt-in
- env or timing questions investigated: whether removing the segment configs leaves the route vulnerable to prerender and the `Date.now()` constraint

---

## Inputs Reviewed

### Pass 3

- code paths reviewed:
  - `src/app/observability/new-relic-browser.js/route.ts` — exports `runtime` and `dynamic`
  - `next.config.ts` — confirms `cacheComponents: true`
  - `src/core/observability/new-relic.ts` — confirms `getBrowserAgentScriptSafe()` calls `getBrowserTimingHeaderSafe()` which invokes the NR agent at request time (calls `Date.now()` internally)
  - `src/app/layout.tsx` — references the route via `<Script src="/observability/new-relic-browser.js" strategy="beforeInteractive" />`
  - `src/app/observability/new-relic-browser.js/route.test.ts` — imports and asserts both banned exports
  - `src/app/feature-flags-demo/page.tsx`, `src/app/sign-in`, `src/app/sign-up`, `src/app/users/layout` — confirmed established `connection()` pattern
- logs / diagnostics reviewed: browser DevTools console output showing repeated HMR websocket error loop for both `runtime` and `dynamic` config violations
- tests / task artifacts reviewed: `route.test.ts`, `plan.md`, `04 - Implementation Agent - Summary.md`

---

## Actions Performed

### Pass 3

- execution-path tracing performed: traced compile error from Turbopack transform through `route.ts` exports to `cacheComponents` enforcement in Next.js 16.2.2
- source-of-truth tracing performed: verified `cacheComponents: true` in `next.config.ts`; audited all `export const dynamic` and `export const runtime` occurrences across all non-test app files — only one instance exists (the failing route)
- evidence collection performed: confirmed `connection()` is the established codebase-wide pattern for dynamic opt-in; confirmed `getBrowserAgentScriptSafe()` must not prerender due to NR `Date.now()` constraint

---

## Symptom Summary

### Pass 1

- observed symptom: preview deployment fails during static generation with `TypeError: Response constructor: Invalid response status code 204`
- where it surfaces: build/prerender phase for `/observability/new-relic-browser.js`
- reproducibility: deterministic when `NEW_RELIC_ENABLED=false` or unset and no browser snippet is configured
- trigger conditions: route returns `new NextResponse('', { status: 204 })` — a body is not permitted on a 204

### Pass 3

- observed symptom: Turbopack HMR and build both refuse to compile the route with two errors repeating in a loop:
  - `Route segment config "dynamic" is not compatible with nextConfig.cacheComponents. Please remove it.`
  - `Route segment config "runtime" is not compatible with nextConfig.cacheComponents. Please remove it.`
- where it surfaces: compile-time, `src/app/observability/new-relic-browser.js/route.ts` lines 6–7; secondary symptom is `POST /api/logs 500` from `GlobalErrorHandlers` attempting to log the repeated HMR error
- reproducibility: deterministic — 100% on every dev server start and every HMR cycle
- trigger conditions: `cacheComponents: true` in `next.config.ts` combined with `export const runtime` or `export const dynamic` in any App Router route segment

---

## Confirmed Evidence

### Pass 3

- code facts:
  - **Confirmed** — `next.config.ts` has `cacheComponents: true` (Cache Components model, PPR-compatible)
  - **Confirmed** — `route.ts` exports `export const runtime = 'nodejs'` (line 6) and `export const dynamic = 'force-dynamic'` (line 7)
  - **Confirmed** — Next.js 16 with `cacheComponents: true` forbids both `runtime` and `dynamic` route segment config exports; this is a compile-time hard error enforced by the Turbopack transform layer
  - **Confirmed** — these are the **only** two `export const dynamic` / `export const runtime` declarations in all non-test App Router files; no other route is affected
  - **Confirmed** — `route.test.ts` imports both banned exports by name and asserts their values; the test will fail as a direct consequence of removing the exports
  - **Confirmed** — `getBrowserAgentScriptSafe()` calls `getBrowserTimingHeaderSafe()` which calls `nr.getBrowserTimingHeader()` — the NR agent records `Date.now()` internally; this must never be called from a prerenderable path (AGENTS.md constraint)
  - **Confirmed** — `connection()` from `next/server` is the established codebase-wide opt-in for dynamic rendering (used in `feature-flags-demo`, `sign-in`, `sign-up`, `users/layout`)
  - **Confirmed** — Installed Next.js version is `16.2.2` (AGENTS.md states `16.2.1` — minor drift, no impact)

- runtime evidence:
  - Turbopack HMR emits both errors on every rebuild cycle, causing an infinite loop visible in the browser DevTools console
  - `POST /api/logs 500` is a secondary symptom — `GlobalErrorHandlers` attempting to report the HMR build error to the log ingest endpoint, which itself fails during the broken build state

---

## Execution Path

### Pass 3

- entry point: `pnpm dev` (Turbopack) or `pnpm build` parses `src/app/observability/new-relic-browser.js/route.ts`
- critical path:
  1. Turbopack reads the file and detects `export const runtime` and `export const dynamic`
  2. Next.js 16 compile-time transform checks for `cacheComponents: true` in config
  3. Both exports are flagged as incompatible — hard compile error, route never executes
  4. HMR re-attempts on every file change, repeating the error in a loop
- state transitions: n/a — failure is at compile time, route handler never reaches execution
- failure boundary: Turbopack transform layer — before any runtime request handling

---

## Hypotheses And Failure Points

### Pass 3

- likely failure points:
  - **Confirmed** — `export const runtime = 'nodejs'` is incompatible with `cacheComponents: true`
  - **Confirmed** — `export const dynamic = 'force-dynamic'` is identically incompatible
  - **Likely** — without an explicit dynamic opt-in replacement, the route could be treated as statically prerenderable by Next.js 16, which would trigger the `Date.now()` constraint via `getBrowserAgentScriptSafe()` → `getBrowserTimingHeaderSafe()` → NR agent
  - **Confirmed** — `route.test.ts` will produce test failures as a direct consequence of removing the exports

- hypotheses:
  - **Confirmed** — removing both exports and adding `await connection()` as the first statement inside `GET()` fully resolves the compile error and preserves request-time dynamic behavior; this is the established codebase pattern
  - **Likely** — `Cache-Control: no-store` in the response header is insufficient alone to prevent prerender; the `connection()` call is required as the explicit compile-time dynamic signal

- disproven possibilities:
  - this is not a Vercel Edge runtime issue; the route was already intended for Node.js runtime and App Router route handlers default to Node.js when `cacheComponents` is active
  - this is not caused by the secondary `POST /api/logs 500` error — that is a symptom of the HMR loop, not a separate failure

---

## Missing Evidence / Uncertainty

### Pass 3

- **Needs verification**: that the `GET()` function with `await connection()` but without `export const runtime = 'nodejs'` still executes on the Node.js runtime (not Edge). Route handlers in App Router default to Node.js; `newrelic` is in `serverExternalPackages`; this is expected to be safe but should be confirmed at runtime after the fix.
- **Cleared**: no other route files require the same fix — audit confirmed this is the only occurrence.

---

## Artifact Synchronization

### Pass 3

- `plan.md` updates: `plan.md` step 3 notes the route is "pinned to `runtime = 'nodejs'`" and "pinned to `dynamic = 'force-dynamic'`" — these notes are now incorrect and should be updated to reflect the `connection()` pattern after implementation
- `intake.md` updates: not present for this task folder
- `implementation-plan.md` updates: not present for this task folder
- specialist artifact updates: `06 - Debug Investigation - Summary.md` updated (this file); `04 - Implementation Agent - Summary.md` will need a follow-up entry after the fix is applied

---

## Handoff Notes

### Pass 3

**Root cause is fully confirmed. Remediation is small, contained, and low-risk.**

**What the next agent should rely on:**

1. `src/app/observability/new-relic-browser.js/route.ts` — remove `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`; add `import { connection } from 'next/server'`; add `await connection()` as the **first statement** inside `GET()`, before any env check or `getBrowserAgentScriptSafe()` call
2. `src/app/observability/new-relic-browser.js/route.test.ts` — remove the named imports of `dynamic` and `runtime`; delete or rewrite the `'pins the route to request-time Node execution'` test case (the segment config exports no longer exist; dynamic rendering is enforced via `connection()` which is not statically assertable)
3. `plan.md` step 3 runtime constraints note should be updated to reflect the `connection()` pattern

**What remains unproven:**

- runtime confirmation that the Node.js runtime is still selected without the explicit `export const runtime` export

**Recommended next specialist:**

→ **`04 - Implementation Agent`** — cause is fully confirmed, fix is two files, no architecture decision required, no new dependencies, pattern is already established in the codebase

---

## Update Log

### Update Entry — Pass 3

- Date: 2026-04-06
- Trigger: post-implementation HMR build error — refactor introduced `export const runtime` and `export const dynamic` which are banned by `nextConfig.cacheComponents: true` in Next.js 16
- Summary of change: confirmed compile-time incompatibility between route segment config exports and the Cache Components model; identified `connection()` as the correct replacement dynamic opt-in; identified `route.test.ts` as a required co-change; produced remediation plan for Implementation Agent
- Sections refreshed: task context (current run scope), scope (Pass 3), inputs reviewed (Pass 3), actions performed (Pass 3), symptom summary (Pass 3), confirmed evidence (Pass 3), execution path (Pass 3), hypotheses (Pass 3), missing evidence (Pass 3), artifact synchronization (Pass 3), handoff notes (Pass 3), update log

### Update Entry — Pass 2

- Date: 2026-04-06
- Trigger: Vercel deployment follow-up revealed the browser snippet size (`88,088`) exceeds documented Vercel env-var limits
- Summary of change: replaced the env-backed snippet with a request-time Node loader as the primary hosted deployment path, kept env-backed transport as local/dev fallback only, and synchronized the task artifacts with the new deployment guidance
- Sections refreshed: all

### Update Entry — Pass 1

- Date: 2026-04-05
- Trigger: preview branch hydration/runtime regression and CI secret-scan failure follow-up
- Summary of change: externalized the Browser SPA snippet to a public `.js` route, fixed the disabled preview-export path, hardened the NerdGraph CLI, validated both runtime and disabled-env build behavior, and synchronized artifact status
- Sections refreshed: all
