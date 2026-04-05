# Intake: Gap Analysis Follow-Up

**Task ID**: `2026-04-04-gap-analysis-followup`
**Source**: User-provided gap analysis report (pasted artifact, 20 lines)
**Validated against**: Live repo code on `main`

---

## Objective

Organise the gap-analysis findings into three execution buckets, produce an implementation plan for work that is in-progress, and summarise work that is only planned.

---

## Requirements

1. Group findings into: _almost done_, _started but not finished_, _planned but not started_.
2. Create `implementation-plan.md` covering all _started but not finished_ items.
3. Summarise _planned but not started_ items at the end (no implementation plan required for those).

---

## Acceptance Criteria

- [x] Three buckets are clearly documented with code-verified evidence for each item.
- [x] `implementation-plan.md` exists and is actionable for the in-progress items.
- [x] Planned-but-not-started items are summarised with scope, prompt location, and known constraints.
- [x] Residual risks and deferred items are recorded explicitly.

---

## Readiness Checklist

| Prerequisite                        | Status |
| ----------------------------------- | ------ |
| Startup docs read                   | ✅     |
| Findings verified against live code | ✅     |
| Task workspace created              | ✅     |

---

## Open Questions

None. All findings were code-verified before classification.

---

## Residual Risks / Deferred

- AuthJS, Supabase, Neon identity sources are runtime-throw stubs. Their implementation requires an auth provider selection decision that is out of scope for this task.
- Background workers require a worker runtime entrypoint design decision (separate task).
- Per-request caching requires a caching strategy decision (separate task).
