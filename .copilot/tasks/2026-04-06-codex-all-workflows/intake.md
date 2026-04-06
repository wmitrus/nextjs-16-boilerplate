# Intake: Codex All Workflows

## Request Summary

The repository already had a completed Codex workflow roadmap. The request was to stop
planning and implement the whole current workflow set so the Codex layer is genuinely
usable for recurring task shapes.

## Goals

- make the roadmap-backed workflows available as real repo-local Codex skills
- provide matching human-facing Codex guide files
- update the main compatibility and discovery docs so the new workflow layer is visible
  and trustworthy

## Non-Goals

- changing the neutral workflow specs in `docs/ai/general/` beyond what is needed for
  compatibility accuracy
- changing ZenFlow workflow content
- changing application runtime code

## Inputs

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/Workflow *.md`
- `.github/prompts/*.prompt.md`
- `.zenflow/workflows/*.md`
- `docs/ai/codex/Workflow Roadmap.md`

## Acceptance Criteria

- every current roadmap-backed workflow has a repo-local Codex skill
- every implemented workflow has a human-facing `docs/ai/codex/` guide
- `AGENTS.md` and `docs/ai/general/REPOSITORY_AI_CONTEXT.md` both map the full workflow
  set correctly
- Codex quick-start docs reflect the full workflow set instead of only Safe Refactor
- task artifacts record what changed and how it was validated
