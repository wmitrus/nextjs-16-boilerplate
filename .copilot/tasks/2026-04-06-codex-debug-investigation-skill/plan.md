# Task Plan: Codex Debug Investigation Skill

**Task ID**: `2026-04-06-codex-debug-investigation-skill`
**Status**: Completed
**Created**: 2026-04-06

## Objective

Implement the repo-local Codex counterpart for `06 - Debug Investigation Agent` while
keeping the Codex compatibility layer aligned with the shared repository agent package.

## Scope

- add a repo-local Codex Debug Investigation skill under `.agents/skills/`
- add the human-facing Codex guide for `06 - Debug Investigation Agent`
- update the compatibility maps so agent `06` includes the Codex runtime surface
- keep the artifact-summary discipline explicit for the new skill
- correct the stale template-path wording in the shared Debug Investigation sources

## Risks

- adding the new skill without wiring it into the compatibility tables
- drifting from the shared investigation prompt instead of wrapping it
- preserving the stale summary-template reference and carrying doc drift forward

## Planned Steps

- [x] review the shared `06` investigation sources and Codex-layer constraints
- [x] capture Architecture Guard findings in a task artifact
- [x] implement the Codex Debug Investigation skill
- [x] update compatibility docs and guides
- [x] correct the shared template-path drift for `06`
- [x] run focused validation
- [x] write debug investigation summary
