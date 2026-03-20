# Specialist Summary Templates

Use these templates when creating or updating persistent per-task specialist summary artifacts under `.copilot/tasks/{task_id}/`.

## Naming Convention

Use exactly one persistent summary file per non-orchestrator specialist agent:

- `01 - Architecture Guard - Summary.md`
- `02 - Security & Auth - Summary.md`
- `03 - Next.js Runtime - Summary.md`
- `04 - Implementation Agent - Summary.md`
- `05 - Validation Strategy - Summary.md`
- `06 - Debug Investigation - Summary.md`
- `07 - Playwright E2E - Summary.md`

## Operating Rules

- update the same file on later runs instead of creating duplicates
- keep the file concise but decision-relevant
- preserve prior findings and decisions unless they are superseded
- record blockers, drift, and handoff notes explicitly
- after meaningful progress, synchronize the task control artifacts before handoff

## Shared Section Pattern

All specialist summaries should preserve this general structure:

1. Task Context
2. Scope Handled
3. Inputs Reviewed
4. Actions Performed
5. Findings
6. Decisions / Constraints
7. Artifact Synchronization
8. Open Questions / Blockers
9. Handoff Notes
10. Update Log

Agent-specific templates may add sections that fit their authority domain.
