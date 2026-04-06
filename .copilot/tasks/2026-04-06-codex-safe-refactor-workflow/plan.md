# Task Plan: Codex Safe Refactor Workflow

**Task ID**: `2026-04-06-codex-safe-refactor-workflow`
**Status**: Completed
**Created**: 2026-04-06

## Objective

Review the first repo-local Codex Architecture Guard rollout for correctness, then add
the Codex-native counterpart for `Workflow 02 - Safe Refactor Workflow` and update the
compatibility docs so the Codex layer stays aligned with the shared repository package.

## Scope

- review the existing Codex Architecture Guard skill and its propagation docs
- identify any compatibility or source-of-truth drift
- add a repo-local Codex safe-refactor workflow skill under `.agents/skills/`
- add the human-facing Codex guide for Safe Refactor
- update authority and compatibility docs where the Codex workflow layer must be mapped

## Risks

- creating a Codex workflow that drifts from the shared `Workflow 02` spec
- updating only the new skill without wiring the workflow into the compatibility maps
- keeping stale `.agents/` guide content that confuses the runtime-vs-guide distinction

## Planned Steps

- [x] review the existing Codex Architecture Guard rollout
- [x] capture Architecture Guard findings in a task artifact
- [x] design the Codex safe-refactor workflow surface
- [x] implement the new skill and guide docs
- [x] update compatibility / propagation docs
- [x] run focused validation
- [x] write implementation summary
