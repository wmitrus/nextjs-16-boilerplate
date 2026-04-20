# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-04-18-eslint-security-signal`
- Task Objective: Determine why the last remaining Playwright security scenario returns `403` for the "correct internal API key" path.
- Current Run Scope: Evidence-first investigation of the failing `e2e/security.spec.ts` scenario without applying a fix.
- Status: COMPLETED
- Last Updated: 2026-04-18
- Related Control Artifacts: `plan.md`, `validation-report.md`, `04 - Implementation Agent - Summary.md`

## Scope Handled

- symptom or flow investigated: `e2e/security.spec.ts` scenario `should allow internal API access with correct key`
- runtime surfaces investigated: Playwright test process, Playwright `webServer` env injection, `src/proxy.ts`, `src/security/middleware/with-internal-api-guard.ts`, `src/core/env.ts`
- env or timing questions investigated: whether the test and the server resolve `INTERNAL_API_KEY` from the same source of truth

## Inputs Reviewed

- code paths reviewed: `e2e/security.spec.ts`, `playwright.config.ts`, `src/proxy.ts`, `src/security/middleware/with-internal-api-guard.ts`, `src/security/middleware/route-classification.ts`, `src/core/env.ts`, `scripts/load-env.ts`
- logs / diagnostics reviewed: prior Playwright failure output (`Expected: 200, Received: 403`), shell env check, targeted Playwright rerun with explicit `INTERNAL_API_KEY`
- tests / task artifacts reviewed: `validation-report.md`, `plan.md`, `04 - Implementation Agent - Summary.md`

## Actions Performed

- reproduction attempts performed: reviewed the previously failing `pnpm exec playwright test e2e/home.spec.ts e2e/security.spec.ts --project=chromium` result and re-ran only the failing security scenario under a controlled env override
- execution-path tracing performed: traced request flow from `e2e/security.spec.ts` request fixture through `src/proxy.ts` into `withInternalApiGuard()` and the route classification path
- source-of-truth tracing performed: compared how the spec resolves `INTERNAL_API_KEY` versus how Playwright `webServer.env` sets `INTERNAL_API_KEY` for the dev server
- evidence collection performed: verified the current shell has no `INTERNAL_API_KEY`; verified the failing scenario passes when `INTERNAL_API_KEY=test-internal-api-key` is set on the parent process before launching Playwright

## Symptom Summary

- observed symptom: the E2E scenario expecting `200` from `/api/internal/health` with the “correct” key returned `403`
- where it surfaces: `e2e/security.spec.ts`
- reproducibility: reproducible under the prior default local Playwright run; disappears when the same explicit `INTERNAL_API_KEY` is provided to both the Playwright process and the `webServer`
- trigger conditions: parent shell lacks `INTERNAL_API_KEY`, while the spec falls back to reading `.env.local` manually

## Confirmed Evidence

- code facts: `e2e/security.spec.ts` resolves the header value from `process.env.INTERNAL_API_KEY`, then `.env.local`, then fallback `test-internal-api-key`; `playwright.config.ts` sets `webServer.env.INTERNAL_API_KEY` to `process.env.INTERNAL_API_KEY ?? 'test-internal-api-key'`
- runtime evidence: current shell reported `shellHasInternalApiKey: false`; targeted rerun with `INTERNAL_API_KEY=test-internal-api-key pnpm exec playwright test e2e/security.spec.ts --project=chromium --grep "correct key"` passed
- diagnostics or logs: guard code in `withInternalApiGuard()` returns `403` whenever request header does not match `env.INTERNAL_API_KEY`; no evidence points to route-classification failure or bypass

## Execution Path

- entry point: `e2e/security.spec.ts` uses Playwright `request.get('/api/internal/health', { headers: { 'x-internal-key': internalApiKey } })`
- critical path: Playwright spec resolves a key -> Playwright `webServer` launches `pnpm dev` with explicit env -> request reaches `src/proxy.ts` -> `withInternalApiGuard()` compares header to `env.INTERNAL_API_KEY` -> route handler returns JSON only if the values match
- state transitions: parent shell env missing key -> `webServer` gets fallback `test-internal-api-key` -> spec independently reads `.env.local` value -> mismatch causes `403`
- failure boundary: mismatch at `withInternalApiGuard()` comparison boundary, not at route classification or route handler logic

## Hypotheses And Failure Points

- likely failure points: divergent key source between Playwright test process and Playwright `webServer`
- hypotheses: the spec and the server use different `INTERNAL_API_KEY` values under local runs unless the parent shell exports the key explicitly
- disproven possibilities: inline-comment parsing drift in `.env.local` for the current local file; internal route classification failure; missing guard invocation

## Missing Evidence / Uncertainty

- what remains unclear: whether the preferred long-term fix should make the spec use the same source of truth as `webServer`, or make `webServer` stop overriding the dev server key when `.env.local` already provides one
- what evidence would reduce uncertainty fastest: one focused design decision about whether E2E should trust process env only, repo env-file parsing only, or a shared helper
- external dependencies or blockers: none for diagnosis; implementation choice still open

## Artifact Synchronization

- `plan.md` updates: not required for task direction; the investigation confirms the remaining red scenario is env-source drift, not unexplained runtime instability
- `intake.md` updates: none
- `implementation-plan.md` updates: none
- specialist artifact updates: created this summary artifact

## Handoff Notes

- what the next agent should rely on: the remaining failing Playwright scenario is explained by a test/server config mismatch, not by a proven bug in `withInternalApiGuard()`
- what remains unproven: the smallest preferred fix location
- recommended next specialist or step: implementation should align the spec and `webServer` on one shared `INTERNAL_API_KEY` source of truth, then rerun the focused security Playwright scenario

## Update Log

### Update Entry

- Date: 2026-04-18
- Trigger: User requested investigation of the last failing Playwright security test
- Summary of change: Traced the failure to divergent `INTERNAL_API_KEY` sources between the spec and Playwright `webServer`; confirmed by rerunning the single scenario with an explicit shared env value
- Sections refreshed: all
