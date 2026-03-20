## What it does

Prompt source used by Zencoder: [docs/ai/general/03 - Next.js Runtime Agent.md](../general/03%20-%20Next.js%20Runtime%20Agent.md)

Zencoder keeps its agent registration outside the repository. This guide points to the repo-hosted prompt source that backs the role.

- Specializes in Next.js runtime correctness for this repository
- Focuses on App Router behavior, server vs client boundaries, route handlers, server actions, `src/proxy.ts`, caching/revalidation, and Edge vs Node constraints
- Produces runtime guidance before implementation or sign-off

## When to use it

- When a change touches App Router behavior or route boundaries
- When server/client placement is unclear
- When `src/proxy.ts`, route handlers, or server actions may be in the wrong runtime boundary
- When caching, revalidation, or Edge vs Node assumptions may be unsafe

## Auth-Flow Note

For any Clerk/bootstrap/onboarding or middleware auth-routing review:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios

## Related ZenFlow workflows

- [feature-development.md](../../../.zenflow/workflows/feature-development.md)
- [safe-refactor.md](../../../.zenflow/workflows/safe-refactor.md)
- [incident-investigation.md](../../../.zenflow/workflows/incident-investigation.md)
- [security-incident-workflow.md](../../../.zenflow/workflows/security-incident-workflow.md)
