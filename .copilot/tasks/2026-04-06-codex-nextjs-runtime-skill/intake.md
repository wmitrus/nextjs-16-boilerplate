# Intake: Codex Next.js Runtime Skill

## Objective

Add the repo-local Codex counterpart for `03 - Next.js Runtime Agent`.

## Requirements

- implement `03 - Next.js Runtime Agent` as a repo-local Codex skill
- keep the shared repository prompt and GitHub Copilot agent as the authority sources
- preserve the current Codex compatibility model instead of inventing a separate runtime
  rule set
- update the compatibility docs needed for whole-repo alignment
- maintain the mandatory persistent-summary discipline for artifact-backed specialist work

## Source Files

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/03 - Next.js Runtime Agent.md`
- `.github/agents/nextjs-runtime.agent.md`
- `docs/ai/copilot/03 - Next.js Runtime Agent.md`
- `docs/ai/zencoder/03 - Next.js Runtime Agent.md`
- `docs/ai/templates/specialist-summaries/03 - Next.js Runtime - Summary Template.md`
- `.agents/README.md`
- `docs/ai/codex/README.md`

## Non-Goals

- redesigning the shared Next.js Runtime role
- changing repository runtime rules outside the compatibility layer
- implementing additional Codex specialist agents beyond `03` in this pass

## Acceptance Criteria

- a repo-local Codex Next.js Runtime skill exists
- the Codex guide layer exposes `03 - Next.js Runtime Agent`
- the compatibility maps acknowledge the new Codex skill
- artifact-backed work for the new skill explicitly requires its single persistent
  summary artifact
