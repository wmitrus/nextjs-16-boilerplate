---
name: repository-baseline-validation-workflow
description: Repository-baseline-validation workflow for this repository. Use whenever the task is a repo-wide validation posture audit, CI quality-gate review, or test-stack health check rather than validation of one specific change, even if the user does not explicitly ask for a "workflow."
---

# Repository Baseline Validation Workflow

This is the Codex-native counterpart to:

- `docs/ai/general/Workflow 08 - Repository Baseline Validation Workflow.md`
- `.github/prompts/repository-baseline-validation.prompt.md`
- `.zenflow/workflows/repository-baseline-validation.md`

Use this skill for repository-wide validation posture reviews.

## Startup

1. Read `AGENTS.md`.
2. Read `docs/ai/general/MODE_MANIFEST.md`.
3. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
4. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
5. Read `docs/ai/general/Workflow 08 - Repository Baseline Validation Workflow.md`.

## Mission

Audit the repository-wide validation posture, identify critical gaps, and recommend the
minimum governance improvements needed.

## Working Sequence

1. Baseline intake
2. Validation posture audit
3. Architecture boundary audit
4. Risk and gap assessment
5. Recommendations
6. Output report

## Compatibility Notes

- `docs/ai/general/Workflow 08 - Repository Baseline Validation Workflow.md` remains
  the shared, neutral workflow source
- `.github/prompts/repository-baseline-validation.prompt.md` remains the Copilot
  workflow entrypoint
- `.zenflow/workflows/repository-baseline-validation.md` remains the ZenFlow execution
  layer
- this skill is the Codex-native runtime surface for the same workflow intent
