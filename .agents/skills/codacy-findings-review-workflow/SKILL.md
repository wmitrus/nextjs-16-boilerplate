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

## Compatibility Notes

- `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md` remains the
  shared, neutral workflow source
- `.github/prompts/codacy-findings-review.prompt.md` remains the Copilot workflow
  entrypoint
- `.zenflow/workflows/codacy-findings-review.md` remains the ZenFlow execution layer
- this skill is the Codex-native runtime surface for the same workflow intent

## Leantime Integration

**This skill participates in the mandatory Leantime workflow.**

At task open and close, the Workflow Orchestrator invokes
`10 - Leantime Integration Agent` (Codex: `leantime-integration` skill).

Reference: `docs/ai/general/LEANTIME_AUTOMATION.md`
