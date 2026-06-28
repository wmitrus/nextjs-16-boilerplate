# Intake

## Objective

Run a full Leantime and repository task audit, clean up stale project-management artifacts, create missing follow-up todos in Leantime, and leave one clear repository-level place to understand task status.

## User Requirements

- fetch the full list of Leantime artifacts before cleanup work starts
- compare Leantime artifacts against repository task files
- identify which Leantime artifacts should remain and which are stale or misleading
- clean up Leantime task status drift, especially phase/task items left open without implementation context
- for every unresolved item found in the audit, create a todo in Leantime
- update the main repository task file if it exists; otherwise determine and create the appropriate central index
- explain how to manage tasks, milestones, ideas, blueprints, retrospectives, wiki, and related artifacts reliably going forward
- include guidance about repository-side task organization, including any `Think`-like or equivalent central location if present

## Scope

- Leantime project inventory and cleanup
- repository artifact audit for `.copilot/tasks/**`
- repository-level task index discovery or creation
- durable process guidance for future artifact management

## Non-Goals

- do not delete Leantime artifacts unless explicitly necessary and clearly safe
- do not rewrite unrelated implementation docs outside the task-management surfaces
- do not infer completion without evidence from repo artifacts or Leantime state

## Acceptance Criteria

- full Leantime artifact inventory captured and summarized
- repository task artifacts audited against Leantime state
- every confirmed unresolved item has a follow-up Leantime todo
- stale repo task statuses are corrected where evidence is sufficient
- one repository-level task index exists or is updated with current state
- final guidance explains what each Leantime artifact family is for and how to keep it orderly

## Source Inputs

- current branch: `feat/authjs`
- `.copilot/tasks/**`
- `docs/ai/general/LEANTIME_AUTOMATION.md`
- Leantime project 2 live state

## Readiness Checklist

- [x] workflow and Leantime instructions read
- [x] task workspace created
- [x] full Leantime inventory fetched
- [x] central repository task index not found; a new non-AI index will be created if no better surface appears during the audit
- [x] cleanup plan finalized after inventory

## Completion Progress

- [x] Leantime audit task created and linked (`73`, milestone `72`)
- [x] Auth-foundation Leantime status drift corrected for completed phases
- [x] Follow-up cleanup todos created in Leantime (`74-79`)
- [x] Repository-level task index created at `docs/other/task-index.md`
- [x] Canonical Leantime task created for invite-flow fix (`80`)
- [x] Canonical Leantime task created for admin direct invitation (`81`)
- [x] Placeholder ideas/value boards removed and retrospective placeholder archived explicitly
- [x] Audit task `73` closed and time logged on `2026-04-26`
