## What it does

Real agent file: [debug-investigation.agent.md](../../../.github/agents/debug-investigation.agent.md)

- Defines `06 - Debug Investigation` as an investigation-first specialist for:
  - complex bugs
  - unstable or intermittent flows
  - env-driven divergence
  - race conditions and ordering issues
  - unclear auth/runtime/data failure chains
  - provisioning and onboarding instability
- Anchors the agent to:
  - `00 - Agent Interaction Protocol.md`
  - `REPOSITORY_AI_CONTEXT.md`
  - `ARTIFACTS_GUIDE.md`
- Uses an evidence-first structure built around:
  - symptom summary
  - confirmed evidence
  - execution path
  - source-of-truth analysis
  - likely failure points
  - hypotheses
  - missing evidence
  - recommended next action

## When to use it

- When the bug is ambiguous and the right specialist is not yet clear
- When behavior is intermittent, env-driven, or timing-sensitive
- When you need evidence before handing off to Architecture, Security, Runtime, Validation, or Implementation
- When multiple layers may participate in the failure chain

## Auth-Flow Note

For any auth/bootstrap/onboarding investigation:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios

## Example prompts to try

- "Run Debug Investigation on this intermittent onboarding redirect failure."
- "Investigate why this route sometimes hangs after sign-in but only in dev."
- "Trace this provisioning failure across proxy.ts, bootstrap, and onboarding."
- "Investigate this env-dependent auth bug and identify the likely failure points."
- "Use Debug Investigation to separate confirmed evidence from hypotheses before we hand off to Runtime or Security."

## Available slash prompt

Real prompt file: [debug-investigation.prompt.md](../../../.github/prompts/debug-investigation.prompt.md)

```bash
/Debug Investigation
```
