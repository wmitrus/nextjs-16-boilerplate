# Intake: Codex Safe Refactor Workflow

## Objective

Add the repo-local Codex counterpart for `Workflow 02 - Safe Refactor Workflow` after
reviewing whether the first Codex Architecture Guard rollout was wired correctly.

## Requirements

- review the existing Codex Architecture Guard skill as an architecture artifact
- verify whether the relevant docs and instructions were updated correctly
- preserve `AGENTS.md` as the primary authority and the shared workflow docs as the
  neutral source of truth
- implement a Codex-native safe-refactor workflow without inventing a parallel rule set
- keep compatibility with the existing GitHub Copilot prompt and ZenFlow workflow
- update the documentation surfaces needed for whole-repo compatibility

## Source Files

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/01 - Architecture Guard Agent.md`
- `docs/ai/general/Workflow 02 - Safe Refactor Workflow.md`
- `.github/agents/architecture-guard.agent.md`
- `.github/prompts/safe-refactor.prompt.md`
- `.zenflow/workflows/safe-refactor.md`
- `.agents/skills/architecture-guard/SKILL.md`
- `docs/ai/codex/README.md`
- `.agents/README.md`

## Non-Goals

- creating the rest of the Codex workflow suite
- redesigning the Architecture Guard role or the Safe Refactor workflow itself
- changing repository runtime or architecture policy outside the compatibility package

## Acceptance Criteria

- the Architecture Guard rollout is reviewed with findings separated from assumptions
- a repo-local Codex safe-refactor workflow skill exists
- the skill clearly wraps the shared workflow sources instead of replacing them
- the compatibility and propagation docs acknowledge the workflow entrypoint correctly
- the Codex guide layer and `.agents` guide layer reflect the real current scope
