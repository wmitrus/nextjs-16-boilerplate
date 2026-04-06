> **THIS FILE IS A DESCRIPTION GUIDE — NOT THE REAL SKILL.**
> The real Codex skill that controls behavior is:
> **`.agents/skills/architecture-guard/SKILL.md`**
> All rule changes, security rules, and behavioral updates MUST be applied to that file and the shared authority docs.

## What it does

Real Codex skill file: [`.agents/skills/architecture-guard/SKILL.md`](../../../.agents/skills/architecture-guard/SKILL.md)

- Acts as the strict architecture reviewer for this repository
- Focuses on modular-monolith boundaries, dependency direction, DI discipline, security-boundary placement, runtime-boundary correctness, and docs-vs-code drift
- Uses the shared repository authority docs before forming conclusions
- Returns an architecture-first review before risky implementation work begins

## When to use it

- When a change may affect module boundaries or ownership
- When dependency direction or DI/composition discipline may drift
- When auth-routing shape needs architecture review before implementation
- When you want a repository-reality check instead of design-by-document

## Startup Note

The skill reads the shared authority docs first:

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/01 - Architecture Guard Agent.md`

For auth/bootstrap/onboarding review, it also reads:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

## Output Shape

For substantial answers, the skill uses:

1. Objective
2. Current-State Findings
3. Docs vs Code Drift
4. Architectural Assessment
5. Risks
6. Recommended Next Action

## Example prompts to try

- "Review this auth-routing change for architecture risks before we implement it."
- "Assess whether this refactor preserves modular-monolith boundaries."
- "Compare these two designs and call out any docs-vs-code drift."
- "Review this PR for DI, dependency direction, and runtime-boundary violations."
