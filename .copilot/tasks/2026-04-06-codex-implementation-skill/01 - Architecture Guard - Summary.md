# 01 - Architecture Guard - Summary

## Objective

Review the current Codex compatibility layer before adding `04 - Implementation Agents`
and determine whether any structural or numbering issues must be corrected first.

## Current-State Findings

### INFORMATIONAL

- No numbering conflict exists for agent `04`. The Codex guide layer can extend cleanly
  after `01`, `02`, and `03`.
- The current Codex layer already distinguishes specialist agents from workflow guides,
  so this pass is another straightforward compatibility addition.
- The shared source-of-truth order remains correct: `AGENTS.md` first, then
  `docs/ai/general/*`, then tool-specific runtime surfaces.

## Docs vs Code Drift

- The drift is missing coverage only: the shared `04 - Implementation Agents` role
  already exists in `docs/ai/general/04 - Implementation Agents.md` and
  `.github/agents/implementation-agent.agent.md`, but the Codex runtime surface and
  guide do not yet exist.

## Architectural Assessment

The safe path is a narrow compatibility-layer addition:

- add `.agents/skills/implementation-agent/SKILL.md`
- add `docs/ai/codex/04 - Implementation Agents.md`
- wire the new skill into the compatibility maps and guide indices

No broader architecture correction is needed first.

## Risks

- Leaving `04` absent from the Codex layer would keep the implementation surface uneven
  relative to the shared repo package.
- If the new skill drifted from the shared implementation prompt, the Codex layer would
  become a competing authority source.

## Recommended Next Action

Proceed with the narrow implementation and keep the new skill a thin wrapper around the
shared implementation prompt, with the mandatory
`04 - Implementation Agent - Summary.md` artifact discipline called out explicitly.
