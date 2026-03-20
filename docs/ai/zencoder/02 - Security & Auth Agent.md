## What it does

Prompt source used by Zencoder: [docs/ai/general/02 - Security & Auth Agent.md](../general/02%20-%20Security%20%26%20Auth%20Agent.md)

Zencoder keeps its agent registration outside the repository. This guide points to the repo-hosted prompt source that backs the role.

- Specializes in auth and security review for this repository
- Focuses on authentication boundaries, authorization enforcement, tenant/org context, trust boundaries, provider isolation, and sensitive-data exposure
- Produces the security/trust-boundary review that constrains later implementation

## When to use it

- When a change may affect authentication or authorization enforcement
- When tenant or org trust needs review
- When route handlers or server actions may expose sensitive behavior
- When you need to verify provider isolation and server-side enforcement points

## Auth-Flow Note

For any Clerk/bootstrap/onboarding or middleware auth-routing review:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios

## Related ZenFlow workflows

- [feature-development.md](../../../.zenflow/workflows/feature-development.md)
- [safe-refactor.md](../../../.zenflow/workflows/safe-refactor.md)
- [security-incident-workflow.md](../../../.zenflow/workflows/security-incident-workflow.md)
