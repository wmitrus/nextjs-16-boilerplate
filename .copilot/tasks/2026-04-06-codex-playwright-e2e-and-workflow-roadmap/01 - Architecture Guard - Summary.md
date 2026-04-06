# 01 - Architecture Guard - Summary

## Objective

Review the current Codex compatibility layer before adding `07 - Playwright E2E Agent`
and determine whether the layer is structurally ready to be called complete after this
addition.

## Current-State Findings

### MAJOR

- The only remaining numbered Codex agent gap was `07 - Playwright E2E`. Every other
  numbered role already had a repo-local Codex surface.
- Because `08 - Workflow Orchestrator` explicitly relies on `07` when real-browser
  evidence is required, leaving `07` absent made the Codex orchestration package
  structurally incomplete.

### MINOR

- The shared Playwright E2E prompt and Copilot agent both referenced the summary
  template directory generically rather than the repo's actual template file path. The
  real file is
  `docs/ai/templates/specialist-summaries/07 - Playwright E2E - Summary Template.md`.

## Docs vs Code Drift

- The drift was narrow but important: the mapping tables in `AGENTS.md` and
  `REPOSITORY_AI_CONTEXT.md` still showed no Codex surface for agent `07`, and the
  Codex guide layer had no corresponding `07` entry.
- The repo already contained enough workflow sources to justify a Codex workflow
  roadmap, but that roadmap did not yet exist.

## Architectural Assessment

The safe path is:

- add `.agents/skills/playwright-e2e/SKILL.md`
- add `docs/ai/codex/07 - Playwright E2E Agent.md`
- wire the new skill into the compatibility maps and guide indices
- correct the stale template-path wording in the shared `07` sources
- add a workflow roadmap that is explicitly tied to existing repository workflow sources

No deeper redesign is needed first.

## Risks

- Leaving `07` absent would keep the Codex numbered agent package incomplete.
- Leaving the stale template reference in place would make artifact-backed `07` work
  more error-prone.
- A roadmap that ignored the actual repo workflow inventory would create a second
  imaginary process layer.

## Recommended Next Action

Implement `07` first, then publish a Codex workflow roadmap that explains:

- which workflows already make sense in Codex
- why they are usable as workflow skills rather than ZenFlow-style workflow engines
- what build order is most practical after the numbered agent set is complete
