# Codex Repo Skills Quick Start

> **IMPORTANT - THIS DIRECTORY CONTAINS THE REAL REPO-LOCAL CODEX SKILLS.**
>
> The runtime skill files live under `.agents/skills/`.
> The guides in `docs/ai/codex/` are human-facing descriptions only.

Use this directory when you want the actual Codex runtime surface for this repository.

## Skill Types

### Specialist Skill

A specialist skill is a focused reviewer or implementer role.

Current specialist skills:

- `architecture-guard` -> `.agents/skills/architecture-guard/SKILL.md`
- `security-auth` -> `.agents/skills/security-auth/SKILL.md`
- `nextjs-runtime` -> `.agents/skills/nextjs-runtime/SKILL.md`
- `implementation-agent` -> `.agents/skills/implementation-agent/SKILL.md`
- `validation-strategy` -> `.agents/skills/validation-strategy/SKILL.md`
- `debug-investigation` -> `.agents/skills/debug-investigation/SKILL.md`
- `playwright-e2e` -> `.agents/skills/playwright-e2e/SKILL.md`
- `workflow-orchestrator` -> `.agents/skills/workflow-orchestrator/SKILL.md`
- `task-brief-authoring` -> `.agents/skills/task-brief-authoring/SKILL.md`

### Workflow Skill

A workflow skill is a reusable, multi-step operating mode that coordinates intake,
constraints, implementation, and validation for a recurring task shape.

Current workflow skills:

- `safe-feature-workflow` -> `.agents/skills/safe-feature-workflow/SKILL.md`
- `safe-refactor-workflow` -> `.agents/skills/safe-refactor-workflow/SKILL.md`
- `security-incident-workflow` -> `.agents/skills/security-incident-workflow/SKILL.md`
- `incident-investigation-workflow` -> `.agents/skills/incident-investigation-workflow/SKILL.md`
- `auth-flow-change-review-workflow` ->
  `.agents/skills/auth-flow-change-review-workflow/SKILL.md`
- `playwright-e2e-validation-workflow` ->
  `.agents/skills/playwright-e2e-validation-workflow/SKILL.md`
- `change-validation-workflow` -> `.agents/skills/change-validation-workflow/SKILL.md`
- `repository-baseline-validation-workflow` ->
  `.agents/skills/repository-baseline-validation-workflow/SKILL.md`
- `codacy-security-review-workflow` ->
  `.agents/skills/codacy-security-review-workflow/SKILL.md`
- `codacy-findings-review-workflow` ->
  `.agents/skills/codacy-findings-review-workflow/SKILL.md`

Workflow roadmap:

- `docs/ai/codex/Workflow Roadmap.md`

## Recommended Starting Points

- architecture or boundary review:
  `.agents/skills/architecture-guard/SKILL.md`
- behavior-preserving refactor or cleanup:
  `.agents/skills/safe-refactor-workflow/SKILL.md`
- feature delivery with constraint-first sequencing:
  `.agents/skills/safe-feature-workflow/SKILL.md`
- multi-step task sequencing and delegation:
  `.agents/skills/workflow-orchestrator/SKILL.md`
- task brief or intake normalization before orchestration:
  `.agents/skills/task-brief-authoring/SKILL.md`

## Codex Delegation Note

Codex can orchestrate multi-step work and spawn subagents for this repository, but the
repo-local skills in `.agents/skills/*/SKILL.md` are instruction surfaces, not
automatically registered spawned-agent identities.

Use `workflow-orchestrator` to decide when delegation is appropriate. Spawned subagents
still need explicit, bounded handoffs that carry the relevant role constraints.

## Compatibility Notes

- `AGENTS.md` remains the primary always-applied context.
- Shared specialist prompts live in `docs/ai/general/01-09 - *.md`.
- Neutral workflow specs live in `docs/ai/general/Workflow *.md`.
- GitHub Copilot runtime surfaces live in `.github/agents/` and `.github/prompts/`.
- ZenFlow runtime workflow specs live in `.zenflow/workflows/`.
- Human-facing Codex guides live in `docs/ai/codex/`.

When a repo-local Codex skill changes, propagate that change to the matching shared
source, any relevant Copilot or ZenFlow counterpart, and the guide layer under
`docs/ai/codex/`.

For artifact-backed work, every non-orchestrator specialist skill must maintain exactly
one persistent summary artifact under `.copilot/tasks/{task_id}/` and update that same
file on later runs instead of creating duplicates.
