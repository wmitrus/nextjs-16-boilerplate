# 04 — Implementation Agent Summary

## Task Context

- Task ID: `2026-04-05-nr-browser-spa`
- Task Objective: deliver New Relic Browser SPA instrumentation safely in Next.js 16 and keep the deployment model compatible with Vercel env-var limits
- Current Run Scope: cacheComponents regression fix — remove banned route segment config exports, replace with `connection()` dynamic opt-in
- Status: COMPLETED
- Last Updated: 2026-04-06
- Related Control Artifacts: `plan.md`, `validation-report.md`, `01 - Architecture Guard - Summary.md`, `02 - Security & Auth - Summary.md`

## Scope Handled

- modules / files changed: `src/app/layout.tsx`, `src/app/observability/new-relic-browser.js/route.ts`, `src/app/observability/new-relic-browser.js/route.test.ts`, `src/core/observability/new-relic.ts`, `src/core/observability/new-relic.test.ts`, `.env.example`, `docs/features/26 - New Relic Server & Browser Integration.md`, `docs/features/ENV-requirements.md`, task artifacts in this folder
- implementation goals in scope: remove the oversized browser snippet env var from the primary Vercel deployment path, preserve layout prerender safety, keep a local/dev fallback for copied snippets, and document the correct operational model in the task workspace
- constraints applied: no client-bundle secret exposure, minimal blast radius, Next.js 16 Cache Components compatibility, preserve existing auth/proxy rules for real API routes, avoid Edge-only runtime assumptions

## Inputs Reviewed

- code paths reviewed: `src/app/layout.tsx`, `src/core/observability/new-relic.ts`, `src/proxy.ts`, `src/security/middleware/route-policy.ts`, `src/security/middleware/with-auth.ts`, `src/security/middleware/with-rate-limit.ts`, `src/core/env.ts`, `src/testing/infrastructure/env.ts`
- upstream specialist artifacts reviewed: architecture and security summaries in this task folder
- earlier implementation notes reviewed: existing implementation summary, validation report, debug investigation summary

## Actions Performed

- code changes made:
  - refactored `src/core/observability/new-relic.ts` to add `resolveBrowserAgentScriptSource()` and `getBrowserAgentScriptSafe()`
  - made the public browser-loader route prefer request-time `getBrowserTimingHeaderSafe()` generation and only fall back to `NEW_RELIC_BROWSER_SNIPPET` / `NEW_RELIC_BROWSER_SNIPPET_BASE64`
  - pinned `src/app/observability/new-relic-browser.js/route.ts` to `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`
  - simplified `src/app/layout.tsx` so browser injection depends only on `NEW_RELIC_ENABLED`, not on a giant snippet env var being present at build time
  - updated `.env.example` and feature docs to mark the env-backed snippet as local/dev fallback rather than the preferred hosted deployment path
  - synchronized the task control artifacts so the folder no longer recommends storing an 88 KB snippet in Vercel env vars
- tests or supporting files updated: `src/core/observability/new-relic.test.ts`, `src/app/observability/new-relic-browser.js/route.test.ts`, `.env.example`, docs, task artifacts
- focused validation executed: repo-preferred focused lint, targeted Vitest validation for the observability helper and public loader route

## Files Changed

- production files: `src/app/layout.tsx`, `src/app/observability/new-relic-browser.js/route.ts`, `src/core/observability/new-relic.ts`, `.env.example`
- test files: `src/app/observability/new-relic-browser.js/route.test.ts`, `src/core/observability/new-relic.test.ts`
- docs / artifact files: `docs/features/26 - New Relic Server & Browser Integration.md`, `docs/features/ENV-requirements.md`, `.copilot/tasks/2026-04-05-nr-browser-spa/04 - Implementation Agent - Summary.md`, `.copilot/tasks/2026-04-05-nr-browser-spa/plan.md`, `.copilot/tasks/2026-04-05-nr-browser-spa/validation-report.md`

## Behavior Change Summary

- previous behavior:
  - the task narrative and docs still treated `NEW_RELIC_BROWSER_SNIPPET` / `_BASE64` as the normal deployment path
  - the browser loader route served only env-backed snippet content
  - Vercel deployment ergonomics depended on storing the full snippet in env vars, which breaks once the snippet exceeds the documented 64 KB per-variable ceiling
- new behavior:
  - layout loads a public script URL at `/observability/new-relic-browser.js`
  - the route returns JavaScript directly and is not treated as a protected API route by the proxy matcher
  - the route now prefers request-time runtime generation from the Node New Relic agent
  - the env-backed snippet remains as a fallback path only, mainly for local/dev compatibility
  - when New Relic is disabled or no browser loader resolves, the route degrades to an empty JavaScript asset
  - the Vercel deployment model no longer requires the 88,088-character snippet to fit into environment variables
- intentional non-changes:
  - auth and rate-limit policies for actual API routes were not widened
  - the local env-backed snippet fallback was not removed
  - no additional broad test surface was added

## Deployment Answer

This section is the direct answer for the Vercel/env-var issue that triggered this run.

### Diagnosis

- The observed browser snippet size was `88,088` characters.
- Vercel documents a total `64 KB` environment-variable budget per deployment for Node runtimes, and no single variable can be larger than that budget.
- Vercel also documents a `5 KB` per-variable limit for Edge Functions and Middleware.
- Therefore the full New Relic copy/paste browser snippet is too large to use as a normal Vercel env var.

### Why the previous design was not a good long-term fit

- The repo had already moved browser delivery behind a public `.js` route, which centralized the concern correctly.
- The remaining problem was storage: using a giant server-side env var as the primary transport was operationally fragile on Vercel.
- Even if the dashboard UI were bypassed with the API or CLI, the documented per-variable limits still apply.

### Professional recommendation

- Do **not** use `NEW_RELIC_BROWSER_SNIPPET` or `NEW_RELIC_BROWSER_SNIPPET_BASE64` as the primary hosted deployment mechanism on Vercel.
- Use the public Node route as the stable delivery boundary and generate the browser loader at request time from the Node agent.
- Keep the env-backed snippet only as an optional local/dev fallback, where `.env.local` transport is still practical.

### Repo design after this refactor

- `layout.tsx` loads `/observability/new-relic-browser.js` whenever `NEW_RELIC_ENABLED=true`.
- `/observability/new-relic-browser.js` is explicitly `nodejs` and `force-dynamic`.
- `getBrowserAgentScriptSafe()` prefers runtime `getBrowserTimingHeaderSafe()` generation.
- If the agent is unavailable, the helper falls back to `NEW_RELIC_BROWSER_SNIPPET_BASE64` / `NEW_RELIC_BROWSER_SNIPPET`.
- If nothing resolves, the route returns an empty JS asset safely.

### Operational guidance

- For Vercel deployments:
  - set `NEW_RELIC_ENABLED=true`
  - keep the Node New Relic agent configured as before
  - do not try to upload the full 88 KB snippet into project env vars
- For local development only:
  - `NEW_RELIC_BROWSER_SNIPPET_BASE64` remains the preferred fallback transport in `.env.local`
  - `NEW_RELIC_BROWSER_SNIPPET` remains a compatibility fallback when raw transport is safe

### Verified external sources

- Vercel env limits: <https://vercel.com/docs/projects/environment-variables>
- Vercel env management CLI: <https://vercel.com/docs/cli/env>
- New Relic browser installation options: <https://docs.newrelic.com/docs/browser/browser-monitoring/installation/install-browser-monitoring-agent/>

## Implementation Decisions / Constraints

- implementation choices made:
  - used a non-API `.js` route rather than adding another public API exception
  - kept all New Relic-specific logic in the observability facade
  - used request-time Node generation as the primary hosted deployment path
  - kept env-backed snippet sourcing as a fallback to avoid breaking existing local workflows
  - used `next/script` with `beforeInteractive` to preserve early loader execution without inline HTML injection
  - used an empty script response for the disabled path because it matches the asset semantics better than a failing no-content strategy in the prerender build path
- constraints preserved:
  - no `NEXT_PUBLIC_*` exposure of the raw snippet
  - no changes to proxy security policy beyond moving the script off the protected namespace
  - layout remains compatible with Next.js 16 prerender constraints by never calling `getBrowserTimingHeader()` there
  - route remains compatible with Cache Components by isolating dynamic behavior to the public JS route
- tradeoffs accepted:
  - script delivery is now one extra HTTP request instead of inline HTML, in exchange for lower hydration risk and cleaner interaction with proxy/auth rules
  - browser monitoring now depends more directly on the request-time Node agent being available

## Validation Performed

- commands run:
  - `pnpm lint --fix src/core/observability/new-relic.ts src/core/observability/new-relic.test.ts src/app/observability/new-relic-browser.js/route.ts src/app/observability/new-relic-browser.js/route.test.ts src/app/layout.tsx`
  - `pnpm exec vitest run src/core/observability/new-relic.test.ts src/app/observability/new-relic-browser.js/route.test.ts --config vitest.unit.config.ts --coverage.enabled=false`
- results:
  - focused lint passed
  - focused observability tests passed (`14` tests)
  - helper precedence is now covered explicitly
  - route runtime/dynamic configuration and empty-script degradation are covered explicitly
- validation not run:
  - no remote preview browser session was run from this environment
  - no New Relic dashboard ingestion verification after the request-time generation refactor
  - no full `pnpm build` rerun was executed in this follow-up pass
- residual risk from validation gaps:
  - preview-specific env or agent-connectivity behavior could still differ from local validation
  - the next highest-signal check is a preview deployment fetch of `/observability/new-relic-browser.js`

## Artifact Synchronization

- `plan.md` updates: aligned status and workflow narrative with the Vercel env-size follow-up and the new request-time Node delivery model
- `intake.md` updates: not present for this older task folder
- `implementation-plan.md` updates: not present for this older task folder
- specialist artifact updates: refreshed implementation summary and validation report after the env-size follow-up and route refactor

## Open Questions / Blockers

- unresolved questions: whether preview deployment now shows Browser SPA data in the NR dashboard after redeploy and whether the request-time loader always resolves from the agent in Vercel runtime
- blockers: none
- follow-up needed: confirm preview deployment after this patch and verify `/observability/new-relic-browser.js` plus Browser app ingest in New Relic UI

## Handoff Notes

- what the next agent should rely on: the public `.js` route is the intended stable delivery path for the Browser SPA loader; do not move it back under `/api/*` without also redesigning proxy exemptions
- residual risks for review: preview-only differences are now narrowed to deployment/env behavior and request-time New Relic agent availability
- recommended next specialist or step: none unless preview still fails after redeploy

## Update Log

### Update Entry

- Date: 2026-04-06
- Trigger: post-refactor HMR/build error — `export const runtime` and `export const dynamic` are banned by `nextConfig.cacheComponents: true` in Next.js 16.2.2
- Summary of change: removed both banned segment config exports from `route.ts`; added `await connection()` as first statement in `GET()` to opt into dynamic rendering via the established codebase pattern; updated `route.test.ts` to mock `next/server` with `importActual` (spreads real module, overrides `connection` only) and removed the now-deleted export assertions; all 3 tests pass; lint clean (pre-existing warnings only, zero errors)
- Sections refreshed: task context (current run scope), update log

### Update Entry

- Date: 2026-04-06
- Trigger: Vercel deployment follow-up revealed the browser snippet size (`88,088`) exceeds documented Vercel env-var limits
- Summary of change: replaced the env-backed snippet with a request-time Node loader as the primary hosted deployment path, kept env-backed transport as local/dev fallback only, and synchronized the task artifacts with the new deployment guidance
- Sections refreshed: task context, scope, actions, files changed, behavior summary, implementation decisions, validation, artifact synchronization, open questions, handoff notes

### Update Entry

- Date: 2026-04-05
- Trigger: preview branch hydration/runtime regression and CI secret-scan failure follow-up
- Summary of change: externalized the Browser SPA snippet to a public `.js` route, fixed the disabled preview-export path, hardened the NerdGraph CLI, validated both runtime and disabled-env build behavior, and synchronized artifact status
- Sections refreshed: all
