## What it does

Real agent file: [nextjs-runtime.agent.md](../../../.github/agents/nextjs-runtime.agent.md)

- Specializes in Next.js runtime correctness for this repository
- Focuses on:
  - App Router behavior
  - server vs client boundaries
  - route handlers
  - server actions
  - `src/proxy.ts`
  - caching and revalidation
  - Edge vs Node constraints
  - Vercel-compatible behavior
  - env exposure and bundle separation
- Uses only `read`, `search`, and `web`, so it stays review-oriented instead of turning into an implementation agent
- Returns findings in a stable runtime review shape:
  - Objective
  - Current-State Findings
  - Runtime Boundary Assessment
  - Docs vs Code Drift
  - Risks
  - Recommended Next Action

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

## Example prompts to try

- "Review this App Router redirect flow for runtime-boundary mistakes."
- "Check whether this server action relies on unsafe Next.js runtime assumptions."
- "Assess whether this route handler belongs in a page/layout flow instead."
- "Review this proxy change for Edge-runtime compatibility and caching hazards."
