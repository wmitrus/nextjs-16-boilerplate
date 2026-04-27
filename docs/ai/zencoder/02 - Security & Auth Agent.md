> **THIS FILE IS A DESCRIPTION GUIDE — NOT THE AGENT PROMPT.**
> The real Zencoder prompt source that controls actual behavior is:
> **`docs/ai/general/02 - Security & Auth Agent.md`**
> All rule changes, security rules, and behavioral updates MUST be applied to that file.
> Content added here does NOT affect how the Zencoder agent behaves.

## What it does

Prompt source used by Zencoder: [**`docs/ai/general/02 - Security & Auth Agent.md`**](../general/02%20-%20Security%20%26%20Auth%20Agent.md)

Zencoder keeps its agent registration outside the repository. This guide points to the repo-hosted prompt source that backs the role.

- Specializes in auth and security review for this repository
- Focuses on authentication boundaries, authorization enforcement, tenant/org context, trust boundaries, provider isolation, and sensitive-data exposure
- Produces the security/trust-boundary review that constrains later implementation

## When to use it

- When a change may affect authentication or authorization enforcement
- When tenant or org trust needs review
- When route handlers or server actions may expose sensitive behavior
- When you need to verify provider isolation and server-side enforcement points
- When reviewing or writing `scripts/` or tooling code that uses file I/O or HTTP with dynamic inputs

## Script and Tooling Security

Security rules apply to `scripts/` and tooling in addition to application code.

Always flag:

- dynamically constructed file paths in `fs` operations without `path.resolve()` + base-directory confinement check (CWE-22 — path traversal)
- env-var-sourced or user-controlled URLs passed to `fetch()` or HTTP clients without protocol + hostname allowlist validation (CWE-918 — SSRF)
- upstream allowlist validation of CLI args does not substitute for point-of-use guards
- duplicate-sensitive write paths that rely only on service-layer preflight reads and do not enforce DB uniqueness (SEC-21)
- raw email addresses or token-bearing URLs in logs, noop transports, or fallback email paths (SEC-22)
- silent production fallback to noop email delivery or unsanitized email header / HTML interpolation (SEC-22)

Canonical guard patterns live in `docs/ai/general/02 - Security & Auth Agent.md` under SCRIPT AND TOOLING SECURITY RULES.

## Auth-Flow Note

For any Clerk/bootstrap/onboarding or middleware auth-routing review:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios

## Example use cases

- "Review this server action for authorization gaps before implementation."
- "Verify that this Clerk integration change preserves provider isolation in the domain."
- "Assess whether this route handler enforces the correct trust boundaries."
- "Review this tenant-context change for potential data leakage risks."
- "Check whether this permission check is server-side and cannot be bypassed from the client."

## Related ZenFlow workflows

- [feature-development.md](../../../.zenflow/workflows/feature-development.md)
- [safe-refactor.md](../../../.zenflow/workflows/safe-refactor.md)
- [security-incident-workflow.md](../../../.zenflow/workflows/security-incident-workflow.md)
