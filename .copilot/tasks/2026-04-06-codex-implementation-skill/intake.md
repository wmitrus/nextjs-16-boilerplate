# Intake: Codex Implementation Skill

## Objective

Add the repo-local Codex counterpart for `04 - Implementation Agents`.

## Requirements

- implement `04 - Implementation Agents` as a repo-local Codex skill
- keep the shared repository prompt and GitHub Copilot agent as the authority sources
- preserve the current Codex compatibility model instead of inventing a separate
  implementation policy
- update the compatibility docs needed for whole-repo alignment
- maintain the mandatory persistent-summary discipline for artifact-backed implementation
  work

## Source Files

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/04 - Implementation Agents.md`
- `.github/agents/implementation-agent.agent.md`
- `docs/ai/copilot/04 - Implementation Agents.md`
- `docs/ai/zencoder/04 - Implementation Agents.md`
- `docs/ai/templates/specialist-summaries/04 - Implementation Agent - Summary Template.md`
- `.agents/README.md`
- `docs/ai/codex/README.md`

## Non-Goals

- redesigning the shared Implementation role
- changing repository implementation rules outside the compatibility layer
- implementing additional Codex specialist agents beyond `04` in this pass

## Acceptance Criteria

- a repo-local Codex Implementation skill exists
- the Codex guide layer exposes `04 - Implementation Agents`
- the compatibility maps acknowledge the new Codex skill
- artifact-backed work for the new skill explicitly requires its single persistent
  summary artifact
