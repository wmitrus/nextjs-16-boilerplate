# Task Intake

## Objective

Assess the existing Next.js 16.2 upgrade requirements and workflow as a senior reviewer, grounded in the live repository code, and prepare a task workspace that can be handed off to the appropriate next specialist.

## Readiness Checklist

- [x] Objective is confirmed
- [x] Requirements sources are confirmed
- [x] Repository context is confirmed
- [x] Scope is confirmed
- [x] Non-goals are confirmed
- [x] Acceptance criteria are normalized
- [x] Environment assumptions are captured
- [x] Open questions and blockers are recorded

## Requirements Sources

- `.zencoder/chats/24831770-bfc2-4f10-8aa2-570f93f3a0db/requirements.md`
- `.zencoder/chats/24831770-bfc2-4f10-8aa2-570f93f3a0db/plan.md`
- `https://nextjs.org/blog/next-16-2`

## Repository Context

- `package.json`
- `next.config.ts`
- `postcss.config.mjs`
- `src/app/error.tsx`
- `src/app/global-error.tsx`
- `src/app/users/error.tsx`
- `src/app/e2e-error/error.tsx`
- `src/app/error.test.tsx`
- `src/app/global-error.test.tsx`
- `.github/labeler.yml`
- `AGENTS.md`
- `docs/tanstack-migration/02-foundation.md`

## Problem Statement

The current requirements describe a low-risk Next.js minor upgrade, but they need to be reconciled against the live codebase so implementation does not miss framework-contract surfaces, repository drift, or mandatory runtime validation.

## Scope

- architecture-first review of the upgrade task package
- code-backed comparison of requirements vs live repository state
- identification of docs-vs-code drift that materially affects the task
- recording of the next-specialist recommendation in a Copilot task workspace

## Non-Goals

- editing the `.zencoder/chats/...` requirements or workflow documents
- implementing the version bump
- broad validation execution
- speculative architectural redesign

## Acceptance Criteria

- a new `.copilot/tasks/{task_id}/` workspace exists for this review
- the workspace contains normalized `plan.md` and `intake.md`
- the workspace contains a persistent `01 - Architecture Guard - Summary.md`
- the review clearly states whether the baseline upgrade is safe, blocked, or needs follow-up
- the review names the next specialist explicitly

## Environment Assumptions

- repository code is the source of truth
- the project is on `main`
- the current package state is `next` `16.1.7` and `eslint-config-next` `16.1.7`
- the repository still uses `postcss.config.mjs` at the time of review
- implementation has not yet started for this task workspace

## Evidence Expectations

- architecture review tied to real files
- requirements gaps tied to real files
- docs drift tied to real files
- explicit handoff recommendation

## Open Questions / Blockers

- resolved: the App Router retry-contract change should be treated as applying to `src/app/error.tsx`, `src/app/global-error.tsx`, and route-level file-convention boundaries such as `src/app/users/error.tsx` and `src/app/e2e-error/error.tsx`
- resolved: `pnpm build` should be a mandatory verification gate for this task
- resolved: the implementation should target `16.2.1`
- resolved: installed peer dependency metadata shows no obvious upgrade blocker for `@sentry/nextjs` or `@clerk/nextjs`, but the final typing and build behavior still need post-upgrade validation
- remaining implementation note: confirm the exact `next/error` typing surface after the version bump, because the current `16.1.7` local package does not yet prove the 16.2 `ErrorInfo` import contract
