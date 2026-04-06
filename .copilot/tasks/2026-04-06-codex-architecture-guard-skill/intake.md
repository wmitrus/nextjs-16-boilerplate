# Intake: Codex Architecture Guard Skill

## Objective

Design the first Codex-native specialist for this repository: `01 - Architecture Guard Agent`.

## Requirements

- base the skill on the current repository agent configuration
- use the shared general rules and instructions already present in `docs/ai/general/`
- keep compatibility with existing Zencoder and GitHub Copilot mappings
- preserve existing patterns instead of inventing a new parallel structure
- update the necessary documentation files so the compatibility model stays coherent

## Source Files

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/01 - Architecture Guard Agent.md`
- `.github/agents/architecture-guard.agent.md`
- `docs/ai/copilot/01 - Architecture Guard Agent.md`
- `docs/ai/zencoder/01 - Architecture Guard Agent.md`

## Non-Goals

- creating the full Codex skill suite for agents `02-09`
- redesigning the Architecture Guard role itself
- introducing new architecture policy unrelated to Codex compatibility

## Acceptance Criteria

- a repo-local Codex skill exists for Architecture Guard
- the skill matches the repository’s existing Architecture Guard role and startup rules
- the repository authority / propagation docs acknowledge the Codex skill surface
- a human-facing Codex guide points to the real skill path
