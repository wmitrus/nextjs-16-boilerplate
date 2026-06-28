# First PR Split Plan

## Task ID

`2026-04-26-first-pr-split`

## Status

**COMPLETED — FIRST PR BOUNDARY SELECTED AND CARRIED FORWARD INTO LATER SPLIT WORK**

## Objective

Determine the smallest safe first pull request that can be extracted from the current `feat/authjs` branch while preserving passing validation and keeping later work for follow-up branches after merge and pull.

## Progress Checklist

- [x] Workflow instructions read
- [x] Current branch and working tree inspected
- [x] Existing committed vs uncommitted work grouped into candidate slices
- [x] Smallest safe first PR selected
- [x] Branch / cherry-pick / cleanup strategy written
- [x] Task close summary written

## Known Starting Facts

- Current branch: `feat/authjs`
- Default branch: `main`
- Branch contains a long stack of committed feature work on top of `main`
- Working tree also contains substantial uncommitted changes and artifact churn
- The first PR should minimize blast radius and avoid dragging the whole auth foundation stack when possible

## Decision

PR1 should be extracted from existing committed work, not from the dirty `feat/authjs` working tree.

Selected PR1 boundary:

- commit `b3f50d77` - `.github/workflows/continue-checks.yml`
- commit `fa039dab` - `README.md`

Why this is the cheapest safe slice:

- the extracted branch diff is exactly 2 files
- the workflow does not reference repo-local `.continue/**` files
- `main` does not currently contain `.continue/**`, but that does not block this workflow because it installs the Continue CLI directly and runs `cn review --base "$target_ref" --format json`
- no product runtime, auth, database, or deployment code is included in PR1

## Prepared Branch Strategy

- keep `feat/authjs` untouched as the long-running integration branch
- use a clean worktree from `main` for PR1 isolation
- prepared branch: `pr1/continue-checks`
- prepared worktree: `/home/wojtek/projects/nextjs-16-boilerplate-pr1-continue-checks`

Validation completed on the prepared PR1 branch:

- `git diff --name-only main...HEAD` -> only `.github/workflows/continue-checks.yml` and `README.md`
- `git diff --check main...HEAD` -> clean

## Closeout Outcome

- The task objective was planning-oriented: identify the smallest safe first PR boundary and document the extraction strategy.
- That objective was completed in this run.
- Later task artifacts confirm the plan was actually carried forward:
  - `2026-04-26-pr48-review-followups/intake.md` records that a separate `pr1/continue-checks` branch already existed.
  - `2026-04-27-vercel-log-scripts/implementation-plan.md` extends the split strategy through PR 1 to PR 4, which supersedes this task as the active split-tracking artifact.
- Because later artifact-backed work continued from this decision, this task should be treated as complete rather than still in progress.

## What Stays Out Of PR1

- all AuthJS / Clerk runtime work
- onboarding, redirect, and admin access fixes
- test harness and scenario-runner updates
- agent instruction propagation and task artifacts
- any uncommitted work from the current `feat/authjs` tree

## Likely Affected Areas

- `src/app/auth/**`
- `src/modules/auth/**`
- `src/security/**`
- `e2e/**`
- `.copilot/tasks/**`
- docs and agent instruction surfaces

## Artifact List

- `plan.md`
- `intake.md`
