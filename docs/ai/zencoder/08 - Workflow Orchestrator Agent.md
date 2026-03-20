## What it does

Prompt source used by Zencoder: [docs/ai/general/08 - Workflow Orchestrator Agent.md](../general/08%20-%20Workflow%20Orchestrator%20Agent.md)

Zencoder keeps its agent registration outside the repository. This guide points to the repo-hosted prompt source that backs the role.

- Defines `08 - Workflow Orchestrator` as the process owner for multi-step tasks
- Focuses on plan-first task setup, intake normalization, specialist sequencing, artifact continuity, and checklist synchronization
- In Zencoder, day-to-day orchestration is usually expressed through the ZenFlow workflow files under `.zenflow/workflows/`

## When to use it

- When one task needs multiple specialist agents in sequence
- When you want durable task artifacts and explicit handoffs
- When work must be designed, implemented, validated, and documented as one controlled flow
- When requirements arrive as a brief, docs, attachments, or a mixed input package that needs normalization

## Auth-Flow Note

For any auth/bootstrap/onboarding orchestration:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios
- use `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md` for the final Playwright run artifact when relevant

## Related ZenFlow workflows

- [feature-development.md](../../../.zenflow/workflows/feature-development.md)
- [safe-refactor.md](../../../.zenflow/workflows/safe-refactor.md)
- [incident-investigation.md](../../../.zenflow/workflows/incident-investigation.md)
- [security-incident-workflow.md](../../../.zenflow/workflows/security-incident-workflow.md)
