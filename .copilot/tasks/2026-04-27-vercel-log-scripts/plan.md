# Task Plan

- Task ID: `2026-04-27-vercel-log-scripts`
- Status: `COMPLETED`

## Objective

Add a professional, reusable Vercel CLI wrapper and `package.json` scripts so deployment log retrieval can be run locally without copying workflow commands.

## Checklist

- [x] Inspect existing Vercel workflow commands and script patterns
- [x] Add a reusable Vercel CLI wrapper under `scripts/`
- [x] Wire package scripts for log retrieval and auth checks
- [x] Add focused tests for argument parsing and command construction
- [x] Run focused validation

## Current Outcome

- `scripts/vercel/cli.ts` provides reusable `whoami` and `inspect-logs` commands.
- `package.json` exposes `pnpm vercel`, `pnpm vercel:whoami`, `pnpm vercel:inspect:logs`, and `pnpm vercel:inspect:logs:wait`.
- Focused tests and repo-wide `pnpm lint --fix` plus `pnpm typecheck` are green.
- The slice is ready for PR preparation from a CI-green state.

## PR Split Reference

- Follow-up PR planning is maintained in `implementation-plan.md` for this task.
