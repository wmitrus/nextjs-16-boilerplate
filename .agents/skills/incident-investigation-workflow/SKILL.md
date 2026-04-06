---
name: incident-investigation-workflow
description: Incident-investigation workflow for this repository. Use whenever a production failure, regression, or unclear multi-layer bug needs a controlled investigation-to-remediation sequence instead of a direct fix, even if the user does not explicitly ask for a "workflow."
---

# Incident Investigation Workflow

This is the Codex-native counterpart to:

- `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`
- `.github/prompts/incident-investigation.prompt.md`
- `.zenflow/workflows/incident-investigation.md`

Use this skill when a production incident or multi-layer failure needs evidence-first
investigation before implementation.

## Startup

1. Read `AGENTS.md`.
2. Read `docs/ai/general/MODE_MANIFEST.md`.
3. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
4. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
5. Read `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`.

## Mission

Investigate and remediate production incidents, regressions, and multi-layer failures
through a controlled specialist sequence.

## Working Sequence

1. Incident intake
2. Debug Investigation first
3. Conditional Next.js Runtime review
4. Conditional Architecture Guard review
5. Remediation plan
6. Validation strategy
7. Implementation
8. Validation

## Compatibility Notes

- `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md` remains the
  shared, neutral workflow source
- `.github/prompts/incident-investigation.prompt.md` remains the Copilot workflow
  entrypoint
- `.zenflow/workflows/incident-investigation.md` remains the ZenFlow execution layer
- this skill is the Codex-native runtime surface for the same workflow intent
