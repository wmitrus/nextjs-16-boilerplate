# Task Plan: Codex Next.js Runtime Skill

**Task ID**: `2026-04-06-codex-nextjs-runtime-skill`
**Status**: Completed
**Created**: 2026-04-06

## Objective

Implement the repo-local Codex counterpart for `03 - Next.js Runtime Agent` while
keeping the Codex compatibility layer aligned with the shared repository agent package.

## Scope

- add a repo-local Codex Next.js Runtime skill under `.agents/skills/`
- add the human-facing Codex guide for `03 - Next.js Runtime Agent`
- update the compatibility maps so agent `03` includes the Codex runtime surface
- keep the artifact-summary discipline explicit for the new skill

## Risks

- adding the new skill without wiring it into the compatibility tables
- drifting from the shared runtime prompt instead of wrapping it
- leaving the Codex guide layer incomplete after adding `03`

## Planned Steps

- [x] review the shared `03` runtime sources and Codex-layer constraints
- [x] capture Architecture Guard findings in a task artifact
- [x] implement the Codex Next.js Runtime skill
- [x] update compatibility docs and guides
- [x] run focused validation
- [x] write implementation summary
