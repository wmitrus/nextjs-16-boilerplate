# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-04-18-eslint-security-signal`
- Task Objective: Determine which recurring Codacy findings can be shifted left into local ESLint without recreating Codacy noise inside the editor.
- Current Run Scope: Architecture review for local lint-layer shape, blast radius, and repository fit.
- Status: COMPLETED
- Last Updated: 2026-04-18
- Related Control Artifacts: `plan.md`, `intake.md`, `implementation-plan.md`, `validation-report.md`

## Scope Handled

- modules / layers reviewed: ESLint flat config, scripts tooling surface, E2E helpers, representative `src/**` hotspots
- change surface reviewed: lint-layer only; no production runtime behavior redesign
- architecture questions in scope: whether Codacy findings should be mirrored 1:1 in ESLint, where repo-specific lint belongs, and how to keep blast radius low

## Inputs Reviewed

- code paths reviewed: `eslint.config.mjs`, `scripts/check-e2e-auth-env.mjs`, `scripts/leantime/deploy-plugin.ts`, `scripts/leantime/catalog.ts`, `e2e/provisioning-runtime.spec.ts`, `src/core/logger/utils.ts`
- docs / ADRs / prompts reviewed: `AGENTS.md`, `docs/ai/general/REPOSITORY_AI_CONTEXT.md`, `docs/ai/general/SECURITY_CODING_PATTERNS.md`
- earlier task artifacts reviewed: `.copilot/tasks/2026-04-18-codacy-check-plan/triage-warning.md`, `.copilot/tasks/2026-04-18-codacy-check-plan/scope-review.md`, current task `plan.md` and `intake.md`

## Actions Performed

- repository inspection performed: compared remaining Codacy warning families against resolved local ESLint config and representative hotspots
- boundary checks performed: separated `src/**` false-positive-heavy patterns from tooling-oriented patterns in `scripts/**` and `e2e/**`
- dependency / DI review performed: confirmed no DI or module-boundary changes are needed for the proof-of-signal layer
- docs-vs-code checks performed: aligned the lint strategy with existing security pattern docs instead of inventing a parallel governance system

## Current-State Findings

- Confirmed: off-the-shelf local ESLint already loads `security/*` rules, but that does not reproduce the current Codacy warning set in a useful 1:1 way.
- Risks: mirroring `security/detect-object-injection` or `security/detect-non-literal-fs-filename` broadly into local lint would recreate a large false-positive burden, especially in safe-map and sink-confined patterns already accepted in the repo.
- Drift: Codacy warning IDs suggest ESLint parity, but the practical signal differs because of inline suppressions, rule behavior, and scanner noise.

## Boundary And Dependency Assessment

- module ownership assessment: local lint policy belongs in `eslint.config.mjs`; no module ownership changes are justified.
- dependency direction assessment: repo-specific signal should constrain tooling surfaces first (`scripts/**`, selected `e2e/**`) before touching `src/**`.
- DI / composition assessment: not applicable to the chosen change surface.
- cross-module coupling assessment: a narrow lint override has low coupling; broad AST bans across `src/**` would create cross-module churn without proportional security value.

## Architectural Decisions / Constraints

- approved architectural constraints: use low-blast-radius, repo-specific lint only for recurring patterns with stable AST signal and acceptable local noise.
- rejected directions: do not attempt 1:1 migration of all remaining Codacy warnings into ESLint; do not add broad `src/**` rules for current false-positive-heavy families.
- follow-up architectural guardrails: keep Codacy as the backstop scanner, use ESLint only for selected high-signal subsets, and document accepted false-positive patterns in AI/security docs.

## Artifact Synchronization

- `plan.md` updates: checklist advanced to completed for architecture review, prototype, diagnostics, and rollout plan
- `intake.md` updates: readiness checklist advanced after prototype and diagnostics evidence
- `implementation-plan.md` updates: rollout phases and metrics recorded
- specialist artifact updates: created this summary artifact

## Open Questions / Blockers

- unresolved questions: whether a third high-signal subset beyond dynamic env access and fs sink visibility is worth adding now
- blockers: no off-the-shelf regex rule produced actionable diagnostics for the current Codacy `unsafe-regex` set
- evidence still needed: future PR data to prove the shift-left layer actually reduces review noise

## Handoff Notes

- what the next agent should rely on: the chosen strategy is selective shift-left, not Codacy parity
- what should not be re-decided without new evidence: broad `src/**` object-injection or fs-path lint expansion remains unjustified
- recommended next specialist or step: implementation/validation summary and later docs propagation once the rollout is approved

## Update Log

### Update Entry

- Date: 2026-04-18
- Trigger: Architecture review after ESLint-vs-Codacy feasibility spike and second-signal rollout
- Summary of change: Approved narrow local lint for dynamic env access and fs sink visibility, while rejecting broad 1:1 Codacy mirroring
- Sections refreshed: all
