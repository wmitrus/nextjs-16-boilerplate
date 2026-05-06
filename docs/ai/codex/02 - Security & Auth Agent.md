> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Codex skill that controls behavior is:
> **`.agents/skills/security-auth/SKILL.md`**
> All rule changes, security rules, and behavioral updates must be applied to that file
> and the shared authority docs.

## What it does

Real Codex skill file: [`.agents/skills/security-auth/SKILL.md`](../../../.agents/skills/security-auth/SKILL.md)

- Specializes in auth and security review for this repository
- Focuses on authentication boundaries, authorization enforcement, tenant and org
  context, trust boundaries, provider isolation, and sensitive-data exposure
- Uses the shared repository security rule catalogue before forming conclusions
- Produces the security review that constrains later implementation or refactor work

## When to use it

- When a change may affect authentication or authorization enforcement
- When tenant or organization trust needs review
- When route handlers or server actions may expose sensitive behavior
- When you need to verify provider isolation and server-side enforcement points
- When scripts or tooling use file I/O or HTTP with dynamic inputs and need a security
  check

## Startup Note

The skill reads the shared authority docs first:

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/02 - Security & Auth Agent.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`

For auth-routing review, it also reads:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

## Output Shape

For substantial answers, the skill uses:

1. Objective
2. Current-State Findings
3. Trust Boundary Assessment
4. Docs vs Code Drift
5. Risks
6. Recommended Next Action

## Artifact Discipline

For artifact-backed work, the skill must create or update exactly one persistent
summary artifact:

- `.copilot/tasks/{task_id}/02 - Security & Auth - Summary.md`

It updates that same file on later runs instead of creating duplicates.

## Example prompts to try

- "Review this server action for authorization gaps before we implement it."
- "Assess whether this tenant-context change is safe across proxy, route handlers, and layouts."
- "Check this Clerk/bootstrap flow for trust-boundary issues."
- "Review this script for SSRF or path-traversal risk."
