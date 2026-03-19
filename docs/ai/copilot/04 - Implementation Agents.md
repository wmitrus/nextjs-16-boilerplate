## What it does

Real agent file: [implementation-agent.agent.md](../../../.github/agents/implementation-agent.agent.md)

- Specializes in making code changes after the design constraints are already known
- Focuses on:
  - minimal safe implementation
  - test updates
  - focused validation
  - preserving architecture, security, and runtime guardrails
- Uses `read`, `search`, `edit`, `execute`, and `todo`
- Explicitly defers authority to:
  - Architecture Guard
  - Security & Auth
  - Next.js Runtime
  - Validation Strategy

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

## Example prompts to try

- "Implement the approved auth bootstrap landing-route fix."
- "Apply the runtime-safe cookie handoff change and update the relevant tests."
- "Make the smallest safe patch for this reviewed PR feedback."
- "Implement this design without changing architecture."
