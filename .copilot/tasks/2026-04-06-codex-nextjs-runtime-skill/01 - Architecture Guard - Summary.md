# 01 - Architecture Guard - Summary

## Objective

Review the current Codex compatibility layer before adding `03 - Next.js Runtime Agent`
and determine whether any structural or numbering issues must be corrected first.

## Current-State Findings

### INFORMATIONAL

- No new numbering conflict exists for agent `03`. The Codex guide layer can extend
  cleanly after `01 - Architecture Guard` and `02 - Security & Auth`.
- The shared source-of-truth order remains correct: `AGENTS.md` first, then
  `docs/ai/general/*`, then tool-specific runtime surfaces.
- The existing Codex layer already distinguishes agent guides from workflow guides, so
  this pass can be a straightforward addition rather than a repair.

## Docs vs Code Drift

- The drift is simply missing coverage: the shared `03 - Next.js Runtime Agent` already
  exists in `docs/ai/general/03 - Next.js Runtime Agent.md` and
  `.github/agents/nextjs-runtime.agent.md`, but the Codex runtime surface and guide do
  not yet exist.

## Architectural Assessment

The safe path is a narrow compatibility-layer addition:

- add `.agents/skills/nextjs-runtime/SKILL.md`
- add `docs/ai/codex/03 - Next.js Runtime Agent.md`
- wire the new skill into the compatibility maps and guide indices

No broader architecture correction is needed first.

## Risks

- Leaving `03` absent from the Codex layer would keep the runtime-review surface uneven
  relative to the shared repo package.
- If the new skill drifted from the shared runtime prompt, the Codex layer would become
  a competing authority source.

## Recommended Next Action

Proceed with the narrow implementation and keep the new skill a thin wrapper around the
shared runtime prompt, with the mandatory `03 - Next.js Runtime - Summary.md` artifact
discipline called out explicitly.
