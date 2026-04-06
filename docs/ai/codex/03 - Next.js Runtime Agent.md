> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Codex skill that controls behavior is:
> **`.agents/skills/nextjs-runtime/SKILL.md`**
> All rule changes, runtime rules, and behavioral updates must be applied to that file
> and the shared authority docs.

## What it does

Real Codex skill file: [`.agents/skills/nextjs-runtime/SKILL.md`](../../../.agents/skills/nextjs-runtime/SKILL.md)

- Specializes in Next.js runtime correctness for this repository
- Focuses on App Router behavior, server vs client boundaries, route handlers, server
  actions, `src/proxy.ts`, caching and revalidation, Edge vs Node constraints, and
  Vercel-compatible behavior
- Uses the shared runtime rules before forming conclusions
- Produces the runtime review that constrains later implementation or refactor work

## When to use it

- When a change touches App Router behavior or route boundaries
- When server/client placement is unclear
- When `src/proxy.ts`, route handlers, or server actions may be in the wrong runtime
  boundary
- When caching, revalidation, or Edge vs Node assumptions may be unsafe

## Startup Note

The skill reads the shared authority docs first:

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/03 - Next.js Runtime Agent.md`

For auth-routing review, it also reads:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

## Output Shape

For substantial answers, the skill uses:

1. Objective
2. Current-State Findings
3. Runtime Boundary Assessment
4. Docs vs Code Drift
5. Risks
6. Recommended Next Action

## Artifact Discipline

For artifact-backed work, the skill must create or update exactly one persistent
summary artifact:

- `.copilot/tasks/{task_id}/03 - Next.js Runtime - Summary.md`

It updates that same file on later runs instead of creating duplicates.

## Example prompts to try

- "Review this App Router redirect flow for runtime-boundary mistakes."
- "Check whether this server action relies on unsafe Next.js runtime assumptions."
- "Assess whether this route handler belongs in a page/layout flow instead."
- "Review this proxy change for Edge-runtime compatibility and caching hazards."
