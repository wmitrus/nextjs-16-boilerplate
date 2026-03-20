## What it does

Prompt source used by Zencoder: [docs/ai/general/01 - Architecture Guard Agent.md](../general/01%20-%20Architecture%20Guard%20Agent.md)

Zencoder keeps its agent registration outside the repository. This guide points to the repo-hosted prompt source that backs the role.

- Acts as the strict architecture reviewer for this repository
- Focuses on modular-monolith boundaries, dependency direction, DI discipline, security placement, runtime-boundary correctness, and docs-vs-code drift
- Produces an architecture-first review before risky implementation work starts

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

## Related ZenFlow workflows

- [feature-development.md](../../../.zenflow/workflows/feature-development.md)
- [safe-refactor.md](../../../.zenflow/workflows/safe-refactor.md)
- [security-incident-workflow.md](../../../.zenflow/workflows/security-incident-workflow.md)
