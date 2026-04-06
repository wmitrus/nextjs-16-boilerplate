# 01 - Architecture Guard - Summary

## Objective

Review the current Codex compatibility layer before adding `05 - Validation Strategy
Agent` and determine whether any structural or numbering issues must be corrected
first.

## Current-State Findings

### INFORMATIONAL

- No numbering conflict exists for agent `05`. The Codex guide layer can extend cleanly
  after `01`, `02`, `03`, and `04`.
- The current Codex layer already distinguishes specialist agents from workflow guides,
  so this pass is another straightforward specialist-surface addition.
- The shared source-of-truth order remains correct: `AGENTS.md` first, then
  `docs/ai/general/*`, then tool-specific runtime surfaces.

### MINOR

- The shared Validation Strategy prompt and Copilot agent both referenced the summary
  template directory generically rather than the repo's actual template file path. The
  real file is
  `docs/ai/templates/specialist-summaries/05 - Validation Strategy - Summary Template.md`.

## Docs vs Code Drift

- The drift is narrow and compatibility-related: the shared `05 - Validation Strategy`
  role already exists in `docs/ai/general/05 - Validation Strategy Agent.md` and
  `.github/agents/validation-strategy.agent.md`, but the Codex runtime surface does not
  yet exist and the template reference needs to be made concrete.

## Architectural Assessment

The safe path is a narrow compatibility-layer addition plus a small doc correction:

- add `.agents/skills/validation-strategy/SKILL.md`
- add `docs/ai/codex/05 - Validation Strategy Agent.md`
- wire the new skill into the compatibility maps and guide indices
- correct the stale template-path wording in the shared `05` sources

No broader architecture correction is needed first.

## Risks

- Leaving `05` absent from the Codex layer would keep the validation specialist surface
  uneven relative to the shared repository package.
- Leaving the stale template reference in place would make artifact-backed `05` work
  more error-prone for all tool surfaces.
- If the new skill drifted from the shared validation prompt, the Codex layer would
  become a competing authority source.

## Recommended Next Action

Proceed with the narrow implementation and keep the new skill a thin wrapper around the
shared validation prompt, with the mandatory
`05 - Validation Strategy - Summary.md` artifact discipline called out explicitly.
