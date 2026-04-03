# Workflow 11 — Codacy Findings Review Workflow

Purpose:
Review a local Codacy findings JSON artifact, group findings by severity and type,
triage each finding carefully against live code, decide whether the rule itself is still
worth enforcing, and propagate any newly-confirmed patterns into the repository AI instructions
so the same false positives and fixes are not repeated in future PRs.

This workflow is for local Codacy findings artifacts such as:

- `.codacy/reports/codacy-findings.json`
- `.codacy/reports/codacy-findings-preview.json`

For Codacy PR comments focused only on CRITICAL/HIGH security findings, use
`Workflow 10 - Codacy Security Review Workflow`.

ZenFlow reference:

- `.zenflow/workflows/codacy-findings-review.md`

Mode ID:

- `codacy-findings-review`

Available agents:

- Workflow Orchestrator Agent
- Security & Auth Agent
- Architecture Guard Agent
- Implementation Agent
- Validation Strategy Agent

Before running this workflow, read:

- `AGENTS.md` (repository root)
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`
- `docs/ai/general/04 - Implementation Agents.md`

Repository note:

In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
Do not treat the absence of `middleware.ts` as a finding.

==================================================
WORKFLOW GOAL
==================================================

Use this workflow when a local Codacy run produced a findings JSON file and you want an AI extension to:

- read the final JSON artifact directly
- group findings by severity first, then by type/rule
- inspect the real code behind every finding
- classify each finding as real risk, latent risk, false positive, or tooling noise
- decide whether the underlying rule is still useful for this repository
- distinguish code fixes from rule/scope tuning
- propagate confirmed patterns into AI instructions and security pattern docs
- produce compact, reviewable artifacts instead of noisy chat-only output

==================================================
WORKFLOW PRINCIPLES
==================================================

Always:

- treat repository code as the source of truth, not the scanner output
- treat the JSON findings file as the source of the reported finding set
- deduplicate identical findings before triage
- group by severity first, then by rule/type, then by owning runtime/layer when useful
- within equal severity, prioritize production runtime layers ahead of tests, scripts, and local tooling
- read each affected file before classifying a finding
- verify whether the finding is in production code, test code, script code, or local tooling code
- cross-reference every finding against `docs/ai/general/SECURITY_CODING_PATTERNS.md`
- decide explicitly whether each noisy rule should stay enabled, be scoped, or be disabled

Never:

- assume a finding is real because Codacy reported it
- “fix” a finding without understanding the runtime inputs and trust boundary
- suppress a finding without first checking whether a better code pattern exists
- repeat the same false-positive remediation in code without updating the pattern docs
- mix production-risk findings and local-tooling noise into one undifferentiated list

==================================================
KEY DECISION RULES
==================================================

Rule 1 — Severity ordering is required.
Process findings in this order: error/highest severity first, then warning/lower severity.
Within each severity, group by rule/type.

Rule 2 — False-positive review is mandatory.
Every finding must be checked against live code and runtime context before any code change or ignore recommendation.

Rule 3 — Rule review is mandatory.
For each repeated rule, decide:

- keep as-is
- keep but narrow scope
- keep but document as known false-positive pattern
- disable for this repository or path scope

Do not make engineers refix the same scanner noise forever if the rule is structurally mismatched to the codebase.

Rule 4 — Real fix beats suppress.
When the pattern can be improved safely, prefer a code change over a suppression or ignore recommendation.

Rule 5 — Patterns must propagate.
If a finding leads to a new durable rule, update `docs/ai/general/SECURITY_CODING_PATTERNS.md` and propagate the instruction to the relevant AI instruction files before closing the workflow.

Rule 6 — Scope matters.
Findings in `.vscode/`, one-off dev tools, local scripts, tests, or generated artifacts may deserve a different decision than findings in `src/app`, `src/security`, `src/modules`, or `src/core`.

Rule 7 — Repository priority ordering is required.
When multiple findings have the same severity, review them in this order:

1. `src/security`, `src/core`, `src/modules`, `src/app`
2. runtime-supporting shared code used by production paths
3. tests and E2E coverage code
4. scripts/CLI tooling
5. local editor tooling, `.vscode/*`, and other dev-only files

Do not spend the same review energy on local tooling noise as on production runtime code.

==================================================
WHEN TO USE THIS WORKFLOW
==================================================

Use for:

- local Codacy findings JSON files
- large scanner result sets that need triage beyond raw SARIF
- cases where scanner output includes a mix of real issues, false positives, and noisy rule classes
- cases where you want a rule-tuning recommendation, not only code fixes

Do not use for:

- a single known vulnerability with a clear fix
- production incident response
- architecture-only review with no scanner findings input

==================================================
EXPECTED USER INPUT
==================================================

Required:

- path to the local Codacy findings JSON file

Optional but helpful:

- path to the original SARIF file
- whether the user wants code changes now or review/design only
- whether Codacy Cloud rules should be tuned after triage

==================================================
ORDERED WORKFLOW STEPS
==================================================

Step 1. Intake — Read and Normalize Findings JSON

- Read the local findings JSON file.
- Validate the file shape and fail clearly if the artifact is malformed.
- Normalize each finding into a compact structure:
  - severity/level
  - ruleId/type
  - message
  - file path
  - line/column
- Deduplicate identical findings by `level + ruleId + file + line + message`.
- Cross-reference each finding against `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
- Assign an initial review priority using the repository ordering rules.

Output required from this step:

- `.copilot/tasks/{task_id}/intake.md`

The artifact must include:

- source artifact path
- total findings before dedupe
- total findings after dedupe
- grouping by severity
- within each severity, grouping by rule/type
- initial SEC-XX matches
- initial repository priority order for grouped findings

---

Step 2. Scope and Noise Review

- Tag each finding by code area:
  - production app/runtime
  - security/auth
  - tests
  - scripts/CLI
  - local tooling/editor/dev-only
- Call out findings that likely should not be in the normal remediation queue.
- Propose path-scoping or exclusion follow-up where the tool is scanning obviously low-signal areas.
- Assign each finding group a repository review priority based on the ordering rules above.

Output required from this step:

- `.copilot/tasks/{task_id}/scope-review.md`

The artifact must include:

- findings count by code area
- files or directories causing disproportionate noise
- recommended exclusions or path-scope changes
- review priority order for the grouped findings

---

Step 3. Severity-First Triage

Process severity groups one at a time.
Within each severity, process rule/type groups in repository priority order.

For each finding:

1. Read the affected file.
2. Identify runtime context and reachable inputs.
3. Classify:
   - Real Risk
   - Latent Risk
   - False Positive
   - Tooling Noise / Out-of-Scope
4. If it matches an existing SEC-XX entry, apply that pattern and say whether the current finding confirms or extends it.
5. Decide the action:
   - code fix
   - documentation/pattern update
   - rule scope change
   - Codacy ignore or suppress as last resort
   - no action required

Output required from this step:

- `.copilot/tasks/{task_id}/triage-{severity}.md`

Each artifact must include:

- findings grouped by rule/type
- per-finding classification and rationale
- exact files to inspect or change
- note of whether the finding is likely false positive or real risk

---

Step 4. Rule Necessity Review

Aggregate findings by rule and decide whether each rule is helping or harming signal quality in this repository.

For each rule:

- count findings
- identify dominant file types and layers
- identify percentage that look like false positives or low-signal tooling noise
- decide:
  - keep
  - keep with narrower scope
  - keep but document pattern for AI
  - disable or demote in Codacy if the signal is structurally poor

Output required from this step:

- `.copilot/tasks/{task_id}/rule-review.md`

The artifact must include:

- one section per repeated rule
- keep/adjust/disable decision
- rationale tied to repository patterns
- whether AI instructions need to be updated

---

Step 5. Remediation Plan or Implementation

If the user requested implementation:

- apply the minimum safe code fixes first
- avoid broad refactors
- update tests only where behavior changes or scanner hardening needs proof

If the user requested review only:

- produce a prioritized remediation plan instead of editing code

Output required from this step:

- `.copilot/tasks/{task_id}/remediation.md`

The artifact must include:

- must-fix findings
- follow-up findings
- rule-tuning actions
- whether code changes were applied or deferred

---

Step 6. Patterns and Prompt Propagation

For every durable false-positive pattern or remediation pattern confirmed during triage:

1. Update `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
2. If the pattern changes broad implementation behavior, update:
   - `AGENTS.md`
   - `docs/ai/general/02 - Security & Auth Agent.md`
   - `docs/ai/general/04 - Implementation Agents.md`
   - relevant `.github/agents/*.agent.md`
   - relevant workflow or prompt docs

Do not leave confirmed patterns only in chat or in a one-off findings report.

Output required from this step:

- `.copilot/tasks/{task_id}/patterns-propagation-report.md`

---

Step 7. Validation

If code changes were applied during this workflow:

- run focused validation at the right level for the risk
- prefer `pnpm lint --fix` over plain `pnpm lint` where linting is required by repository rules
- run `pnpm typecheck`
- run targeted tests for changed areas, and broader tests only when justified

If this was review-only with no edits:

- state that no validation commands were required

Output required from this step:

- `.copilot/tasks/{task_id}/validation.md`

---

Step 8. Final Review Summary

Produce a final summary organized exactly as follows:

1. Severity summary
2. Type/rule summary
3. Real risks
4. Confirmed false positives
5. Tooling noise / out-of-scope findings
6. Rules to keep
7. Rules to scope or disable
8. AI instruction updates made
9. Recommended next actions

Output required from this step:

- `.copilot/tasks/{task_id}/final-summary.md`

==================================================
THINGS PEOPLE OFTEN FORGET
==================================================

The workflow must explicitly check and report all of these:

- whether the findings artifact contains duplicates
- whether the scanner is analyzing dev-only or editor-extension code that should be excluded
- whether repeated false positives map to a reusable SEC-XX pattern
- whether Codacy rule tuning is better than repeated code churn
- whether findings in tests/scripts deserve a lower remediation priority than runtime code
- whether local tooling findings should be excluded or demoted rather than reviewed alongside production runtime code
- whether line numbers drifted relative to the original artifact
- whether a compact findings-only artifact should replace SARIF for human review
- whether there is a previous findings baseline that can distinguish newly introduced findings from historical noise

==================================================
COMPLETION CHECKLIST
==================================================

Before closing the workflow:

- [ ] Findings JSON was read and normalized successfully
- [ ] Findings were grouped by severity first, then by type/rule
- [ ] Every finding was checked against live code
- [ ] Every finding was classified as real risk, latent risk, false positive, or tooling noise
- [ ] Repeated rules received a keep/scope/disable decision
- [ ] Confirmed patterns were propagated into repository AI instructions
- [ ] Validation results were recorded if code changes were made
- [ ] Final summary artifact was written
