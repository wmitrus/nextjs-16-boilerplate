# Intake

- Task ID: `2026-04-27-vercel-log-scripts`
- Source request: add a professional way to retrieve Vercel logs via reusable `package.json` scripts

## Confirmed Inputs

- Preview workflow already uses `vercel deploy --logs` and `vercel inspect <url> --logs --wait`
- Repository now has a reusable Vercel wrapper in `scripts/vercel/`
- Current MCP configuration does not include a Vercel server
- Local workspace can run the wrapper successfully via `pnpm vercel -- help` and `pnpm vercel:whoami`

## Implementation Shape

- Add a TypeScript wrapper under `scripts/vercel/`
- Reuse repository env-loading conventions
- Expose package scripts for `whoami` and inspecting deployment logs
- Validate via focused unit tests for parsing/invocation building

## Validation Snapshot

- Focused unit tests for `scripts/vercel/cli.test.ts` passed.
- Focused unit tests for `scripts/reconcile-known-migration-state.test.ts` passed after clearing the repo-wide typecheck blocker.
- Repo-wide `pnpm lint --fix` and `pnpm typecheck` passed after removing the unused admin import and fixing the transaction query typing.
