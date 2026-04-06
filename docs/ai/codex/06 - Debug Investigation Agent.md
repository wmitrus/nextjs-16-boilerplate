> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Codex skill that controls behavior is:
> **`.agents/skills/debug-investigation/SKILL.md`**
> All rule changes, investigation rules, and behavioral updates must be applied to that
> file and the shared authority docs.

## What it does

Real Codex skill file: [`.agents/skills/debug-investigation/SKILL.md`](../../../.agents/skills/debug-investigation/SKILL.md)

- Specializes in evidence-first investigation for complex bugs and unstable flows
- Focuses on ambiguous symptoms, env-driven divergence, race conditions, ordering
  issues, and cross-layer failure chains
- Separates confirmed evidence from hypotheses before handoff to Architecture,
  Security, Runtime, Validation, or Implementation
- Produces the investigation summary that reduces ambiguity for the next specialist

## When to use it

- When the bug is ambiguous and the right specialist is not yet clear
- When behavior is intermittent, timing-sensitive, or env-driven
- When multiple layers may participate in the failure chain
- When you need evidence before deciding whether the next step is architecture,
  security, runtime, validation, or implementation

## Startup Note

The skill reads the shared authority docs first:

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/ARTIFACTS_GUIDE.md`
- `docs/ai/general/06 - Debug Investigation Agent.md`

For security-sensitive investigations, it also reads:

- `docs/ai/general/SECURITY_CODING_PATTERNS.md`

For auth-routing investigation, it also reads:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

## Output Shape

For substantial answers, the skill uses:

1. Objective
2. Symptom Summary
3. Confirmed Evidence
4. Execution Path
5. Source-of-Truth Analysis
6. Likely Failure Points
7. Hypotheses
8. Missing Evidence / Uncertainty
9. Recommended Next Action

## Artifact Discipline

For artifact-backed work, the skill must create or update exactly one persistent
summary artifact:

- `.copilot/tasks/{task_id}/06 - Debug Investigation - Summary.md`

It updates that same file on later runs instead of creating duplicates.

## Example prompts to try

- "Use Debug Investigation to trace this intermittent onboarding redirect failure."
- "Investigate why this route sometimes hangs after sign-in only in dev."
- "Trace this provisioning failure across proxy, bootstrap, and onboarding."
- "Investigate this env-dependent auth bug and separate confirmed evidence from hypotheses."
