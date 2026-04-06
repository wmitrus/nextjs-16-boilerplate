# 01 - Architecture Guard - Summary

## Objective

Review the first repo-local Codex Architecture Guard rollout and determine whether the
initial skill, guide docs, and compatibility instructions were updated correctly before
adding the Codex safe-refactor workflow layer.

## Current-State Findings

### MINOR

- `.agents/README.md` was not yet a clean Codex compatibility surface. It mixed the new
  repo-local skill note with an older, unrelated agent-pack concept and command matrix,
  which made it an unreliable guide for the actual runtime sources in
  `.agents/skills/`.

### INFORMATIONAL

- The real Architecture Guard skill correctly acts as a thin Codex wrapper around the
  existing shared authority source rather than inventing a new role definition:
  `.agents/skills/architecture-guard/SKILL.md`,
  `docs/ai/general/01 - Architecture Guard Agent.md`,
  `.github/agents/architecture-guard.agent.md`.
- The shared propagation maps were updated correctly for the Codex specialist surface:
  `AGENTS.md`, `docs/ai/general/00 - Agent Interaction Protocol.md`,
  `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
- No modular-boundary or ownership risk was introduced by the Architecture Guard skill
  rollout itself. The work is documentation and runtime-surface wiring only.

## Docs vs Code Drift

- The Codex Architecture Guard layer existed, but there was still no Codex-native
  workflow counterpart for `Workflow 02 - Safe Refactor Workflow`, despite the repo
  already having neutral, Copilot, and ZenFlow workflow surfaces for that flow.
- The propagation tables did not yet list `.github/prompts/*.prompt.md`, which is a
  real compatibility gap for workflow entrypoints such as Safe Refactor. That gap is in
  the shared documentation layer, not in repository runtime code.

## Architectural Assessment

The first Codex skill rollout is structurally sound.

It preserves the correct authority order:

- `AGENTS.md` as the primary always-applied context
- `docs/ai/general/*` as the shared repository source layer
- `.github/agents/` and `.agents/skills/` as tool-specific runtime surfaces

The follow-up work should be a compatibility cleanup plus workflow-surface addition, not
a redesign.

## Risks

- Leaving `.agents/README.md` in its mixed state would increase docs drift and make the
  Codex runtime surface harder to trust.
- Leaving workflow prompts out of the propagation map would make future workflow changes
  easy to propagate incompletely across Copilot, Codex, and ZenFlow.

## Recommended Next Action

Proceed with a narrow follow-up:

- rewrite `.agents/README.md` into a clean Codex runtime guide
- add a Codex-native `safe-refactor-workflow` skill that explicitly wraps the shared
  workflow sources
- update the propagation / compatibility docs so workflow prompts are mapped alongside
  the new Codex workflow skill
