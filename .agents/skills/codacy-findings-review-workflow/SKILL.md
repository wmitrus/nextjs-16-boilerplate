---
name: codacy-findings-review-workflow
description: Codacy findings-review workflow for this repository. Use whenever a local Codacy findings JSON artifact needs severity-first grouping, live-code triage, rule-review decisions, and durable pattern propagation, even if the user does not explicitly ask for a "workflow."
---

# Codacy Findings Review Workflow

This is the Codex-native counterpart to:

- `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md`
- `.github/prompts/codacy-findings-review.prompt.md`
- `.zenflow/workflows/codacy-findings-review.md`

Use this skill for local Codacy findings JSON review where the goal is not only code
fixes, but also durable rule and pattern decisions.

## Startup

1. Read `AGENTS.md`.
2. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
3. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
4. Read `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
5. Read `docs/ai/general/04 - Implementation Agents.md`.
6. Read `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md`.

## Mission

Read a local Codacy findings JSON artifact, group findings by severity and type, verify
false positives carefully, decide whether noisy rules should stay enabled, and propagate
confirmed patterns into repository AI instructions.

## Working Sequence

1. Intake and normalize findings JSON
2. Scope and noise review
3. Severity-first triage
4. Rule review
5. Remediation plan
6. Patterns propagation and validation

When a confirmed real-risk finding is mechanically detectable with low false-positive
risk, add or update a local guardrail such as `scripts/architecture-lint.sh`, ESLint, or
a focused validation script. Do not leave automatable production-risk checks as
agent-memory-only guidance.

For Codacy HIGH `Error prone` TypeScript/JSX findings, explicitly separate security
exploitability from reliability/type-safety cleanup and apply SEC-24 unless live code
shows a concrete trust-boundary failure.

## Compatibility Notes

- `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md` remains the
  shared, neutral workflow source
- `.github/prompts/codacy-findings-review.prompt.md` remains the Copilot workflow
  entrypoint
- `.zenflow/workflows/codacy-findings-review.md` remains the ZenFlow execution layer
- this skill is the Codex-native runtime surface for the same workflow intent

## Task Lifecycle

Follow the repository task lifecycle from the root instructions.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.
