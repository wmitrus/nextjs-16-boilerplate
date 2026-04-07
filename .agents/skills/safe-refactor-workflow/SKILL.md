---
name: safe-refactor-workflow
description: Behavior-preserving refactor workflow for this repository. Use whenever the user asks for cleanup, code organization, dependency cleanup, file or module moves, DI cleanup, extraction, consolidation, or replacing weak patterns with safer equivalents while keeping behavior unchanged, even if they do not explicitly ask for a "workflow."
---

# Safe Refactor Workflow

This is the Codex-native counterpart to:

- `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md`
- `.github/prompts/safe-refactor.prompt.md`
- `.zenflow/workflows/safe-refactor.md`

Use this skill when the task is a refactor or cleanup that is intended to preserve
behavior and still needs the repository's normal boundary, runtime, and validation
discipline.

## Startup

Before substantial work:

1. Read `AGENTS.md`.
2. Read `docs/ai/general/MODE_MANIFEST.md`.
3. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
4. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
5. Read `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md`.

For refactors that touch redirects, logging, auth, route handlers, file access, or
other security-sensitive code:

- read `docs/ai/general/SECURITY_CODING_PATTERNS.md`

For refactors that touch auth, onboarding, bootstrap, or middleware-style auth
routing:

- read `docs/ai/general/02 - Security & Auth Agent.md`
- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- read `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the required checklist

For refactors that touch `src/app/*`, route handlers, server actions, caching, env
exposure, or runtime placement:

- read `docs/ai/general/03 - Next.js Runtime Agent.md`

For artifact-backed work under `.copilot/tasks/{task_id}/`:

- create or update `plan.md` first
- create or update `intake.md` immediately after `plan.md`
- keep checklist state synchronized as the work progresses
- create or update `01 - Architecture Guard - Summary.md` when you perform the
  architecture pass
- create or update `04 - Implementation Agent - Summary.md` when you implement
- create or update `validation-report.md` after validation
- if you materially perform a security or runtime specialist pass in-session,
  create the matching persistent summary artifact for that specialist too

Summary artifacts are mandatory in artifact-backed workflow runs:

- each non-orchestrator specialist must maintain exactly one persistent summary artifact
  for the task
- update the same summary file on later runs instead of creating duplicates
- use the matching template from `docs/ai/templates/specialist-summaries/`
- if this workflow run materially performs implementation, `04 - Implementation Agent -
Summary.md` is mandatory

Repository note:

- `src/proxy.ts` is the middleware-equivalent file in this repo
- do not treat the absence of `middleware.ts` as a finding

## Mission

Safely perform refactors, cleanup, and structural improvements that are intended to
preserve behavior.

Protect:

- existing observable behavior unless an intentional change is explicitly approved
- modular-monolith boundaries
- dependency direction
- DI and composition-root discipline
- auth and trust-boundary correctness when relevant
- Next.js runtime correctness when relevant
- low blast radius

## Fast Path

You may use a reduced path only when all of the following are true:

- the change affects only a small number of files
- no public contract changes are involved
- DI or composition is untouched
- no auth or trust-sensitive path is touched
- no runtime placement, cache, or env exposure risk is introduced
- no module boundary crossing is involved

If any of these are uncertain, do not use the fast path.

## Working Sequence

### 1. Intake and Refactor Classification

- confirm the request is a refactor, not feature delivery
- identify the intended unchanged behavior
- identify affected modules, layers, and contracts
- identify whether auth, runtime, or security-sensitive paths are touched
- classify the refactor shape: ownership cleanup, DI cleanup, organization move,
  extraction, consolidation, safer pattern replacement, or another equivalent class

### 2. Architecture Guard First

Run the Architecture Guard reasoning first, even when the implementation looks
small.

Decide:

- which boundaries are affected
- which structural invariants must remain unchanged
- whether the refactor is safe, risky, or blocked

Do not begin edits until the architecture constraints are clear enough to execute.

### 3. Conditional Security/Auth Pass

Run a security/auth pass only if the refactor touches or may affect:

- auth flows
- authorization enforcement
- tenancy or organization context
- provider isolation
- trust boundaries
- sensitive-data handling
- security-significant route handlers or server actions

Capture the invariants that must remain unchanged before editing.

### 4. Conditional Next.js Runtime Pass

Run a runtime pass only if the refactor touches or may affect:

- `src/app/*`
- route handlers
- server actions
- `src/proxy.ts`
- server/client placement
- caching or revalidation
- Edge vs Node runtime behavior
- env exposure or build-time vs request-time behavior

Capture the runtime invariants that must remain unchanged before editing.

### 5. Constraint Summary

Before implementation, write down the implementation-ready constraints:

- explicitly protected invariants
- allowed implementation scope
- forbidden refactor moves
- whether public contracts must remain unchanged
- whether the task is still safe to proceed

If safe refactoring depends on a broader redesign, stop and report that instead of
continuing.

### 6. Implementation

Apply the minimum safe refactor only.

Always:

- preserve behavior unless an explicit behavior change was approved
- avoid opportunistic redesign
- keep edits narrow and reviewable
- update tests only when the refactor changes the test surface or contract surface

Never:

- hide architectural change inside cleanup
- mix new feature work into the refactor
- widen coupling in the name of simplification
- change public contracts casually

### 7. Validation

Run focused validation with strong signal for the actual risk surface.

Prefer:

- `pnpm lint --fix` on the touched scope
- targeted tests for the touched behavior
- explicit documentation of residual risk when validation is intentionally limited

## Required Output Shape

For substantial kickoff or review output, use:

1. Objective
2. Input Sources
3. Refactor Classification
4. Protected Invariants
5. Planned Specialist Sequence
6. Artifacts To Be Produced
7. Recommended Next Action

For implementation close-out, include:

- what changed
- what behavior was intentionally preserved
- validation performed
- residual risks or follow-up items

## Compatibility Notes

- `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md` remains the shared,
  neutral workflow source
- `.github/prompts/safe-refactor.prompt.md` remains the Copilot workflow entrypoint
- `.zenflow/workflows/safe-refactor.md` remains the ZenFlow execution layer
- this skill is the Codex-native runtime surface for the same workflow intent

When this workflow changes, update:

- `AGENTS.md`
- `docs/ai/general/MODE_MANIFEST.md` when mode behavior or required files change
- `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md`
- `.github/prompts/safe-refactor.prompt.md`
- `.agents/skills/safe-refactor-workflow/SKILL.md`
- `.zenflow/workflows/safe-refactor.md`
- the applicable description guides under `docs/ai/`

## Leantime Integration

**This skill participates in the mandatory Leantime workflow.**

At task open and close, the Workflow Orchestrator invokes
`10 - Leantime Integration Agent` (Codex: `leantime-integration` skill).

Reference: `docs/ai/general/LEANTIME_AUTOMATION.md`
