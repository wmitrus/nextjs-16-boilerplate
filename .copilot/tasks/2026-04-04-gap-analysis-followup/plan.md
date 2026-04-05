# Plan: Gap Analysis Follow-Up — Grouping and Sequencing

**Task ID**: `2026-04-04-gap-analysis-followup`
**Created**: 2026-04-04
**Orchestrator**: Workflow Orchestrator (Agent 08)
**Source**: Manual gap analysis report (pasted artifact) validated against live repo code

---

## Objective

Receive the gap analysis findings, group them by completion state, create a structured implementation plan for work that is _started but not finished_, and summarise items that are _planned but not started_.

No specialist routing is required for the grouping phase. Implementation planning for the "in-progress" items is the primary deliverable of this task.

---

## Findings Summary

The gap analysis identified findings across three completion states:

| State                           | Count | Notes                                      |
| ------------------------------- | ----- | ------------------------------------------ |
| Almost done (doc/comment fixes) | 3     | Low effort, no runtime risk                |
| Started but not finished        | 3     | Runtime gaps; need implementation planning |
| Planned but not started         | 3     | Prompt-only; no code exists                |

---

## Checklist

### Phase 1 — Grouping and Classification

- [x] Read startup docs (`AGENTS.md`, `00`, `REPOSITORY_AI_CONTEXT`, `COPILOT_TASK_ARTIFACTS`)
- [x] Verify findings against live code
- [x] Produce `intake.md`
- [x] Group into three buckets

### Phase 2 — Implementation Planning (started-but-not-finished items)

- [x] Produce `implementation-plan.md` for in-progress items
- [x] Route to 04 - Implementation Agent for execution — completed via `2026-04-04-bucket1-bucket2-fixes`

### Phase 3 — Documentation Fixes (almost-done items)

- [x] Route to 04 - Implementation Agent for targeted doc corrections — completed via `2026-04-04-bucket1-bucket2-fixes`

### Phase 4 — Planned-but-not-started Summary

- [x] Summarise in this plan and `intake.md`

---

## Affected Areas

| Item                                 | Files                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Feature flag request-scope injection | `src/security/middleware/with-auth.ts`, `src/security/actions/secure-action.ts`, `src/security/core/request-scoped-context.ts`         |
| Onboarding redirect preservation     | `src/app/onboarding/onboarding-form.tsx`, `src/app/onboarding/actions.ts`                                                              |
| RBAC roles doc/code drift            | `src/core/contracts/roles.ts`, `docs/features/22 - RBAC Baseline.md`                                                                   |
| Docs lint command errors             | `docs/features/22 - RBAC Baseline.md`, `docs/features/02 - TypeScript ESLint Prettier Setup.md`, `docs/features/24 - Feature Flags.md` |
| Per-request caching                  | Prompt only — `docs/prompts/04`                                                                                                        |
| Background workers                   | Prompt only — `docs/prompts/05`                                                                                                        |
| AuthJS/Supabase/Neon identity        | Throw stubs only                                                                                                                       |

---

## Specialist Sequence

No security, architecture, or runtime specialist gate is required for this grouping task.
For the in-progress implementation work, specialist routing will follow as separate tasks.

---

## Artifacts To Be Produced

- [x] `plan.md` (this file)
- [x] `intake.md`
- [x] `implementation-plan.md` (for started-but-not-finished items)
