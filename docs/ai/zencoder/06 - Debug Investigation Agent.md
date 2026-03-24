## What it does

Prompt source used by Zencoder: [docs/ai/general/06 - Debug Investigation Agent.md](../general/06%20-%20Debug%20Investigation%20Agent.md)

Zencoder keeps its agent registration outside the repository. This guide points to the repo-hosted prompt source that backs the role.

- Defines `06 - Debug Investigation` as an investigation-first specialist for complex bugs, unstable flows, env-driven divergence, race conditions, and unclear auth/runtime/data failure chains
- Anchors investigation to evidence gathering, flow tracing, and uncertainty reduction before remediation begins
- Produces the evidence package other specialists can use

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

## Example use cases

- "This auth redirect is behaving differently in production vs dev — investigate the divergence."
- "The onboarding flow intermittently skips a step; gather evidence before we guess at a fix."
- "Trace the execution path for this failing route and tell me where it diverges from expected behavior."
- "I don't know which layer owns this failure — investigate and recommend the right specialist."
- "This race condition appears only under load — map the execution path and surface the timing window."

## Related ZenFlow workflows

- [incident-investigation.md](../../../.zenflow/workflows/incident-investigation.md)
- [security-incident-workflow.md](../../../.zenflow/workflows/security-incident-workflow.md)
