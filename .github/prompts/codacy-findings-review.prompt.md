---
description: 'Review a local Codacy findings JSON artifact, group by severity and rule, verify false positives carefully, decide whether noisy rules should stay enabled, and propagate confirmed patterns into AI instructions.'
name: 'Codacy Findings Review'
argument-hint: 'Pass the local findings JSON path, for example .codacy/reports/codacy-findings.json'
agent: '08 - Workflow Orchestrator'
---

> **Leantime Integration Required**
> At task open and close, invoke the `10 - Leantime Integration Agent`.
> Reference: `docs/ai/general/LEANTIME_AUTOMATION.md`

Start a local Codacy findings review using `08 - Workflow Orchestrator`.

Workflow references:

- `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md`
- `.zenflow/workflows/codacy-findings-review.md`

Task input package:

- treat the local findings JSON file as the authoritative finding list
- treat live repository code as the source of truth for classification
- do not assume Codacy is correct without reading the actual code
- cross-reference every finding against `docs/ai/general/SECURITY_CODING_PATTERNS.md`

Required workflow:

- create `.copilot/tasks/{task_id}/plan.md` first
- create `intake.md` immediately after reading the JSON file
- normalize and deduplicate findings before triage
- group findings by severity first, then by rule/type
- produce `scope-review.md` to separate runtime code from tests/scripts/dev-only tooling noise
- within equal severity, prioritize `src/security`, `src/core`, `src/modules`, and `src/app`, then shared runtime code, then tests/E2E, then scripts, and only then `.vscode/` and other dev-only files
- review repeated rules in `rule-review.md` and decide keep/scope/disable
- for every finding, classify as real risk, latent risk, false positive, or tooling noise
- do not propose suppressions or fixes until the real code at that location has been read
- if durable patterns are confirmed, update `docs/ai/general/SECURITY_CODING_PATTERNS.md` and propagate to AI instructions

Required task artifacts (in `.copilot/tasks/{task_id}/`):

- `plan.md`
- `intake.md`
- `scope-review.md`
- `triage-{severity}.md`
- `rule-review.md`
- `remediation.md`
- `patterns-propagation-report.md`
- `validation.md`
- `final-summary.md`

Required final summary structure:

1. Severity summary
2. Type/rule summary
3. Real risks
4. Confirmed false positives
5. Tooling noise / out-of-scope findings
6. Rules to keep
7. Rules to scope or disable
8. AI instruction updates made
9. Recommended next actions

Important review discipline:

- every finding must be checked carefully for false-positive status
- repeated false positives must not remain only as chat context; convert them into durable SEC-XX guidance
- if a rule repeatedly produces low-signal results in this repository, say so directly and recommend scope tuning or disabling instead of endless code churn
- if code changes are made, record focused validation results explicitly instead of assuming the review is complete
