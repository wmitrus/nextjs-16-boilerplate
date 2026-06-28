# Task Index

## Purpose

This is the repository-level task index outside `.copilot/tasks/`.
Use it to understand what is still active, what was recently completed, and which Leantime IDs own the live project-management state.

## Authoritative Sources

1. Repository workflow artifacts in `.copilot/tasks/{task_id}/`
2. Live Leantime task and milestone records
3. This index, which summarizes the current state and points back to the detailed artifacts

## Active Work

| Repo Task / Topic                         | Repo Status                     | Leantime  | Notes                                             |
| ----------------------------------------- | ------------------------------- | --------- | ------------------------------------------------- |
| `2026-04-17-auth-foundation-redesign`     | In progress                     | Epic `55` | Phases 0-7 complete; Phase 8 and 9 remain         |
| `2026-04-12-vercel-nr-proper-integration` | In progress / awaiting decision | Task `43` | Incident remains open pending telemetry direction |

## Recently Completed

| Repo Task / Topic                    | Repo Status | Leantime                  | Notes                                                                    |
| ------------------------------------ | ----------- | ------------------------- | ------------------------------------------------------------------------ |
| `2026-04-25-leantime-full-audit`     | Complete    | Task `73`, Milestone `72` | Audit closed; `2.5h` logged on 2026-04-26                                |
| `2026-04-23-invite-flow-fix`         | Complete    | Task `80`                 | Invite flow context preservation and signed-in acceptance path finalized |
| `2026-04-24-admin-direct-invitation` | Complete    | Task `81`                 | Admin invitations feature validated and task artifacts synchronized      |
| `2026-04-21-authjs-phase72`          | Complete    | `69`                      | Email verification, brute-force protection, E2E                          |
| `2026-04-24-admin-user-management`   | Complete    | `70`                      | Task plan updated to reflect Leantime closure                            |
| `2026-04-25-admin-access-regression` | Complete    | `71`                      | Root cause documented and guards/tests added                             |
| `2026-04-13-clerk-prod-migration`    | Complete    | `44`                      | Summary artifact corrected during audit                                  |

## Audit Follow-Up Backlog

These tasks were created during the 2026-04-25 cleanup audit and should be treated as the next project-hygiene backlog:

| Leantime ID | Title                                                      | Purpose                                                                          |
| ----------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `74`        | Triage legacy Leantime validation tasks and milestones     | Resolved by closing historical validation/governance task noise                  |
| `75`        | Decide retention for placeholder boards and empty canvases | Resolved by deleting empty boards and archiving the retrospective placeholder    |
| `76`        | Repair auth foundation Leantime metadata linkage           | Reconcile milestone linkage and note placement for auth-foundation phase records |
| `77`        | Open or link Leantime task for invite flow fix             | Resolved by creating canonical task `80`                                         |
| `78`        | Open or link Leantime task for admin direct invitation     | Resolved by creating canonical task `81`                                         |
| `79`        | Create repository-level task index outside AI task folders | Resolved by creating and linking this file from `docs/README.md`                 |

## Artifact Management Rules

### Tasks

- Use a Leantime task for every non-trivial implementation, investigation, or audit that is actually active.
- Keep the detailed implementation history in `.copilot/tasks/{task_id}/`, not in long Leantime comments.
- In Leantime, keep task descriptions short and decision-oriented; link or reference the repo task workspace.
- If a repo task is active but has no Leantime ID, create or link it immediately.

### Milestones

- Use milestones only for real phase boundaries or durable roadmap checkpoints.
- Close a milestone when the corresponding phase is complete in repo artifacts.
- Do not leave completed milestones at `Nowe (3)`; that makes the roadmap unreadable.

### Goals

- Keep goals only when they represent live strategic outcomes with a board that is still used.
- Validation-only or smoke-test goals should be closed, archived conceptually, or clearly labeled as historical setup artifacts.

### Ideas

- Keep idea boards only for active ideation.
- Empty default boards like `Tablica` are noise unless intentionally repurposed and renamed.
- Audit action: deleted empty placeholder ideas board `3`.

### Blueprints

- Keep blueprint boards only when they still support live design reasoning or durable reference.
- Empty canvases should either be populated meaningfully, renamed for a current purpose, or retired.
- Do not create new boards when an existing board already covers the same decision space.
- Audit action: deleted empty value canvas `14`.

### Retrospectives

- Keep one retrospective board per real phase when it contains actual learning or action items.
- Empty placeholder retrospectives should not stay unnamed as `Tablica`.
- Retro action items that matter operationally should link to milestone-backed follow-up work.
- Audit action: renamed retrospective board `4` to an explicit archive marker instead of leaving it as `Tablica`.

### Wiki

- Use wiki for durable project knowledge, not for transient execution logs.
- Implementation detail should live in repo artifacts first; wiki should hold stable summaries and operating guidance.

## Maintenance Expectation

When a task opens or closes, update:

1. the repo task workspace
2. the linked Leantime task status
3. this index if the task changes the active/open/completed set in a meaningful way
