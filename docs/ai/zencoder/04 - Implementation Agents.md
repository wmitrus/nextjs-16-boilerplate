> **THIS FILE IS A DESCRIPTION GUIDE — NOT THE AGENT PROMPT.**
> The real Zencoder prompt source that controls actual behavior is:
> **`docs/ai/general/04 - Implementation Agents.md`**
> All rule changes, security rules, and behavioral updates MUST be applied to that file.
> Content added here does NOT affect how the Zencoder agent behaves.

## What it does

Prompt source used by Zencoder: [**`docs/ai/general/04 - Implementation Agents.md`**](../general/04%20-%20Implementation%20Agents.md)

Zencoder keeps its agent registration outside the repository. This guide points to the repo-hosted prompt source that backs the role.

- Specializes in making code changes after the design constraints are already known
- Focuses on minimal safe implementation, test updates, and focused validation
- Explicitly executes within architecture, security, runtime, and validation constraints already established elsewhere

## When to use it

- When the architecture, security, runtime, and validation constraints are already clear
- When the task is to make the smallest safe patch rather than re-decide the design
- When code and tests need to be updated under already-approved guardrails

## Script and Tooling Security

When implementing or modifying any `scripts/` file:

- never use dynamically constructed file paths in `fs` operations without `path.resolve()` + base-directory confinement check (CWE-22)
- never pass env-var-sourced URLs to `fetch()` without protocol + hostname validation (CWE-918)
- upstream CLI arg allowlist validation does not replace point-of-use guards
- duplicate-sensitive writes also need DB-backed uniqueness, not only service-layer preflight checks (SEC-21)
- logs and noop email transports must not expose raw emails or token-bearing URLs; production must not silently fall back to noop email delivery (SEC-22)
- see canonical patterns in `docs/ai/general/02 - Security & Auth Agent.md` SCRIPT AND TOOLING SECURITY RULES

## Auth-Flow Note

For any change touching Clerk auth, bootstrap routing, onboarding redirects, auth middleware, root auth layout boundaries, or `/users` access control:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios
- do not mark the task complete until the affected scenarios are explicitly checked or clearly marked as deferred or blocked

## Example use cases

- "Apply this fix under the architecture and security constraints already established by earlier agents."
- "Update this module to implement the approved design — the constraints are documented in `constraints.md`."
- "Make the smallest safe change to fix this bug without redesigning the surrounding structure."
- "Update the affected tests to cover this behavior change without widening the test surface unnecessarily."
- "Implement this feature exactly as scoped — stop and report if anything requires a design decision."

## Related ZenFlow workflows

- [feature-development.md](../../../.zenflow/workflows/feature-development.md)
- [safe-refactor.md](../../../.zenflow/workflows/safe-refactor.md)
- [incident-investigation.md](../../../.zenflow/workflows/incident-investigation.md)
- [security-incident-workflow.md](../../../.zenflow/workflows/security-incident-workflow.md)
