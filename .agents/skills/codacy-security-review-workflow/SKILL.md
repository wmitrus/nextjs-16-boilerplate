---
name: codacy-security-review-workflow
description: Codacy security-review workflow for this repository. Use whenever Codacy raises CRITICAL or HIGH security findings on a pull request and the findings need grouped triage, low-blast-radius remediation, and durable pattern propagation, even if the user does not explicitly ask for a "workflow."
---

# Codacy Security Review Workflow

This is the Codex-native counterpart to:

- `docs/ai/general/Workflow 10 - Codacy Security Review Workflow.md`
- `.github/prompts/codacy-security-review.prompt.md`
- `.zenflow/workflows/codacy-security-review.md`

Use this skill for grouped triage and remediation of Codacy CRITICAL or HIGH security
findings.

## Startup

1. Read `AGENTS.md`.
2. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
3. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
4. Read `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
5. Read `docs/ai/general/Workflow 10 - Codacy Security Review Workflow.md`.

## Mission

Triage and remediate Codacy CRITICAL or HIGH security findings group by group while
keeping blast radius low and updating durable security pattern guidance.

## Working Sequence

1. Intake and grouping
2. Group-by-group triage, fix, and suppress
3. Quality gates
4. Scanner ignore report
5. Patterns propagation

## Compatibility Notes

- `docs/ai/general/Workflow 10 - Codacy Security Review Workflow.md` remains the
  shared, neutral workflow source
- `.github/prompts/codacy-security-review.prompt.md` remains the Copilot workflow
  entrypoint
- `.zenflow/workflows/codacy-security-review.md` remains the ZenFlow execution layer
- this skill is the Codex-native runtime surface for the same workflow intent
