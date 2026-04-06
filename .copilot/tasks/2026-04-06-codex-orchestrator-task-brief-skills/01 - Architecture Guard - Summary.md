# 01 - Architecture Guard - Summary

## Objective

Review the current Codex compatibility layer before adding `08 - Workflow Orchestrator`
and `09 - Task Brief Authoring`, and determine whether their boundary is clear enough
to implement safely.

## Current-State Findings

### INFORMATIONAL

- No numbering conflict exists for agents `08` and `09`. The Codex guide layer can
  extend cleanly after `01` through `06`.
- The shared source-of-truth order remains correct: `AGENTS.md` first, then
  `docs/ai/general/*`, then tool-specific runtime surfaces.
- `08` and `09` are intentionally different kinds of roles: `08` coordinates execution,
  while `09` prepares the task package that makes orchestration safe.

### MAJOR

- The main design risk is boundary blur. If `09` starts sequencing specialists or `08`
  starts acting like a requirements-normalization mode, the repo will recreate the same
  role confusion under a different tool surface.

## Docs vs Code Drift

- There is no structural drift in the shared prompts themselves, but the Codex layer did
  not yet explain an important runtime fact: Codex can orchestrate and spawn subagents,
  but repo-local skills are instruction surfaces, not automatically spawned built-in
  agent identities.
- There was also no Codex-layer guidance telling operators when `08` is the right entry
  point versus when `09` is the better starting point.

## Architectural Assessment

The safe implementation is:

- add a Codex `workflow-orchestrator` skill that stays thin and explains delegation
  boundaries explicitly
- add a Codex `task-brief-authoring` skill that stays focused on brief preparation and
  explicitly does not orchestrate
- update the Codex guide layer to document the `08` versus `09` split

No shared prompt redesign is required first.

## Risks

- If `08` is documented as if repo-local skills were directly spawnable named subagents,
  the Codex layer would overpromise capabilities and create operator confusion.
- If `09` is documented as a generic orchestration mode, it would undermine the
  repository's workflow separation.
- If the two guides do not state their different entry conditions clearly, future tasks
  will route unpredictably.

## Recommended Next Action

Implement both roles together and add explicit Codex-facing documentation that:

- `09` prepares the brief
- `08` runs the workflow
- Codex subagent spawning is possible, but the handoff still needs an explicit bounded
  prompt carrying the relevant role constraints
