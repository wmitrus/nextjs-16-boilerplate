# Intake: Codex Security & Auth Skill

## Objective

Add the repo-local Codex counterpart for `02 - Security & Auth Agent` and verify that
artifact-backed Codex work explicitly requires each specialist or skill surface to keep
its own persistent summary artifact.

## Requirements

- implement `02 - Security & Auth Agent` as a repo-local Codex skill
- keep the shared repository prompt and GitHub Copilot agent as the authority sources
- review and validate that summary artifacts are mandatory for artifact-backed specialist
  work
- correct any Codex-layer docs or numbering drift discovered during the review
- update the compatibility docs needed for whole-repo alignment

## Source Files

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/02 - Security & Auth Agent.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`
- `.github/agents/security-auth.agent.md`
- `docs/ai/copilot/02 - Security & Auth Agent.md`
- `docs/ai/zencoder/02 - Security & Auth Agent.md`
- `.agents/skills/architecture-guard/SKILL.md`
- `.agents/skills/safe-refactor-workflow/SKILL.md`
- `docs/ai/codex/README.md`

## Non-Goals

- redesigning the shared Security & Auth role
- changing the repository's security policies outside the compatibility package
- implementing additional Codex specialist agents beyond `02` in this pass

## Acceptance Criteria

- a repo-local Codex Security & Auth skill exists
- the agent numbering in the Codex guide layer matches the shared repository numbering
- the compatibility maps acknowledge the new Codex skill
- the Codex-layer specialist and workflow surfaces explicitly treat persistent summary
  artifacts as mandatory where applicable
