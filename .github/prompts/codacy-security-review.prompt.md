---
description: 'Triage and remediate Codacy CRITICAL/HIGH security findings from a pull request, group by group, with a manual pause between groups for review.'
name: 'Codacy Security Review'
argument-hint: 'Paste Codacy findings from the PR comment — file paths, line numbers, rule names, and finding text'
agent: '08 - Workflow Orchestrator'
---

Start a Codacy security review using `08 - Workflow Orchestrator`.

ZenFlow workflow reference:

- `.zenflow/workflows/codacy-security-review.md`

Task input package:

- treat the pasted Codacy findings as the authoritative finding list
- treat the current branch code as the source of truth — inspect real code before classifying any finding
- do not invent scope beyond the listed findings
- cross-reference every finding against `docs/ai/general/SECURITY_CODING_PATTERNS.md` before classifying

Required workflow:

- create `.copilot/tasks/{task_id}/plan.md` first
- create `intake.md` immediately after `plan.md` — parse and group findings by vulnerability class
- **pause after intake** and present the grouped findings to the user before proceeding
- process one vulnerability group at a time — **pause after each group** for user review before the next
- run Security/Auth Agent for classification and pattern decisions (owns `SECURITY_CODING_PATTERNS.md`)
- run Implementation Agent for code changes (real fixes and suppressions)
- run Validation Strategy Agent for quality gates (`pnpm typecheck`, `pnpm lint`, `pnpm test`)
- produce a scanner ignore report as a task artifact — only findings whose code pattern still exists in source

Codacy review discipline:

- real code fix always beats inline suppress — eliminate the pattern from code before adding a comment
- inline `eslint-disable-next-line` is last resort; it must include a rationale comment on the preceding line
- when hardening is possible (e.g. confinement check, typed dispatch map, Map instead of Record), apply it before suppressing
- do NOT add findings to the scanner ignore table if they were resolved by a real code fix — those go in a "Resolved" section
- scanner ignore report must use current line numbers (code may have shifted from original Codacy lines)
- `docs/ai/general/SECURITY_CODING_PATTERNS.md` must be updated after every group; propagate to agent files only if new SEC-XX entries are added

Required task artifacts (in `.copilot/tasks/{task_id}/`):

- `plan.md` — step checklist and acceptance criteria
- `intake.md` — grouped finding list with initial SEC-XX cross-reference
- `group-{N}-{slug}.md` (one per group) — classification, fix/suppress decision, files changed, patterns matched or added
- `quality-gates.md` — typecheck/lint/test results
- `scanner-ignore-report.md` — Table 1: safe to ignore; Table 2: resolved by code fix
- `patterns-propagation-report.md` — SEC-XX entries added/updated, agent files changed

Required output from orchestrator:

1. Objective
2. Finding Groups (count per group)
3. SEC-XX Cross-Reference (any findings matching existing patterns)
4. Planned Specialist Sequence
5. Artifacts To Be Produced
6. First Action (intake step)
