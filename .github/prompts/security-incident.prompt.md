---
description: 'Start a security incident investigation and remediation through the Workflow Orchestrator using the security-incident workflow sequence.'
name: 'Security Incident'
argument-hint: 'Incident description, affected surface, severity level, symptoms, or constraints'
agent: '08 - Workflow Orchestrator'
---

> **Leantime Integration Required**
> At task open and close, invoke the `10 - Leantime Integration Agent`.
> Reference: `docs/ai/general/LEANTIME_AUTOMATION.md`

Start a security incident investigation using `08 - Workflow Orchestrator`.

Task input package:

- treat the user request as the incident description
- treat attached files and referenced repository documents as the authoritative requirement sources
- do not invent scope that is not supported by the provided materials or repository evidence

Required workflow:

- create `.copilot/tasks/{task_id}/plan.md` first
- create `intake.md` immediately after `plan.md`
- in `intake.md`, normalize the incident description, affected surface, severity, symptoms, suspected root cause, and known constraints
- run Security/Auth Agent first — this is the primary authority for security incidents
- run Next.js Runtime review when the incident involves runtime placement, caching, route handler behavior, or middleware/proxy behavior
- run Architecture Guard when the proposed remediation risks crossing module boundaries or altering DI/composition
- consolidate specialist outputs into `constraints.md` before any remediation begins
- require every non-orchestrator specialist to create or update one persistent task summary file named with its agent number and name plus ` - Summary.md`
- do not begin implementation until the remediation constraints are explicit and Security/Auth has approved the fix direction
- after each meaningful step, update the relevant checklist state in `plan.md` and `intake.md` before moving forward

For auth/bootstrap/onboarding incidents:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory scenario checklist for affected flows

Security incident discipline:

- trust boundaries must be identified before any fix is proposed
- do not merge remediation with feature changes
- remediation scope must be the smallest safe fix
- if the incident is a data exposure or trust-boundary breach, stop before implementation and surface the full scope

Required output:

1. Objective
2. Input Sources
3. Incident Classification
4. Affected Security Surface
5. Planned Specialist Sequence
6. Artifacts To Be Produced
7. Recommended Next Action
