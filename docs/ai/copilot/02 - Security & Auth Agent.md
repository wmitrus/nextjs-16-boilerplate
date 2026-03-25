> **THIS FILE IS A DESCRIPTION GUIDE — NOT THE AGENT.**
> The real Copilot agent that controls actual behavior is:
> **`.github/agents/security-auth.agent.md`**
> All rule changes, security rules, and behavioral updates MUST be applied to that file.
> Content added here does NOT affect how the Copilot agent behaves.

## What it does

Real agent file: [`.github/agents/security-auth.agent.md`](../../../.github/agents/security-auth.agent.md)

- Specializes in auth and security review for this repository
- Focuses on:
  - authentication boundaries
  - authorization enforcement
  - tenant and org context
  - trust boundaries
  - Clerk or provider isolation
  - sensitive-data exposure
  - runtime placement for auth-sensitive behavior
- Uses only `read`, `search`, and `web`, so it stays review-oriented and does not drift into implementation
- Returns findings in a stable security review shape:
  - Objective
  - Current-State Findings
  - Trust Boundary Assessment
  - Docs vs Code Drift
  - Risks
  - Recommended Next Action

## When to use it

- When a change may affect authentication or authorization enforcement
- When tenant or org trust needs review
- When route handlers or server actions may expose sensitive behavior
- When you need to verify provider isolation and server-side enforcement points

## Script and Tooling Security

Security rules apply to `scripts/` and tooling in addition to application code.

Always flag:

- dynamically constructed file paths used in `fs` operations without `path.resolve()` and base-directory confinement check (CWE-22 — path traversal)
- env-var-sourced or user-controlled URLs passed to `fetch()` or HTTP clients without protocol + hostname validation (CWE-918 — SSRF)

Canonical guard patterns live in `docs/ai/general/02 - Security & Auth Agent.md` under SCRIPT AND TOOLING SECURITY RULES.

## Auth-Flow Note

For any Clerk/bootstrap/onboarding or middleware auth-routing review:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios

## Example prompts to try

- "Review this Clerk bootstrap redirect change for trust-boundary risks."
- "Check whether this server action enforces authorization in the right layer."
- "Assess whether tenant context is derived safely across proxy, route handlers, and layouts."
- "Review this auth flow for provider leakage and sensitive-data exposure."

## Available slash prompt

Real prompt file: [auth-flow-change-review.prompt.md](../../../.github/prompts/auth-flow-change-review.prompt.md)

```bash
/Auth Flow Change Review
```
