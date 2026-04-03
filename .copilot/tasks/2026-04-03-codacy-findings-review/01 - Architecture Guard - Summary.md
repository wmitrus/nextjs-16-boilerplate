# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-04-03-codacy-findings-review`
- Task Objective: produce the scope review for the local Codacy findings artifact and set the repository review order before Security & Auth triage.
- Current Run Scope: Workflow Steps 2 and 5 — scope separation, noisy-path identification, repeated-rule review, Codacy scope-tuning recommendations, and control-artifact synchronization.
- Status: COMPLETED
- Last Updated: 2026-04-03
- Related Control Artifacts: `plan.md`, `intake.md`, `constraints.md`, `implementation-plan.md`, `scope-review.md`, `triage-error.md`, `triage-warning.md`, `rule-review.md`

## Scope Handled

- modules / layers reviewed: `src/app`, `src/core`, `src/features`, `src/modules`, `src/security`, `src/shared`, `e2e`, `scripts`, `tests`, `.vscode/extensions-dev`
- change surface reviewed: task artifacts only; no production code edits requested or performed
- architecture questions in scope: repository review ordering, scanner noise concentration, per-rule keep or scope decisions, and what should remain in the primary remediation queue

## Inputs Reviewed

- code paths reviewed: `src/security/rsc/data-sanitizer.ts`, `src/core/logger/edge.ts`, `src/shared/lib/api/with-action-handler.ts`, `scripts/codacy-analyze.mjs`
- docs / ADRs / prompts reviewed: `AGENTS.md`, `docs/ai/general/00 - Agent Interaction Protocol.md`, `docs/ai/general/REPOSITORY_AI_CONTEXT.md`, `docs/ai/general/SECURITY_CODING_PATTERNS.md`, `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md`, `docs/ai/templates/specialist-summaries/01 - Architecture Guard - Summary Template.md`
- earlier task artifacts reviewed: `plan.md`, `intake.md`, `constraints.md`, `implementation-plan.md`, `scope-review.md`, `triage-error.md`, `triage-warning.md`, `02 - Security & Auth - Summary.md`

## Actions Performed

- repository inspection performed: read the authoritative findings artifact, mapped all 103 findings into mutually exclusive code-area buckets, reviewed the repeated-rule breakdown from triage, and inspected representative runtime and script hotspots
- boundary checks performed: confirmed the major runtime hotspots still sit in expected ownership layers such as `src/security`, `src/core`, and `src/shared/lib`
- dependency / DI review performed: checked representative runtime files for boundary drift and found no reason to reorder repository priority away from runtime-first review
- docs-vs-code checks performed: verified the workflow priority rules align with the current repository structure and confirmed the main drift is scanner-default scope rather than repository documentation drift

## Current-State Findings

- Confirmed: the findings inventory separates into 14 security/auth runtime findings, 21 remaining production/runtime findings, 38 tests/E2E findings, 29 scripts/CLI findings, and 1 local tooling/dev-only finding; repeated-rule review supports keeping `security/detect-object-injection` and `security/detect-non-literal-fs-filename` for runtime-critical paths while demoting their low-signal test, E2E, and script lanes
- Risks: 68 of 103 findings sit outside production runtime (`tests/E2E + scripts + local tooling`), so the scanner output can dilute review focus unless the queue is explicitly separated by area; broad suppression of the two repeated security rules would also hide the remaining runtime-relevant hardening targets in bootstrap and logger code
- Drift: no doc-vs-code drift was identified for repository review order; the main drift is between Codacy default scope and repository ownership priorities, plus missing AI guidance for own-key accumulator patterns and helper-level fs confinement expectations

## Boundary And Dependency Assessment

- module ownership assessment: representative hotspots align with repository ownership boundaries, with sanitization under `src/security`, logging under `src/core`, and server-action wrappers under `src/shared/lib`
- dependency direction assessment: no evidence from the inspected scope-review samples suggests reverse dependency drift or cross-module import pressure that would change the workflow review order
- DI / composition assessment: no DI or composition-root change is implicated in this step; runtime logger and action-wrapper files remain architectural review targets, not exclusion candidates, and no rule decision here justifies moving responsibility out of those owning layers
- cross-module coupling assessment: the main architectural problem remains scanner noise concentration, not confirmed cross-module coupling; scope tuning should follow repository boundaries instead of flattening runtime and non-runtime paths into one queue

## Architectural Decisions / Constraints

- approved architectural constraints: keep security/auth runtime and remaining production/runtime paths in the primary Codacy review queue; keep `security/detect-object-injection` and `security/detect-non-literal-fs-filename` active for runtime-owning layers; treat tests/E2E, scripts, and local tooling as distinct lower-priority review lanes; allow rule demotion where findings are confined to test harnesses, Playwright assertions, local editor tooling, or repository-owned formatting drift
- rejected directions: do not exclude `src/security`, `src/core`, `src/modules`, `src/app`, or runtime-supporting `src/shared/lib` based only on repeated rule counts; do not disable the repeated security rules across the repository when latent runtime issues remain; do not spend remediation effort on `prettier/prettier`, `.vscode/extensions-dev`, or `tests/setup.tsx` as if they were architecture or runtime defects
- follow-up architectural guardrails: any future Codacy exclusion or demotion must be path-scoped and must not hide runtime security, auth, or shared server-path surfaces; AI instruction updates should stay narrowly tied to repository-safe patterns rather than normalizing all dynamic lookup or fs-path usage

## Artifact Synchronization

- `plan.md` updates: marked the shared Architecture Guard + Security & Auth rule-review step complete, checked the `rule-review.md` artifact, and advanced the next action toward remediation planning and later pattern-propagation review
- `intake.md` updates: marked rule review complete in the readiness checklist and added a rule-review snapshot capturing the keep, narrow, and demote decisions
- `implementation-plan.md` updates: marked Phase 5 complete and checked all repeated-rule review tasks
- specialist artifact updates: created `scope-review.md`, created `rule-review.md`, and updated this summary file

## Open Questions / Blockers

- unresolved questions: whether the repository wants to convert the two identified AI-guidance gaps into new or expanded `SEC-XX` entries during the later pattern-propagation step
- blockers: none for Architecture Guard rule review
- evidence still needed: remediation choice for the bootstrap lookup and logger helper, plus a final decision on whether the AI instruction gaps should become durable security-pattern updates

## Handoff Notes

- what the next agent should rely on: the 103-findings bucket split, the noisy-path inventory from `scope-review.md`, the triage landings in `triage-error.md` and `triage-warning.md`, and the per-rule keep or narrow decisions in `rule-review.md`
- what should not be re-decided without new evidence: runtime/security paths remain first-class review targets even though tests and scripts dominate raw finding volume; `.vscode/extensions-dev` and test harness mocks do not belong in the same remediation queue as repository runtime code; `security/detect-object-injection` and `security/detect-non-literal-fs-filename` should not be disabled repository-wide while runtime-relevant surfaces remain
- recommended next specialist or step: Implementation planning should translate the narrow runtime follow-up into `remediation.md`, after which Security & Auth can decide whether the AI-guidance gaps merit security-pattern propagation

## Update Log

### Update Entry

- Date: 2026-04-03
- Trigger: Workflow Step 2 Architecture Guard execution
- Summary of change: completed the scope split, identified noisy directories/files, recommended Codacy scope-tuning candidates, and synchronized the task control artifacts
- Sections refreshed: all

### Update Entry

- Date: 2026-04-03
- Trigger: Workflow Step 5 repeated-rule review
- Summary of change: reviewed the repeated Codacy rules against repository ownership and runtime priority, recorded keep or narrow or demote decisions in `rule-review.md`, identified two AI-guidance gaps worth later Security & Auth propagation, and synchronized the workflow artifacts
- Sections refreshed: Task Context, Scope Handled, Inputs Reviewed, Actions Performed, Current-State Findings, Boundary And Dependency Assessment, Architectural Decisions / Constraints, Artifact Synchronization, Open Questions / Blockers, Handoff Notes, Update Log
