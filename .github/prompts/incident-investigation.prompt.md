---
description: 'Start a full orchestrated incident investigation for a confirmed production failure or multi-layer regression through the Workflow Orchestrator.'
name: 'Incident Investigation'
argument-hint: 'Incident symptoms, logs, repro steps, affected user flow, environment context, or recent changes'
agent: '08 - Workflow Orchestrator'
---

> **Leantime Integration Required**
> At task open and close, invoke the `10 - Leantime Integration Agent`.
> Reference: `docs/ai/general/LEANTIME_AUTOMATION.md`

Start a full incident investigation using `08 - Workflow Orchestrator`.

Use this prompt for confirmed production failures or regressions where the root cause is unclear and a full specialist sequence is needed.

For standalone ambiguous debugging without a full workflow, use `/Debug Investigation` instead.

Task input package:

- treat the user request as the incident description
- treat attached files, logs, and referenced repository documents as the authoritative context sources
- do not invent root cause hypotheses that are not supported by the provided materials or repository evidence

Required workflow:

- create `.copilot/tasks/{task_id}/plan.md` first
- create `intake.md` immediately after `plan.md`
- in `intake.md`, normalize the symptom, environment, reproduction steps, affected area, logs, and known constraints
- always run Debug Investigation Agent first — gather evidence and trace the execution path before any specialist commits to a diagnosis
- run Next.js Runtime review only when Debug Investigation evidence points to routing, caching, server/client placement, or proxy behavior anomalies
- run Architecture Guard only when the proposed fix risks module boundary violations or DI regression
- do not run Security/Auth unless the incident involves auth flows, trust boundaries, or sensitive-data concerns — if it does, switch to `/Security Incident`
- consolidate Debug Investigation findings and specialist outputs into a remediation plan before implementation begins
- require every non-orchestrator specialist to create or update one persistent task summary file named with its agent number and name plus ` - Summary.md`
- implementation must not start until the root cause is confirmed and the fix scope is explicit
- after each meaningful step, update the relevant checklist state in `plan.md` and `intake.md` before moving forward

For auth/bootstrap/onboarding incidents:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory scenario checklist for affected flows

Incident investigation discipline:

- Debug Investigation runs first — never skip it for ambiguous or multi-layer failures
- do not diagnose before evidence is gathered
- keep the fix scope narrow and low-blast-radius
- if the incident is reclassified as a security issue during investigation, switch to `/Security Incident`

Required output:

1. Objective
2. Input Sources
3. Incident Classification
4. Planned Specialist Sequence
5. Artifacts To Be Produced
6. Recommended Next Action
