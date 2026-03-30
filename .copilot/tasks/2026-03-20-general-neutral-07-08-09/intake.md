# Intake

## Objective

Execute the first follow-up task from the AI agent configuration audit by closing the neutral-core gap for `07`, `08`, and `09` in `docs/ai/general`.

## Readiness Checklist

- [x] Objective confirmed
- [x] Source audit reviewed
- [x] First task identified
- [x] Scope confirmed
- [x] Non-goals confirmed
- [x] Affected files finalized
- [x] Neutral doc shape aligned with existing `docs/ai/general`
- [x] Summary artifact initialized

## Requirements Sources

- `.codex/tasks/2026-03-20-ai-agent-config-audit-summary.md`
- `docs/ai/general/MODE_MANIFEST.md`
- existing `docs/ai/general/01-06`
- `docs/ai/copilot/07 - Playwright E2E Agent.md`
- `docs/ai/copilot/08 - Workflow Orchestrator Agent.md`
- `docs/ai/copilot/09 - Task Brief Authoring.md`

## Requirements Summary

- start with the first task from the audit
- execute that task, not only describe it
- save the first specialist summary for the task
- the first audit task is to add formal neutral mode/agent docs for `Playwright E2E`, `Workflow Orchestrator`, and `Task Brief`

## Scope

- add missing neutral docs in `docs/ai/general`
- align `MODE_MANIFEST.md` with those new neutral docs
- create the first per-task specialist summary using the new summary system

## Non-Goals

- building the Zencoder adapter
- broad cleanup of `.zencoder`
- restructuring the whole AI package beyond the first audit task

## Acceptance Criteria

- `docs/ai/general` contains formal neutral docs for `07`, `08`, and `09`
- `MODE_MANIFEST.md` references the new neutral docs through explicit modes
- the task has its first specialist summary file recorded

## Open Questions

- none at intake time
