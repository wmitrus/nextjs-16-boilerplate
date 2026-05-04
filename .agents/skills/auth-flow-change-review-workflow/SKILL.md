---
name: auth-flow-change-review-workflow
description: Auth-flow review workflow for this repository. Use whenever a change touches Clerk auth, bootstrap routing, onboarding redirects, auth middleware, root auth layout boundaries, or similar auth-flow paths that must be checked against the anti-pattern catalogue and verification matrix, even if the user does not explicitly ask for a "workflow."
---

# Auth Flow Change Review Workflow

This is the Codex-native counterpart to:

- `docs/ai/general/Workflow 05 - Auth Flow Change Review Workflow.md`
- `.github/prompts/auth-flow-change-review.prompt.md`
- `.zenflow/workflows/auth-flow-change-review.md`

Use this skill when auth/bootstrap/onboarding changes must be reviewed against the repo
anti-patterns and verification matrix before implementation or sign-off.

## Startup

1. Read `AGENTS.md`.
2. Read `docs/ai/general/MODE_MANIFEST.md`.
3. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
4. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
5. Read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`.
6. Read `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`.
7. Read `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`.
8. Read `docs/ai/general/Workflow 05 - Auth Flow Change Review Workflow.md`.

## Mission

Review auth-flow changes against anti-patterns and the verification matrix before
implementation or sign-off.

For AuthJS-focused regressions, do not treat completed-user browser proof as sufficient by itself. The review must account for incomplete-user onboarding settlement too.

## Working Sequence

1. Change intake
2. Security/Auth analysis first
3. Conditional Next.js Runtime review
4. Conditional Architecture Guard review
5. Scenario verification mapping
6. Conditional Playwright E2E verification

## Compatibility Notes

- `docs/ai/general/Workflow 05 - Auth Flow Change Review Workflow.md` remains the
  shared, neutral workflow source
- `.github/prompts/auth-flow-change-review.prompt.md` remains the Copilot workflow
  entrypoint
- `.zenflow/workflows/auth-flow-change-review.md` remains the ZenFlow execution layer
- this skill is the Codex-native runtime surface for the same workflow intent

## Leantime Integration

**This skill participates in the mandatory Leantime workflow.**

At task open and close, the Workflow Orchestrator invokes
`10 - Leantime Integration Agent` (Codex: `leantime-integration` skill).

Reference: `docs/ai/general/LEANTIME_AUTOMATION.md`
