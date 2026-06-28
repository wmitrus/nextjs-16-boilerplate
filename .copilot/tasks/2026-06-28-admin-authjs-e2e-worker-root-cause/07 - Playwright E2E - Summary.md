# 07 - Playwright E2E - Summary

## Task Context

- Task ID: `2026-06-28-admin-authjs-e2e-worker-root-cause`
- Task Objective: verify safe authenticated-session reuse for steady-state E2E scenarios, preserve interactive auth/bootstrap/onboarding flows where semantics require them, and leave durable browser-proof evidence
- Current Run Scope: focused `e2e/provisioning-runtime.spec.ts` option-1 slice in Clerk single-tenant mode after session-reuse classification and contract-alignment fixes
- Status: COMPLETED
- Last Updated: 2026-06-28
- Related Control Artifacts:
  - `plan.md`
  - `intake.md`
  - `implementation-plan.md`
  - `validation-report.md`

## Scope Handled

- scenarios in scope:
  - `single mode: direct visit to /users after recreating incomplete state`
  - `single mode: direct visit to /users after onboarding completion stays allowed`
  - `single mode: middleware reads onboarding cookie`
  - `single mode: DB incomplete state still routes to onboarding`
  - `single mode: DB complete state remains authoritative even if the onboarding cookie is stale`
  - `single mode: completed-user /users load stays stable`
  - `single mode: refresh on /users keeps a completed user on the app route`
  - `single mode: hostile redirect_url is sanitized server-side to /dashboard before bootstrap completes`
  - `single mode: direct visit to /onboarding after onboarding completion redirects to /dashboard`
- browser / project in scope: Playwright Chromium
- environment or runtime mode in scope: `AUTH_PROVIDER=clerk`, `E2E_BACKEND_MODE=container`, isolated DB `127.0.0.1:5433/app_test`

## Inputs Reviewed

- scenario or matrix sources reviewed:
  - `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
  - `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
  - `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- task artifacts reviewed:
  - `plan.md`
  - `intake.md`
  - `implementation-plan.md`
  - `validation-report.md`
- runtime / env notes reviewed:
  - `src/app/onboarding/layout.tsx`
  - `src/app/auth/post-auth-redirect.ts`
  - `src/app/api/me/provisioning-status/route.ts`

## Actions Performed

- browser checks executed:
  - reran the narrowed single-mode provisioning-runtime slice after helper and expectation corrections
- commands run:
  - `pnpm lint --fix e2e/provisioning-runtime.spec.ts`
  - `node scripts/e2e/run-scenario.mjs single -- e2e/provisioning-runtime.spec.ts --project=chromium --reporter=line --workers=16 --grep "direct visit to /users after recreating incomplete state|direct visit to /users after onboarding completion stays allowed|middleware reads onboarding cookie|DB incomplete state still routes to onboarding|DB complete state remains authoritative|completed-user /users load stays stable|refresh on /users keeps a completed user|hostile redirect_url is sanitized|direct visit to /onboarding after onboarding completion redirects to /dashboard"`
- evidence captured:
  - failing run showing stale `internalTenantId` expectation against a live `/api/me/provisioning-status` response that uses `internalOrganizationId`
  - failing run showing completed-user hostile `redirect_url` sanitization lands on `/dashboard`, not `/users`
  - final green rerun with `8 passed`
- retries or setup steps performed:
  - repeated container-backed DB reset/migrate/seed cycle via scenario runner

## Preconditions

- environment readiness: Clerk E2E fixture vars present; container test DB reachable and reseeded by scenario runner
- account readiness: single-mode Clerk test users provisioned through existing E2E helpers
- runtime readiness: Next.js dev runtime and provisioning routes available during focused run
- deviations from expected setup:
  - Podman reports `nextjs16_test_db` name already in use before starting the existing container; scenario runner recovers by starting the existing container and continues successfully

## Scenario Status Mapping

- scenario IDs executed:
  - auth-matrix-phase3
  - auth-matrix-phase5
  - auth-matrix-phase6
- PASS results:
  - all 8 executed focused scenarios passed on final rerun
- FAIL results:
  - none on final rerun
- DEFERRED / BLOCKED results:
  - interactive sign-in/bootstrap/onboarding scenarios remain intentionally outside this storage-state optimization slice

## Observed Results

- final URLs:
  - completed-user post-onboarding direct `/onboarding` access settles on `/dashboard`
  - completed-user hostile `redirect_url` sanitization settles on `/dashboard`
  - completed-user steady-state `/users` access remains stable
  - incomplete-user direct `/users` access still routes to onboarding
- key route or UI observations:
  - `/api/me/provisioning-status` contract uses `internalOrganizationId`, not `internalTenantId`
  - completed-user default app entry is `/dashboard`, not `/users`
  - steady-state storage reuse is safe only for already-settled states; interactive auth/bootstrap/onboarding semantics still require native flow setup
- network / cookie observations:
  - stale onboarding cookie does not override completed DB state
  - onboarding cookie checks remain scenario-specific and were not generalized into shared-session coverage beyond safe steady-state assertions
- runtime log correlation:
  - final green slice required no additional runtime fixes beyond test-contract alignment

## Evidence Collected

- trace references:
  - none captured for the final green rerun
- report references:
  - terminal line reporter output from the final scenario-runner execution showing `8 passed (36.8s)`
- screenshot references:
  - prior failure snapshot confirmed `/users` UI visibility while the helper still failed on stale `internalTenantId`
- log references:
  - `test-results/provisioning-runtime-Provi-b33f2-pp-route-auth-matrix-phase5-chromium/error-context.md`

## Artifact Synchronization

- `plan.md` updates:
  - none; root-cause task plan already marked complete
- `intake.md` updates:
  - none; intake remained accurate for the root-cause task framing
- `implementation-plan.md` updates:
  - refreshed to record Phase 2 option-1 classification outcome and safe final scope
- specialist artifact updates:
  - created this persistent Playwright summary artifact
  - refreshed `validation-report.md` with the final focused provisioning-runtime verification

## Gaps / Blockers

- scenarios not run:
  - broader personal-mode and org-mode provisioning-runtime scenarios were not rerun in this final focused pass
  - interactive auth/bootstrap/onboarding cases were intentionally excluded from storage-state reuse validation
- blockers:
  - none for the focused single-mode option-1 slice
- evidence limitations:
  - this proof is deliberately narrow; it signs off the chosen steady-state subset, not the entire provisioning-runtime matrix

## Handoff Notes

- what the next agent should rely on:
  - session reuse is safe only for steady-state scenarios whose subject begins after auth/bootstrap/onboarding has already settled
  - completed-user default entry expectations in this repo should be keyed to `/dashboard`
  - provisioning-status assertions in E2E should follow `internalOrganizationId`
  - `docs/usage/05 - Playwright E2E Architecture.md` is now the repository source of truth for suite placement, fixture-model choice, helper ownership, and runtime-profile mapping when adding or refactoring E2E coverage
- what remains unverified:
  - any future expansion of reusable-session coverage beyond the current subset
- recommended next specialist or step:
  - implementation or validation work should preserve the documented fixture decision rule rather than reintroducing blanket auth setup changes

## Update Log

### Update Entry

- Date: 2026-06-28
- Trigger: finalize option-1 focused provisioning-runtime verification after contract-alignment fixes
- Summary of change: documented the final green browser proof, recorded the stable safe scope for steady-state session reuse, and captured the route-contract corrections that were required to make the slice truthful
- Sections refreshed:
  - all

### Update Entry

- Date: 2026-06-28
- Trigger: harden repository docs and agent instructions so future E2E implementation follows the same architecture and fixture rules
- Summary of change: added `docs/usage/05 - Playwright E2E Architecture.md` and wired it into `AGENTS.md`, the shared Playwright agent prompt, Copilot agent, Codex skill, validation prompt, workflow doc, and description guides
- Sections refreshed:
  - Handoff Notes
  - Update Log
