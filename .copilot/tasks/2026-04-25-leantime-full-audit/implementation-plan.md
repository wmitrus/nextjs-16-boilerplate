# Implementation Plan

## Execution Phases

### Phase 1 — Inventory And Classification

- [x] Create task workspace
- [x] Create `plan.md`
- [x] Create `intake.md`
- [x] Fetch Leantime tasks inventory
- [x] Fetch Leantime milestones inventory
- [x] Fetch Leantime wiki, goals, ideas, retrospectives, and blueprint board inventories
- [x] Write inventory summary artifact
- [x] Classify each artifact family as active, historical, placeholder, or follow-up-needed

### Phase 2 — Leantime Cleanup

- [x] Check whether an audit task already exists in Leantime
- [x] Create or link one Leantime task for this audit and mark it `W toku`
- [x] Patch clearly stale task statuses where repository evidence is sufficient
- [x] Patch milestone statuses where completed phases are still left as `Nowe`
- [x] Decide which placeholder boards stay, which are archived conceptually, and which only need documentation
- [x] Create follow-up Leantime todos for every unresolved cleanup item
- [x] Write `10 - Leantime Integration Agent - Summary.md`

### Phase 3 — Repository Audit

- [x] Audit all `.copilot/tasks/**` directories for status drift and missing Leantime links
- [x] Group findings into completed, open, blocked, stale, and orphaned categories
- [x] Patch repository task artifacts where status drift is proven
- [x] Record repo-vs-Leantime mismatches that should not be auto-fixed

### Phase 4 — Repository-Level Index

- [x] Identify or create the repository-level task index outside AI task folders
- [x] Update the index with current open, blocked, and completed audit-relevant items
- [x] Make the index point to both repo artifacts and Leantime IDs where known

### Phase 5 — Guidance And Closure

- [x] Document how tasks, milestones, goals, ideas, blueprints, retrospectives, and wiki should be managed
- [x] Explain what should stay in Leantime versus what should stay only in repository artifacts
- [x] Write final audit summary and remaining risks
- [x] Close the audit task in Leantime and log time if the task is fully completed in this session

## Current Working Hypotheses

- The repository does not have a central task index outside `.copilot/tasks/`, so one will likely need to be created.
- Leantime contains both active planning artifacts and placeholder/default boards that should be documented separately.
- The auth foundation epic has multiple completed phases that were not mirrored back into Leantime task/milestone status.
- Some Leantime artifacts are global knowledge-management surfaces rather than task-tracking surfaces and should not be treated as open work.

## Validation Strategy

- Prefer local parsing of saved Leantime inventory files over repeated API reads.
- Use direct `task.get` or `task.patch` only for the specific records that need confirmation or status updates.
- Validate repository artifact edits with focused markdown error checks and diff review.
