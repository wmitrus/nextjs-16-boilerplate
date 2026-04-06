# Task Plan: Codex Implementation Skill

**Task ID**: `2026-04-06-codex-implementation-skill`
**Status**: Completed
**Created**: 2026-04-06

## Objective

Implement the repo-local Codex counterpart for `04 - Implementation Agents` while
keeping the Codex compatibility layer aligned with the shared repository agent package.

## Scope

- add a repo-local Codex Implementation skill under `.agents/skills/`
- add the human-facing Codex guide for `04 - Implementation Agents`
- update the compatibility maps so agent `04` includes the Codex runtime surface
- keep the mandatory implementation-summary discipline explicit

## Risks

- adding the new skill without wiring it into the compatibility tables
- drifting from the shared implementation prompt instead of wrapping it
- leaving the Codex guide layer incomplete after adding `04`

## Planned Steps

- [x] review the shared `04` implementation sources and Codex-layer constraints
- [x] capture Architecture Guard findings in a task artifact
- [x] implement the Codex Implementation skill
- [x] update compatibility docs and guides
- [x] run focused validation
- [x] write implementation summary
