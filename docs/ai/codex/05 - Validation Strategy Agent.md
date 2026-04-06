> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Codex skill that controls behavior is:
> **`.agents/skills/validation-strategy/SKILL.md`**
> All rule changes, validation rules, and behavioral updates must be applied to that
> file and the shared authority docs.

## What it does

Real Codex skill file: [`.agents/skills/validation-strategy/SKILL.md`](../../../.agents/skills/validation-strategy/SKILL.md)

- Specializes in repository validation posture and minimum safe validation scope
- Focuses on choosing the right level between unit, integration, e2e, contract-style,
  and CI validation
- Flags over-mocking, false confidence, and wasteful validation expansion
- Produces the validation review or validation plan that constrains later execution

## When to use it

- When you need the minimum safe validation scope for a change
- When you want a repository-wide validation posture review
- When the main question is validation quality, validation level, over-mocking, or
  false confidence rather than design or implementation
- When a proposed test expansion needs risk-based justification

## Startup Note

The skill reads the shared authority docs first:

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/05 - Validation Strategy Agent.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md` when validation risk touches security

For auth-routing review, it also reads:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

## Output Shape

For substantial answers, the skill uses:

1. Objective
2. Mode
3. Current-State Findings
4. Validation-Risk Assessment
5. Recommended Validation Scope
6. Risks and Tradeoffs
7. Validation Commands or Checks
8. Recommended Next Action

## Artifact Discipline

For artifact-backed work, the skill must create or update exactly one persistent
summary artifact:

- `.copilot/tasks/{task_id}/05 - Validation Strategy - Summary.md`

It updates that same file on later runs instead of creating duplicates.

## Example prompts to try

- "Use Validation Strategy to decide the minimum safe validation scope for this auth fix."
- "Review whether this repo's current CI and test posture is enough for tenant-sensitive changes."
- "Assess whether this route-handler change needs unit, integration, or e2e validation."
- "Identify where our current tests are over-mocked and creating false confidence."
