# Task Plan: Codex Security & Auth Skill

**Task ID**: `2026-04-06-codex-security-auth-skill`
**Status**: Completed
**Created**: 2026-04-06

## Objective

Implement the repo-local Codex counterpart for `02 - Security & Auth Agent`, then
review and validate that the Codex specialist and workflow surfaces treat per-agent
summary artifacts as mandatory for artifact-backed work.

## Scope

- add a repo-local Codex Security & Auth skill under `.agents/skills/`
- update the Codex guide layer so agent numbering remains aligned with the shared
  repository numbering
- correct any numbering or compatibility drift introduced by the earlier workflow guide
- strengthen Codex-layer summary-artifact wording where it was only implicit

## Risks

- leaving a numbering collision between Security & Auth agent `02` and Safe Refactor
  workflow `02`
- adding the new skill without updating the shared compatibility tables
- leaving summary-artifact discipline weaker in the Codex layer than in the shared
  repository prompts

## Planned Steps

- [x] review current Codex-layer drift and artifact-discipline gaps
- [x] capture Architecture Guard findings in a task artifact
- [x] implement the Codex Security & Auth skill
- [x] fix Codex guide numbering and compatibility docs
- [x] strengthen Codex summary-artifact wording
- [x] run focused validation
- [x] write implementation summary
