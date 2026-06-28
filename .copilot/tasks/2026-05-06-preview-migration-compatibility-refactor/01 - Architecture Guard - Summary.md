# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-05-06-preview-migration-compatibility-refactor`
- Task Objective: Record the architectural decision trail for a possible refactor that preserves direct-URL migration safety while restoring compatibility with the long-standing Vercel Preview Build Command.
- Current Run Scope: Root-cause confirmation, architectural verdict, artifact creation.
- Status: COMPLETED
- Last Updated: 2026-05-06
- Related Control Artifacts:
  - `plan.md`
  - `intake.md`
  - `constraints.md`
  - `implementation-plan.md`

## Scope Handled

- modules / layers reviewed: deployment workflow, migration execution path, Drizzle production migration config
- change surface reviewed: preview deployment compatibility vs migration safety contract
- architecture questions in scope: whether the repository can preserve direct-URL DDL protections without forcing Vercel dashboard changes

## Inputs Reviewed

- code paths reviewed:
  - `src/core/db/migrations/config/drizzle.prod.ts`
  - `scripts/db-migrate-prod.ts`
  - `.github/workflows/preview-deploy.yml`
- docs / ADRs / prompts reviewed:
  - `AGENTS.md`
  - `docs/features/DEPLOY-neon.md`
  - `docs/features/34 - Admin Bootstrap.md`
  - `docs/ai/general/IMPLEMENTATION_ANTI_PATTERNS.md`
- earlier task artifacts reviewed:
  - `.copilot/tasks/2026-05-05-admin-bootstrap-deploy-design/plan.md`
  - `.copilot/tasks/investigate-ci-migrations/06 - Debug Investigation - Summary.md`

## Actions Performed

- repository inspection performed: traced preview deployment and migration history to the current failure path
- boundary checks performed: separated deployment workflow concerns from migration execution sink concerns
- dependency / DI review performed: not applicable beyond config ownership boundaries
- docs-vs-code checks performed: confirmed the code introduced a stricter runtime contract than the long-standing operational Preview command

## Current-State Findings

- Confirmed:
  - The Preview regression was introduced by stricter migration validation, not by the preview bootstrap rollback.
  - The first hard incompatible change for the old Preview command was commit `3b056e83`.
  - The underlying safety goal is legitimate: DDL must use a direct / unpooled URL.
- Risks:
  - The current hard cross-field check couples migration execution to dashboard shell behavior more tightly than necessary.
  - Leaving the current contract in place forces operational drift or dashboard changes for a previously working Preview path.
- Drift:
  - Migration execution safety and runtime env hygiene are currently enforced in the same hard-fail path.

## Boundary And Dependency Assessment

- module ownership assessment: `scripts/db-migrate-prod.ts` should own effective URL resolution; `drizzle.prod.ts` should own sink validation for the URL Drizzle actually uses
- dependency direction assessment: acceptable if the refactor stays inside migration tooling and config boundaries
- DI / composition assessment: not material to this task
- cross-module coupling assessment: current cross-field guard creates unnecessary coupling between deployment shell shape and migration execution behavior

## Architectural Decisions / Constraints

- approved architectural constraints:
  - preserve direct-URL DDL enforcement
  - avoid mandatory Vercel dashboard changes
  - keep the refactor low blast radius
- rejected directions:
  - reintroducing automatic preview bootstrap as a workaround
  - forcing dashboard changes as the only remediation path
  - weakening migration validation so pooled URLs can reach Drizzle
- follow-up architectural guardrails:
  - execution-time validation should inspect the migration sink, not broader unrelated runtime env relationships

## Artifact Synchronization

- `plan.md` updates: created
- `intake.md` updates: created
- `implementation-plan.md` updates: created
- specialist artifact updates: created this summary

## Open Questions / Blockers

- unresolved questions:
  - whether the compatibility refactor should remove the cross-field hard failure entirely or downgrade it to a warning / separate hygiene check
- blockers:
  - none for design trace creation
- evidence still needed:
  - focused executable validation after implementation

## Handoff Notes

- what the next agent should rely on:
  - the root cause is the stricter migration config contract, specifically the change introduced in `3b056e83`
  - the intended safe direction is sink-only validation for the effective migration URL
- what should not be re-decided without new evidence:
  - whether DDL must avoid pooled URLs; that remains a firm constraint
- recommended next specialist or step:
  - `04 - Implementation Agent` for the narrow refactor, followed by focused validation

## Update Log

### Update Entry

- Date: 2026-05-06
- Trigger: User requested a separate traceable task before any future refactor
- Summary of change: Recorded the root cause, architectural verdict, constraints, and implementation direction for a future compatibility refactor
- Sections refreshed: all
