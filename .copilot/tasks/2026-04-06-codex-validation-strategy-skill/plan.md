# Task Plan: Codex Validation Strategy Skill

**Task ID**: `2026-04-06-codex-validation-strategy-skill`
**Status**: Completed
**Created**: 2026-04-06

## Objective

Implement the repo-local Codex counterpart for `05 - Validation Strategy Agent` while
keeping the Codex compatibility layer aligned with the shared repository agent package.

## Scope

- add a repo-local Codex Validation Strategy skill under `.agents/skills/`
- add the human-facing Codex guide for `05 - Validation Strategy Agent`
- update the compatibility maps so agent `05` includes the Codex runtime surface
- keep the artifact-summary discipline explicit for the new skill
- correct the stale template-path wording in the shared Validation Strategy sources

## Risks

- adding the new skill without wiring it into the compatibility tables
- drifting from the shared validation prompt instead of wrapping it
- preserving the stale summary-template reference and carrying doc drift forward

## Planned Steps

- [x] review the shared `05` validation sources and Codex-layer constraints
- [x] capture Architecture Guard findings in a task artifact
- [x] implement the Codex Validation Strategy skill
- [x] update compatibility docs and guides
- [x] correct the shared template-path drift for `05`
- [x] run focused validation
- [x] write validation strategy summary
