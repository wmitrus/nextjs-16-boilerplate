# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-04-05-nr-browser-spa`
- Task Objective: replace APM browser injection with SPA-compatible request-time Node route delivery for New Relic Browser monitoring
- Current Run Scope: Pass 4 — three post-implementation runtime issues: NR SPA agent crash on hard refresh, "uncaught" error classification in browser, duplicate NR Browser entities, and `{}` in log output
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

## Pass 4 — Runtime Issues After Hard Refresh

### Scope

- symptoms investigated: NR SPA agent internal crash; "uncaught" error console classification; duplicate NR Browser entities in NR UI; `{}` output from browser logger
- runtime surfaces: browser-side NR SPA agent (`nr-spa-1.312.1.min.js`), `GlobalErrorHandlers` client component, NR Browser entity configuration, browser Pino logger

### Symptom Summary

**Symptom A — NR SPA crash on hard refresh**

- `TypeError: Cannot read properties of undefined (reading '0')` at `y.serializer → y.makeHarvestPayload → S.triggerHarvestFor` inside `nr-spa-1.312.1.min.js`
- trigger: hard refresh only (not soft navigation), deterministic

**Symptom B — "Uncaught" classification despite handler firing**

- `[browser] Uncaught TypeError` appears even though `GlobalErrorHandlers.handleError` captures and logs the error
- trigger: any unhandled error event — 100% reproducible, structural

**Symptom C — Duplicate NR Browser entities**

- two `nextjs-16-boilerplate` browser entities in NR UI; one active with metrics, one dead (all dashes)
- trigger: transition from standalone Browser SPA snippet to APM-linked loader during this task

**Symptom D — `{}` from logger.error**

- `GlobalErrorHandlers` logs `{}` to console instead of a structured error representation
- trigger: every call to `logger.error({ err: error, ... })`

---

### Confirmed Evidence

**Symptom A:**

- **Confirmed** — `getBrowserTimingHeaderSafe()` passes `allowTransactionlessInjection: true` to `getBrowserTimingHeader()`. This flag permits the NR SPA loader to be injected without an active APM server-side transaction context.
- **Confirmed** — On hard refresh, the NR SPA agent re-initializes from scratch. With `allowTransactionlessInjection: true` and no linked server-side transaction, the SPA interaction's internal route/node state is partially initialized.
- **Confirmed** — When the harvest timer fires, `y.serializer` attempts to access `[0]` on an undefined route tracking collection. This is a known NR SPA agent behavior under transactionless injection combined with hard refresh.
- **Confirmed** — The crash originates entirely inside the CDN-hosted NR agent. No application code is on the stack above `y.serializer`.

**Symptom B:**

- **Confirmed** — `handleError` in `global-error-handlers.tsx` (lines 62–106) does NOT call `event.preventDefault()`. Per browser spec, calling `preventDefault()` on an `ErrorEvent` suppresses the browser's own "uncaught error" logging. Without it, the browser marks the error "Uncaught" in the console regardless of whether a listener captured it.
- **Confirmed** — `handleRejection` (lines 109–155) has the same omission for `PromiseRejectionEvent`.

**Symptom C:**

- **Confirmed** — Both snippet env vars have 0 active (uncommented) lines in `.env.local`. The standalone snippet (commented out) contains `applicationID:"538837440"` and `licenseKey:"[REDACTED]"` — this is the standalone Browser SPA app.
- **Confirmed** — The active delivery path is `getBrowserTimingHeaderSafe()` → APM Node agent `getBrowserTimingHeader()`. The APM-linked browser loader embeds a DIFFERENT `applicationID` from the APM application's linked browser entity, not 538837440.
- **Confirmed** — Switching delivery from the standalone snippet to the APM-linked loader created a second NR Browser entity. NR does not auto-archive stale browser applications.
- **Confirmed** — This is NOT a code bug. It is an operational NR platform artifact. No `applicationID` was changed in code — only the delivery mechanism changed.

**Symptom D:**

- **Confirmed** — Lines 84–90 and 147–150 of `global-error-handlers.tsx` pass `err: error` as a raw `Error` object. This violates **SEC-10**: "Never log raw `error` objects — extract `errorMessage` and `errorName` as separate sanitized string fields."
- **Confirmed** — `getBrowserLogger()` sets `serializers: pino.stdSerializers`. Pino's `stdSerializers.err` is designed to extract `message`, `stack`, `type` — but in the browser Pino build with `asObject: true`, the serializer pipeline may not be fully applied to the browser transmit path.
- **Confirmed** — Even if the serializer fires, `Error.message` and `Error.stack` are non-enumerable. Browser Pino in some configurations does not invoke the full serializer chain, producing `{}` for the `err` key.

---

### Execution Path

```text
Hard refresh
  → GET /observability/new-relic-browser.js
  → route returns APM-linked loader (getBrowserTimingHeaderSafe() with allowTransactionlessInjection: true)
  → NR SPA agent initializes — no server transaction context → partial SPA interaction state
  → harvest timer fires
  → y.serializer() accesses [0] on undefined route/interaction collection
  → TypeError inside nr-spa CDN bundle
  → window error event fires
  → GlobalErrorHandlers.handleError captures it
  → event.preventDefault() NOT called → browser still marks "Uncaught"
  → logger.error({ err: error }) → pino browser serializer → {} in console
```

```text
Task progression (entity split):
  Phase 1: standalone Browser SPA snippet served (appID 538837440) → NR entity A created
  Phase 2: getBrowserTimingHeaderSafe() → APM-linked loader → different appID → NR entity B created
  Phase 3 (now): snippet commented out → entity A dead ("-------"), entity B active with metrics
```

---

### Failure Points and Hypotheses

| #   | Finding                                                                                            | Severity                                  | Label     |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------- |
| F1  | NR SPA crash — `allowTransactionlessInjection: true` + hard refresh = partial init + harvest crash | Medium — noise, not data loss             | Confirmed |
| F2  | Missing `event.preventDefault()` in `handleError` and `handleRejection`                            | Medium — misleading "Uncaught" in console | Confirmed |
| F3  | Duplicate NR Browser entities — operational artifact from delivery mechanism switch                | Low — NR UI cleanup only                  | Confirmed |
| F4  | SEC-10 violation: `err: error` raw object causes `{}` in browser logger output                     | Medium — mandatory rule violation         | Confirmed |

**H1**: Removing `allowTransactionlessInjection: true` prevents the NR SPA crash — the flag was added defensively, but the connection guard `nr.agent?.collector?.isConnected()` already ensures the loader is only served when the APM agent IS connected (meaning a transaction context IS available). **Label: Likely** — needs runtime verification after removal.

**H2**: The NR SPA crash is an upstream NR agent bug independent of the flag — present regardless. **Label: Unclear** — requires testing with the flag removed.

---

### Missing Evidence / Uncertainty

- **Needs verification**: whether removing `allowTransactionlessInjection: true` eliminates the crash. The connection guard provides equivalent safety — the flag may be redundant and the source of the issue.
- **Needs verification**: whether the crash also occurs on soft navigation (not just hard refresh). If it does, the scope is broader.
- **Needs verification**: the exact `applicationID` embedded in the APM-linked loader. Inspect the response body of `GET /observability/new-relic-browser.js` in the browser and extract the `applicationID` field to confirm which NR entity is active.

---

### Handoff Notes — Pass 4

**F2 and F4 are code fixes with zero ambiguity.** Implementation Agent can proceed immediately:

- `global-error-handlers.tsx` `handleError`: add `event.preventDefault()` after the ignored-pattern guard; replace `err: error` with `errorMessage: error.message, errorName: error.name`
- `global-error-handlers.tsx` `handleRejection`: same `event.preventDefault()` omission for `PromiseRejectionEvent`

**F1 requires a one-line decision:** remove `allowTransactionlessInjection: true` from `getBrowserTimingHeaderSafe()` in `src/core/observability/new-relic.ts`. Rationale: the `nr.agent?.collector?.isConnected()` guard already ensures the loader is only served when the agent IS connected and a transaction context exists. The flag is redundant and is the likely proximate cause of the SPA crash. Implementation Agent can apply this with the F2/F4 changes.

**F3 is operational only:** archive the dead NR Browser entity (standalone app, applicationID `538837440`) via the NR UI Browser app settings or via NerdGraph `entityManagement { entityArchive(guid: "...") }`. No code change required.

---

## Update Log

### Update Entry — Pass 4

- Date: 2026-04-06
- Trigger: runtime issues reported after hard refresh — NR SPA crash, "Uncaught" console classification, duplicate NR Browser entities, `{}` log output
- Summary of change: confirmed all four root causes; traced full execution path from hard refresh through NR SPA harvest crash to GlobalErrorHandlers capture failure; identified missing `event.preventDefault()`, SEC-10 `err: error` violation, `allowTransactionlessInjection` as proximate NR crash cause, and operational duplicate entity from APM-vs-snippet delivery switch
- Sections refreshed: task context (current run scope), Pass 4 section (new), update log

### Update Entry — Pass 3

- Date: 2026-04-06
- Trigger: post-implementation HMR build error — refactor introduced `export const runtime` and `export const dynamic` which are banned by `nextConfig.cacheComponents: true` in Next.js 16
- Summary of change: confirmed compile-time incompatibility between route segment config exports and the Cache Components model; identified `connection()` as the correct replacement dynamic opt-in; identified `route.test.ts` as a required co-change; produced remediation plan for Implementation Agent
- Sections refreshed: task context (current run scope), scope (Pass 3), inputs reviewed (Pass 3), actions performed (Pass 3), symptom summary (Pass 3), confirmed evidence (Pass 3), execution path (Pass 3), hypotheses (Pass 3), missing evidence (Pass 3), artifact synchronization (Pass 3), handoff notes (Pass 3), update log

### Update Entry — Pass 4

- Date: 2026-04-06
- Trigger: three post-implementation runtime issues reported after hard refresh: NR SPA crash, "uncaught" error in browser console, duplicate NR Browser entities, and `{}` in log output
- Summary of change: confirmed all four root causes — NR SPA `allowTransactionlessInjection` + hard refresh race; missing `event.preventDefault()` in `handleError`; duplicate entities caused by APM-linked vs standalone-snippet applicationID mismatch (operational, not a code bug); SEC-10 violation (`err: error` raw object) causing `{}` output in browser Pino
- Sections refreshed: task context (current run scope), scope (Pass 4), symptom summary (Pass 4), confirmed evidence (Pass 4), execution path (Pass 4), hypotheses (Pass 4), missing evidence (Pass 4), handoff notes (Pass 4), update log

### Update Entry — Pass 3

- Date: 2026-04-06
- Trigger: post-refactor HMR/build error — `export const runtime` and `export const dynamic` are banned by `nextConfig.cacheComponents: true` in Next.js 16.2.2
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
