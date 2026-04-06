# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-04-05-nr-browser-spa`
- Task Objective: determine why preview deployment fails when New Relic env vars are not configured in Vercel and identify whether missing env vars are the root cause or only a trigger
- Current Run Scope: preview build failure investigation for `/observability/new-relic-browser.js`
- Status: COMPLETED
- Last Updated: 2026-04-06
- Related Control Artifacts: `plan.md`, `validation-report.md`, `04 - Implementation Agent - Summary.md`

## Scope Handled

- symptom or flow investigated: preview deploy build failure during static generation of `/observability/new-relic-browser.js`
- runtime surfaces investigated: App Router route handler prerender path, layout script-loader path, env-driven route branching
- env or timing questions investigated: behavior when `NEW_RELIC_ENABLED` is unset or explicitly false in preview/build environments

## Inputs Reviewed

- code paths reviewed: `src/app/observability/new-relic-browser.js/route.ts`, `src/app/layout.tsx`, `src/core/env.ts`, `src/core/observability/new-relic.ts`, `src/proxy.ts`
- logs / diagnostics reviewed: `logs/preview-deploy.log`, local `NEW_RELIC_ENABLED=false NEW_RELIC_BROWSER_SNIPPET= NEW_RELIC_BROWSER_SNIPPET_BASE64= pnpm build` reproduction
- tests / task artifacts reviewed: `validation-report.md`, `plan.md`

## Actions Performed

- reproduction attempts performed: reproduced the preview failure locally by forcing `NEW_RELIC_ENABLED=false` and clearing the snippet env vars during `pnpm build`
- execution-path tracing performed: traced build failure from preview log to the disabled branch in `src/app/observability/new-relic-browser.js/route.ts`
- source-of-truth tracing performed: verified that `NEW_RELIC_ENABLED` defaults to `false` in `src/core/env.ts` when not set in Vercel
- evidence collection performed: captured preview log lines, matching local build failure, and relevant code branches controlling the route

## Symptom Summary

- observed symptom: preview deployment fails during static generation with `TypeError: Response constructor: Invalid response status code 204`
- where it surfaces: build/prerender phase for `/observability/new-relic-browser.js`, not browser runtime request handling
- reproducibility: deterministic when `NEW_RELIC_ENABLED=false` or unset and no browser snippet is configured
- trigger conditions: route handler executes either of its “disabled / no snippet” branches and returns `new NextResponse('', { status: 204 })`

## Confirmed Evidence

- code facts:
  - `NEW_RELIC_ENABLED` defaults to `false` in `src/core/env.ts`
  - `src/app/observability/new-relic-browser.js/route.ts` returns `new NextResponse('', { status: 204 })` both when New Relic is disabled and when no snippet resolves
  - `src/app/layout.tsx` only references `/observability/new-relic-browser.js` when `env.NEW_RELIC_ENABLED && hasBrowserSnippetConfiguredSafe()` is true, but the route itself is still statically evaluated during build
  - `src/proxy.ts` is not the failing boundary in this incident; the route fails before runtime request handling
- runtime evidence:
  - local command `NEW_RELIC_ENABLED=false NEW_RELIC_BROWSER_SNIPPET= NEW_RELIC_BROWSER_SNIPPET_BASE64= pnpm build` fails with the same `Invalid response status code 204` error at `src/app/observability/new-relic-browser.js/route.ts:8`
- diagnostics or logs:
  - preview log shows `Error occurred prerendering page "/observability/new-relic-browser.js"`
  - preview log shows `TypeError: Response constructor: Invalid response status code 204`
  - preview log points directly to `return new NextResponse('', { status: 204, ... })`

## Execution Path

- entry point: preview build runs `pnpm build`, which enters static page and route prerender generation
- critical path:
  - Next.js prerenders `/observability/new-relic-browser.js`
  - route handler reads `env.NEW_RELIC_ENABLED`
  - env resolves to default `false` because Vercel vars were not set
  - handler enters the disabled branch and constructs `new NextResponse('', { status: 204 })`
- state transitions:
  - unset preview env -> `NEW_RELIC_ENABLED=false` by schema default
  - disabled state -> 204 branch selected
  - 204 branch -> invalid Response construction because a 204 response must not include a body
- failure boundary: `NextResponse` / `Response` construction in the route handler, before deploy completes

## Hypotheses And Failure Points

- likely failure points:
  - primary: invalid 204 response construction with an empty-string body in `src/app/observability/new-relic-browser.js/route.ts`
  - secondary artifact issue: `validation-report.md` currently overstates build success; that validation was not representative of the disabled-env path
- hypotheses:
  - missing Vercel New Relic env vars are the trigger because they force `NEW_RELIC_ENABLED=false`
  - the actual root cause is code-level handling of the disabled path, not the absence of the env vars themselves
- disproven possibilities:
  - this is not caused by the old `/api/*` auth interception issue; the failing path is the public `.js` route during prerender
  - this is not caused by missing `NEW_RELIC_BROWSER_SNIPPET` alone; with valid disabled-path handling, absence of the snippet should degrade cleanly instead of failing the build

## Missing Evidence / Uncertainty

- what remains unclear: whether any additional preview-only behavior exists after fixing the invalid 204 response shape
- what evidence would reduce uncertainty fastest: rerun preview build after changing the disabled/no-snippet branches to return a bodyless 204 response and confirm build completion
- external dependencies or blockers: none for root-cause confirmation; implementation agent can proceed directly

## Artifact Synchronization

- `plan.md` updates: not updated during this investigation pass
- `intake.md` updates: not present for this task folder
- `implementation-plan.md` updates: not present for this task folder
- specialist artifact updates: created `06 - Debug Investigation - Summary.md`; noted drift in `validation-report.md` but did not change implementation or validation artifacts in debug mode

## Handoff Notes

- what the next agent should rely on: root cause is the invalid `204` response body in `src/app/observability/new-relic-browser.js/route.ts`, triggered by `NEW_RELIC_ENABLED=false` defaulting in preview
- what remains unproven: whether the route should remain statically prerendered or be made dynamic is not resolved here; the minimal proven fix boundary is the response construction itself
- recommended next specialist or step: `04 - Implementation Agent` to change the disabled/no-snippet responses to a bodyless 204 and re-run `pnpm build` with `NEW_RELIC_ENABLED=false`

## Update Log

### Update Entry

- Date: 2026-04-06
- Trigger: preview deployment failed on `/observability/new-relic-browser.js` when Vercel New Relic env vars were not configured
- Summary of change: confirmed that missing env vars are only the trigger and that the real code defect is constructing `NextResponse('', { status: 204 })` in a statically prerendered route
- Sections refreshed: all
