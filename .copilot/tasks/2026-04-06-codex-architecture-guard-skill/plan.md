# Task Plan: Codex Architecture Guard Skill

**Task ID**: `2026-04-06-codex-architecture-guard-skill`
**Status**: Completed
**Created**: 2026-04-06

## Objective

Create the first repo-local Codex skill for `01 - Architecture Guard Agent` using the existing repository-wide agent package as the shared source of truth, then update the compatibility docs and maps so Codex is represented alongside Zencoder and GitHub Copilot.

## Scope

- add a repo-local Codex skill under `.agents/skills/`
- keep the existing Architecture Guard role shape and constraints
- add the Codex description-guide layer under `docs/ai/codex/`
- update authority / correspondence docs so propagation rules include Codex

## Risks

- creating a parallel Codex prompt that drifts from `docs/ai/general/01 - Architecture Guard Agent.md`
- updating only the new skill without updating the repository-wide compatibility maps
- over-documenting future Codex agents that do not exist yet

## Planned Steps

- [x] create intake artifact
- [x] add repo-local Codex Architecture Guard skill
- [x] add Codex description-guide docs
- [x] update compatibility / propagation docs
- [x] run focused lint validation
- [x] write implementation summary
