# Task Plan: Codex All Workflows

**Task ID**: `2026-04-06-codex-all-workflows`
**Status**: Completed
**Created**: 2026-04-06

## Objective

Implement the Codex workflow layer for the current repository workflow inventory so the
workflow roadmap becomes an actual usable repo-local skill set rather than a plan-only
document.

## Scope

- add repo-local Codex skills for the remaining workflow-style repository entry points
- add human-facing Codex workflow guides for those workflows
- update the source-of-truth compatibility tables and Codex discovery docs
- record the implementation in task artifacts and validation output

## Risks

- leaving the repo in a half-migrated state where the workflow skill files exist but the
  source-of-truth docs still claim they do not
- creating numbering or mapping drift between Codex, Copilot, ZenFlow, and neutral
  workflow sources
- overstating Codex workflow behavior beyond what repo-local skills actually provide

## Planned Steps

- [x] audit the existing workflow inventory and current Codex coverage
- [x] add the missing repo-local workflow skills
- [x] add the matching human-facing Codex workflow guides
- [x] update the compatibility maps and Codex quick-start docs
- [x] create and synchronize task artifacts
- [x] run focused formatting and lint-command validation
- [x] write implementation summary
