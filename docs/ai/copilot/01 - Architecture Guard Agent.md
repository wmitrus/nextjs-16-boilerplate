## What it does

Real agent file: [architecture-guard.agent.md](../../../.github/agents/architecture-guard.agent.md)

- Acts as the strict architecture reviewer for this repository
- Focuses on modular-monolith boundaries, dependency direction, DI discipline, security placement, runtime-boundary correctness, and docs-vs-code drift
- Uses only `read`, `search`, and `web`, so it stays review-oriented rather than drifting into implementation
- Returns findings in a stable review shape:
  - Objective
  - Current-State Findings
  - Docs vs Code Drift
  - Architectural Assessment
  - Risks
  - Recommended Next Action

## When to use it

- When a change may affect module boundaries or ownership
- When dependency direction or DI/composition discipline may drift
- When auth-routing shape needs architectural review before implementation
- When you want a repository-reality check instead of design-by-document

## Auth-Flow Note

For any Clerk/bootstrap/onboarding or middleware auth-routing review:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios

## Example prompts to try

- "Review this Clerk/bootstrap/onboarding routing change for architecture risks."
- "Assess whether this middleware refactor preserves modular-monolith boundaries."
- "Compare these two auth designs and call out docs-vs-code drift."
- "Review this PR for DI, dependency direction, and runtime-boundary violations."
