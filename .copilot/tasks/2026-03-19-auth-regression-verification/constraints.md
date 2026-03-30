# Constraints

## Auth-Flow Constraints

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` is normative for auth/bootstrap/onboarding behavior
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` is the mandatory verification checklist for affected auth-flow scenarios
- DB remains the source of truth for onboarding completion
- any onboarding cookie is a routing hint only, never business truth
- cookie mutation must occur only in Route Handlers or Server Actions
- `src/proxy.ts` is the runtime entrypoint for middleware-equivalent request interception in this repository

## Workflow Constraints

- do not invent requirements beyond the supplied task package and repository evidence
- do not broaden this into unrelated implementation or refactor work
- use only the specialist steps justified by actual task evidence
- do not treat the task as complete without explicit scenario mapping and status reporting
- runners must stay reusable and not be hardcoded only for this auth regression task
- existing canonical Clerk fixture env names must remain the source of truth unless an explicit repo-wide refactor is approved
- preserve the current PGlite scenario flow while adding container-backed execution behind the same universal runner entrypoint
- do not create a second task-specific scenario command tree when backend branching inside the universal runner is sufficient
- for rerunnable auth-regression execution, do not depend on a permanently preserved onboarding-incomplete DB state across runs; prefer reusable identity plus deterministic in-run setup

## Validation Constraints

- start from the minimum required scenario set defined by the task and matrix
- prefer targeted browser verification over full-suite execution unless broader scope is justified
- record PASS / FAIL / DEFERRED / BLOCKED per affected scenario or scenario group
- use `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md` for the Playwright run artifact
- execute scenario groups sequentially; do not start the next group until the current one is classified
- for this workflow, authoritative regression evidence should come from browser-real interaction, not only helper-assisted sign-in shortcuts
- local execution should use an automated container-backed backend when the selected runner mode requires a real containerized database
- switching between runner backends/modes should be controlled by E2E_BACKEND_MODE=pglite|container, not by duplicating scripts per task
- when `E2E_BACKEND_MODE=container`, the E2E workflow must stay fully separated from dev runtime and use only the test DB profile (`5433/app_test`)
- runner alignment validation must confirm both modes: `pglite` remains intact and `container` uses the isolated test DB lifecycle

## Runtime And Evidence Constraints

- runtime observations must distinguish verified behavior from inferred behavior
- evidence should include final routes, key logs, and cookie/network traces where relevant
- if ambiguity prevents safe execution, escalate to `06 - Debug Investigation` before continuing
- helper-based probes may be used as supporting diagnostics, but not as the sole evidence for the main manual-simulation regression path
- the runner should be able to operate locally and later in CI/CD with the same high-level flow, differing only by environment-driven mode selection
