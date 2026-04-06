---
name: playwright-e2e-validation-workflow
description: Browser-validation workflow for this repository. Use whenever the main task is to run focused Playwright verification against a scenario list, matrix, acceptance list, or workflow artifact package rather than to design or implement code, even if the user does not explicitly ask for a "workflow."
---

# Playwright E2E Validation Workflow

This is the Codex-native counterpart to:

- `docs/ai/general/Workflow 06 - Playwright E2E Validation Workflow.md`
- `.github/prompts/playwright-e2e-validation.prompt.md`
- `.zenflow/workflows/playwright-e2e-validation.md`

Use this skill when the primary task is browser verification rather than implementation.

## Startup

1. Read `AGENTS.md`.
2. Read `docs/ai/general/MODE_MANIFEST.md`.
3. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
4. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
5. Read `docs/ai/general/Workflow 06 - Playwright E2E Validation Workflow.md`.

For auth-flow verification:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- read `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

## Mission

Run focused Playwright verification for the current task using the task brief, attached
files, and any provided verification checklist.

## Working Sequence

1. Verification intake
2. Scenario scope definition
3. Precondition check
4. Playwright execution
5. Evidence collection
6. Result report

## Compatibility Notes

- `docs/ai/general/Workflow 06 - Playwright E2E Validation Workflow.md` remains the
  shared, neutral workflow source
- `.github/prompts/playwright-e2e-validation.prompt.md` remains the Copilot workflow
  entrypoint
- `.zenflow/workflows/playwright-e2e-validation.md` remains the ZenFlow execution layer
- this skill is the Codex-native runtime surface for the same workflow intent
