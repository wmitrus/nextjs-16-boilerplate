---
name: change-validation-workflow
description: Change-validation workflow for this repository. Use whenever the main question is the minimum safe validation scope for a specific change and the answer should be artifact-backed rather than ad hoc, even if the user does not explicitly ask for a "workflow."
---

# Change Validation Workflow

This is the Codex-native counterpart to:

- `docs/ai/general/Workflow 07 - Change Validation Workflow.md`
- `.github/prompts/change-validation.prompt.md`
- `.zenflow/workflows/change-validation.md`

Use this skill when the main task is to determine and run the minimum safe validation
scope for a specific change.

## Startup

1. Read `AGENTS.md`.
2. Read `docs/ai/general/MODE_MANIFEST.md`.
3. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
4. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
5. Read `docs/ai/general/Workflow 07 - Change Validation Workflow.md`.

For auth/bootstrap/onboarding changes:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- read `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

## Mission

Determine, execute, and report the minimum safe validation scope for a specific change.

## Working Sequence

1. Change intake
2. Validation risk assessment
3. Validation scope definition
4. Validation execution
5. Result report

For App Router route handlers with UUID path segments, the minimum required validation
must include a malformed-ID `400` test proving DB/repository/mutation calls are not
reached before the change can be marked safe (SEC-23).

For SEC-24 Codacy HIGH error-prone fixes, the minimum required validation must match
the shape: lint for async JSX handlers, typecheck for sparse state and finite schemas,
owning tests for UI handlers and typed mocks, and route tests for request schema
narrowing.

## Compatibility Notes

- `docs/ai/general/Workflow 07 - Change Validation Workflow.md` remains the shared,
  neutral workflow source
- `.github/prompts/change-validation.prompt.md` remains the Copilot workflow entrypoint
- `.zenflow/workflows/change-validation.md` remains the ZenFlow execution layer
- this skill is the Codex-native runtime surface for the same workflow intent

## Task Lifecycle

Follow the repository task lifecycle from the root instructions.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.
