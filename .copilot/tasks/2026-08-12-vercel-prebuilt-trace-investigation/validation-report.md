# Production Prebuilt Validation Report

## Scope

Validated the current patch in a disposable Git worktree using the authenticated Production Vercel environment.

## Execution

1. Applied the current Git diff to an isolated detached worktree.
2. Ran `npm exec --yes vercel@latest -- pull --yes --environment=production` (Vercel CLI 59.0.0).
3. Ran `pnpm install --frozen-lockfile`.
4. Ran `npm exec --yes vercel@latest -- build --prod`.
5. Activated `.vercelignore.prebuilt` as the worktree's active `.vercelignore`.
6. Ran `npm exec --yes vercel@latest -- deploy --prebuilt --prod --dry --json`.
7. Ran `pnpm vercel:prebuilt:validate -- --dry-run-json /tmp/vercel-cli-59-dry-run.json`.

## Result

- Fresh function configurations: 4
- Unique required artifact sources: 3,268
- `logs/server.log` required by fresh artifact: no
- Required `src/**` sources: 23
- Required public env templates: `.env.example`, `.env.leantime.example`, `.env.leantime-dev.example`
- Upload files: 4,390 of 5,000 allowed
- Upload size: 73,496,018 of 83,886,080 bytes allowed
- Missing traced upload sources: 0
- Forbidden uploaded trace sources: 0
- Latest resolver: `npm exec --yes vercel@latest --` resolved and ran Vercel CLI 59.0.0
- Result: PASS

## Notes

This was a dry-run only. It did not upload files, create a deployment, or alter the active working tree. No credential values are recorded in this artifact. The npm resolver replaces stale `pnpm dlx` cache behavior and is used consistently by the local wrapper and GitHub Actions workflows.

## Validation Limitation

`pnpm lint --fix` repeatedly hangs in the agent shell. It is temporarily prohibited by the repository AI instructions until a verified fix removes that blocker. Other relevant checks remain required; lint is explicitly skipped for this task.
