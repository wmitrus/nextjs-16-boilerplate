## What it does

Prompt source used by Zencoder: [docs/ai/general/04 - Implementation Agents.md](../general/04%20-%20Implementation%20Agents.md)

Zencoder keeps its agent registration outside the repository. This guide points to the repo-hosted prompt source that backs the role.

- Specializes in making code changes after the design constraints are already known
- Focuses on minimal safe implementation, test updates, and focused validation
- Explicitly executes within architecture, security, runtime, and validation constraints already established elsewhere

## When to use it

- When the architecture, security, runtime, and validation constraints are already clear
- When the task is to make the smallest safe patch rather than re-decide the design
- When code and tests need to be updated under already-approved guardrails

## Auth-Flow Note

For any change touching Clerk auth, bootstrap routing, onboarding redirects, auth middleware, root auth layout boundaries, or `/users` access control:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios
- do not mark the task complete until the affected scenarios are explicitly checked or clearly marked as deferred or blocked

## Related ZenFlow workflows

- [feature-development.md](../../../.zenflow/workflows/feature-development.md)
- [safe-refactor.md](../../../.zenflow/workflows/safe-refactor.md)
- [incident-investigation.md](../../../.zenflow/workflows/incident-investigation.md)
- [security-incident-workflow.md](../../../.zenflow/workflows/security-incident-workflow.md)
