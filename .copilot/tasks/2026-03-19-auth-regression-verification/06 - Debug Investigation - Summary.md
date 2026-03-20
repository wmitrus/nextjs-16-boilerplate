# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-03-19-auth-regression-verification`
- Task Objective: classify the paused Phase 1 fresh-user failures before continuing the auth regression workflow
- Current Run Scope: AF-01 sign-up failure triage plus post-onboarding redirect contract triage
- Status: COMPLETED
- Last Updated: 2026-03-20
- Related Control Artifacts: `plan.md`, `intake.md`, `implementation-plan.md`, `07 - Playwright E2E - Summary.md`

## Scope Handled

- symptom or flow investigated: interactive `/sign-up` -> Clerk verification -> bootstrap handoff, and fresh-user bootstrap -> onboarding -> post-submit landing
- runtime surfaces investigated: Clerk hosted sign-up, app bootstrap route, onboarding form submission, onboarding server action redirect behavior
- env or timing questions investigated: whether the observed AF-01 stall occurred before any app-owned bootstrap request and whether redirect preservation is implemented end-to-end in the browser onboarding flow

## Inputs Reviewed

- code paths reviewed: `e2e/auth.spec.ts`, `e2e/provisioning-runtime.spec.ts`, `src/app/layout.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx`, `src/app/auth/bootstrap/start/route.ts`, `src/app/onboarding/onboarding-form.tsx`, `src/app/onboarding/actions.ts`, `src/app/users/layout.tsx`, `src/security/middleware/with-auth.ts`, `scripts/e2e/env/base.env`
- logs / diagnostics reviewed: Playwright failure context for AF-01, Playwright failure context for the redirect-preservation assertion, runner DB reset/migrate/seed logs
- tests / task artifacts reviewed: `plan.md`, `intake.md`, `implementation-plan.md`, `07 - Playwright E2E - Summary.md`, auth-flow docs and matrix

## Actions Performed

- reproduction attempts performed: analyzed the two targeted Phase 1 reproductions already executed by Playwright E2E; attempted one fresh AF-01 rerun but it did not add evidence because Playwright found port 3000 already in use before browser execution
- execution-path tracing performed: traced the expected sign-up redirect path from Clerk provider config through `/auth/bootstrap/start`, and traced onboarding submission from browser form to server action redirect
- source-of-truth tracing performed: compared Phase 1 browser observations against `docs/feature-desings/02 - Auth Regression Tests.md` and `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- evidence collection performed: identified exact failure boundary for AF-01 and exact code path that drops `redirect_url` on browser onboarding submit

## Symptom Summary

- observed symptom: AF-01 timed out on Clerk verify-email instead of reaching `/auth/bootstrap/start`; the fresh-user onboarding run ended on `/users` instead of `/app/dashboard`
- where it surfaces: `e2e/auth.spec.ts` interactive sign-up test and `e2e/provisioning-runtime.spec.ts` fresh-user onboarding test
- reproducibility: observed once each in targeted container-backed Chromium runs; AF-01 remained unresolved after initial evidence review
- trigger conditions: AF-01 depends on hosted Clerk sign-up plus verification completion; redirect mismatch occurs after onboarding form submission with `redirect_url=/app/dashboard` in the bootstrap entry URL

## Confirmed Evidence

- code facts: Clerk provider config forces sign-in and sign-up through bootstrap; bootstrap preserves safe redirect targets into onboarding; onboarding server action honors `redirect_url` only if submitted; onboarding browser form does not submit `redirect_url`
- runtime evidence: AF-01 never showed an app-owned bootstrap request and remained inside Clerk verify-email UI; the fresh-user onboarding run rendered a stable `/users` page with authenticated UI after submission
- diagnostics or logs: Playwright recorded AF-01 timeout waiting for `/auth/bootstrap/start`; Playwright recorded the redirect-preservation assertion failure because the browser settled on `/users`

## Execution Path

- entry point: `/sign-up` for AF-01 and `/auth/bootstrap/start?redirect_url=/app/dashboard` for the redirect investigation
- critical path: Clerk sign-up completion -> Clerk session establishment -> bootstrap route -> onboarding -> onboarding server action redirect
- state transitions: AF-01 stalled before session handoff into bootstrap; redirect investigation reached onboarding, submitted successfully, and then redirected through the server action fallback to `/users`
- failure boundary: AF-01 failure boundary is still within Clerk verification; redirect mismatch failure boundary is after onboarding submit, at final redirect selection

## Hypotheses And Failure Points

- likely failure points: Clerk verification automation in the interactive sign-up harness; stale or over-strong `/app/dashboard` expectation in the provisioning spec; secondary product-code drift where browser onboarding does not preserve custom `redirect_url`
- hypotheses: AF-01 is likely harness issue; redirect mismatch is likely stale test expectation for this workflow, with a separate code drift around optional redirect preservation
- disproven possibilities: no evidence currently points to a broken app-side bootstrap redirect path for AF-01 because the app path was never entered; no evidence currently shows `/users` post-onboarding landing violates the documented auth regression contract

## Missing Evidence / Uncertainty

- what remains unclear: whether AF-01 is caused by unsupported Clerk test-instance verification behavior or just flaky verification automation; whether arbitrary redirect preservation through onboarding is intended product behavior or merely latent server-action capability
- what evidence would reduce uncertainty fastest: manual sign-up against the same Clerk test instance; browser trace or network evidence showing whether Clerk completes verification and establishes session before the timeout; explicit product decision on whether onboarding must preserve arbitrary `redirect_url`
- external dependencies or blockers: Clerk hosted verification behavior is outside direct app ownership; Playwright web-server logs remain suppressed, limiting app-runtime correlation during browser runs

## Artifact Synchronization

- `plan.md` updates: pending orchestrator sync from this debug classification
- `intake.md` updates: pending orchestrator sync from this debug classification
- `implementation-plan.md` updates: pending orchestrator sync from this debug classification
- specialist artifact updates: created this summary artifact for the Phase 1 debug triage step

## Handoff Notes

- what the next agent should rely on: AF-01 is more likely a Clerk verification harness problem than an app bootstrap regression; user direction confirmed `/users` as the authoritative landing contract, so the stronger `/app/dashboard` assertion in the provisioning spec is stale for this workflow
- what remains unproven: whether arbitrary redirect preservation is intended for browser onboarding; whether AF-01 should remain in scope as authoritative interactive E2E without stronger Clerk verification support
- recommended next specialist or step: update the stale provisioning spec to the confirmed `/users` contract, rerun the corrected Phase 1 fresh-user case, and separately decide whether AF-01 should be reworked as a supported Clerk path or recorded as harness-blocked

## Update Log

### Update Entry

- Date: 2026-03-20
- Trigger: Phase 1 debug triage requested by the orchestrator after AF-01 and redirect-preservation failures
- Summary of change: classified AF-01 as likely harness-side Clerk verification instability, classified the `/app/dashboard` expectation as likely stale relative to the documented `/users` contract, and identified code drift where onboarding browser submit does not pass `redirect_url` to the server action
- Sections refreshed: all
