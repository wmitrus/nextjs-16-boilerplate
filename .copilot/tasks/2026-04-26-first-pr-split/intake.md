# Intake

## Request

Assess what is already on the branch, separate committed work from local dirt, and identify the cheapest safe first PR that can pass tests and deployment. The remaining work should be deferred to the next branch after merge and pull.

## Acceptance Criteria

- identify whether the first PR should be cut from existing committed work or from a smaller extracted subset
- recommend the smallest coherent PR boundary
- explain what must stay out of PR1
- provide the concrete git strategy for creating PR1 with low risk

## Readiness Checklist

- [x] branch inspected against `main`
- [x] working tree inspected
- [x] candidate PR slices identified
- [x] recommended PR1 documented
- [x] recommended PR1 carried forward into later split-tracking artifacts

## Current Evidence

- `feat/authjs` is many commits ahead of `main`
- current working tree includes both product changes and artifact/doc/tooling drift
- recent local changes also include task artifacts and instruction propagation that are not necessarily PR1 material

## Recommended PR1

Use a fresh branch from `main` and include only:

- `b3f50d77` - `ci(continue-checks): add GitHub Actions workflow for Continue checks`
- `fa039dab` - `docs(README): add continue checks section`

Prepared extraction branch:

- `pr1/continue-checks`
- worktree: `/home/wojtek/projects/nextjs-16-boilerplate-pr1-continue-checks`

Reasoning:

- smallest validated committed slice found so far
- no dependency on repo-local `.continue/**` files
- no app-runtime or deployment blast radius
- easiest PR to review and merge before tackling the auth stack

## Outcome

- Planning acceptance criteria for this task were satisfied: the first PR boundary was selected, the extraction strategy was documented, and the out-of-scope remainder was identified.
- Later artifact-backed work confirms this plan was used rather than abandoned:
  - `2026-04-26-pr48-review-followups/intake.md` notes an already-extracted `pr1/continue-checks` branch
  - `2026-04-27-vercel-log-scripts/implementation-plan.md` continues the split plan through PR 4
- The active split-tracking responsibility moved to the later task artifacts, so this intake should be treated as complete historical planning context.

## Out Of Scope For PR1

- AuthJS provider work
- onboarding / redirect / admin access changes
- E2E/runtime/test harness changes
- docs and agent updates tied to auth-flow remediation
- remaining dirty working-tree changes on `feat/authjs`
