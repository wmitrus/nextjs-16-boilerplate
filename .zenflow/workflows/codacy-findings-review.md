# Workflow: Codacy Findings Review

## Purpose

Structured review of a local Codacy findings JSON artifact.
This workflow reads a compact findings file, groups findings by severity and rule,
checks each finding against live code, reviews whether the rule itself is worth keeping,
and propagates durable patterns into repository AI instructions.

Use this workflow for local findings artifacts such as:

- `.codacy/reports/codacy-findings.json`
- `.codacy/reports/codacy-findings-preview.json`

For PR-specific CRITICAL/HIGH security findings pasted from Codacy, use
`.zenflow/workflows/codacy-security-review.md` instead.

---

## Configuration

- **Artifacts Path**: `{@artifacts_path}` → `.zenflow/tasks/{task_id}`
- **Step Agent Presets**:
  - `workflow-orchestrator-agent`
  - `security-auth-agent`
  - `architecture-guard-agent`
  - `implementation-agent`
  - `validation-strategy-agent`

---

## Before Running

Read:

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`
- `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md`

---

## Artifact Execution Rule

For every workflow step:

- the file shown under `Output:` is mandatory
- the active agent must write the artifact before completing the step
- do not leave the result only in chat

---

## Leantime Integration

**This workflow must include Leantime steps at task open and close.**

Read: `docs/ai/general/LEANTIME_AUTOMATION.md`

At workflow start, invoke `10 - Leantime Integration Agent` to:

- Check for existing tasks and milestones.
- Create milestone and main task with HTML description.
- Patch status to W toku (4).
- Record task ID in the workflow intake artifact.

At workflow end, invoke `10 - Leantime Integration Agent` to:

- Patch status to Zrobione (0).
- Log time with `pnpm lt -- run time.log`.
- Update wiki if findings should persist.

---

## Workflow Steps

### [ ] Step: Plan and Intake

<!-- agent: workflow-orchestrator-agent -->

Read the local findings JSON path provided by the user.
Create the plan and the intake artifact.

Outputs:

- `{@artifacts_path}/plan.md`
- `{@artifacts_path}/intake.md`

The intake must include:

- source file path
- total findings before dedupe
- total findings after dedupe
- severity groups
- per-severity rule/type groups
- initial SEC-XX cross-reference
- initial repository priority order for grouped findings

---

### [ ] Step: Scope Review

<!-- agent: architecture-guard-agent -->

Separate findings into:

- production/runtime code
- security/auth code
- tests
- scripts/CLI
- local tooling/dev-only

Output:

- `{@artifacts_path}/scope-review.md`

Include:

- counts by area
- noisy directories
- recommended Codacy scope tuning
- repository review priority:
  1. `src/security`, `src/core`, `src/modules`, `src/app`
  2. shared runtime-supporting code
  3. tests and E2E
  4. scripts/CLI
  5. `.vscode/` and other local dev-only tooling

---

### [ ] Step: Severity Triage

<!-- agent: security-auth-agent -->

Process one severity level at a time.
Within a severity, group by rule/type and review in repository priority order.

Output:

- `{@artifacts_path}/triage-{severity}.md`

For each finding include:

- rule
- file and line
- runtime context
- classification: Real Risk / Latent Risk / False Positive / Tooling Noise
- SEC-XX match if present
- recommended action

---

### [ ] Step: Rule Review

<!-- agent: architecture-guard-agent -->
<!-- agent: security-auth-agent -->

Review repeated rules and decide:

- keep
- keep with narrower scope
- keep but document as known false-positive pattern
- disable or demote for this repository

Output:

- `{@artifacts_path}/rule-review.md`

---

### [ ] Step: Remediation

<!-- agent: implementation-agent -->

If implementation is in scope, apply the minimum safe fixes.
If not, write a prioritized remediation plan.

Output:

- `{@artifacts_path}/remediation.md`

---

### [ ] Step: Patterns Propagation

<!-- agent: security-auth-agent -->

Update `docs/ai/general/SECURITY_CODING_PATTERNS.md` and any relevant agent instructions
for durable patterns confirmed during the review.

Output:

- `{@artifacts_path}/patterns-propagation-report.md`

---

### [ ] Step: Validation

<!-- agent: validation-strategy-agent -->

If code changes were made, run focused validation and record the results.
If no code changes were made, record that this was review-only.

Output:

- `{@artifacts_path}/validation.md`

---

### [ ] Step: Final Summary

<!-- agent: workflow-orchestrator-agent -->

Output:

- `{@artifacts_path}/final-summary.md`

The summary must be organized as:

1. Severity summary
2. Type/rule summary
3. Real risks
4. Confirmed false positives
5. Tooling noise / out-of-scope findings
6. Rules to keep
7. Rules to scope or disable
8. AI instruction updates made
9. Recommended next actions
