# 01 - Architecture Guard - Summary

## Objective

Review the current Codex-layer design before adding `02 - Security & Auth Agent`, with
special attention to numbering consistency and whether mandatory specialist summary
artifacts are expressed clearly enough in the Codex runtime surfaces.

## Current-State Findings

### MAJOR

- The Codex guide layer had a numbering drift: `docs/ai/codex/02 - Safe Refactor Workflow.md`
  occupied slot `02`, which conflicts with the repository's actual agent numbering where
  `02` is reserved for Security & Auth.

### MINOR

- The shared repository prompts already make persistent specialist summary artifacts
  mandatory, but the existing Codex skills were weaker on that point. The requirement
  was present in spirit, yet not expressed with the same "mandatory, exactly one
  persistent summary artifact" clarity in the Codex runtime layer.

### INFORMATIONAL

- The shared source-of-truth chain remains correct: `AGENTS.md` first, then
  `docs/ai/general/*`, then tool-specific runtime surfaces.
- Adding the Security & Auth Codex skill is a narrow compatibility-layer change and does
  not require redesign of the shared security role.

## Docs vs Code Drift

- The drift is in the Codex compatibility layer rather than repository runtime code.
- The Security & Auth role already exists as a shared prompt and Copilot agent:
  `docs/ai/general/02 - Security & Auth Agent.md`,
  `.github/agents/security-auth.agent.md`.
- The Codex layer lagged behind by not having the corresponding specialist skill and by
  letting the workflow guide occupy the `02` slot.

## Architectural Assessment

The safe path is:

- add the Codex Security & Auth specialist under the real `02` numbering
- rename the workflow guide so it is clearly a workflow entrypoint, not agent `02`
- strengthen the Codex-layer artifact wording so it matches the repository's established
  specialist-summary discipline

This is a compatibility correction, not a structural redesign.

## Risks

- Leaving the numbering collision in place would make future Codex guidance unreliable
  and could misroute users to the wrong surface.
- Leaving summary-artifact wording implicit would weaken artifact discipline exactly
  where the repo expects explicit specialist handoff records.

## Recommended Next Action

Proceed with a narrow implementation:

- add `.agents/skills/security-auth/SKILL.md`
- create `docs/ai/codex/02 - Security & Auth Agent.md`
- move the safe-refactor guide to a workflow-specific filename
- update the Codex skills and guides so summary artifacts are explicitly mandatory
