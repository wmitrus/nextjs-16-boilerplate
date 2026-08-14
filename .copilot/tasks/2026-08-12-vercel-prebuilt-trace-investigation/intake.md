# Investigation Intake

## Request

Investigate recurring Vercel production prebuilt deployment failures during output materialization, currently reported as:

```text
ENOENT: no such file or directory, lstat '/vercel/path0/logs/server.log'
```

## Scope

- Production `vercel build --prod` followed by `vercel deploy --prebuilt --prod`.
- Next.js output-file tracing and Vercel generated `filePathMap` inputs.
- Repository and build-workspace artifacts that contaminate trace inputs.

## Non-Goals

- Do not change `.vercelignore` to upload log files.
- Do not modify generated `.vc-config.json` files.
- Do not alter preview source deployment behavior or its required E2E helper exceptions.

## Current Evidence

- The raw `.next/server/middleware.js.nft.json` contains `../../logs/server.log` before Vercel adapts output.
- `LOG_TO_FILE_PROD` resolves to `false` in pulled production environment.
- `logs/server.log` is tracked by Git and exists in a new detached worktree.
- `git rm -- logs/server.log` removed only that tracked file; post-operation checks confirmed it is absent from both index and working tree.
- The prebuilt profile no longer excludes `/src`; validator coverage now requires every non-forbidden `filePathMap` source, including `src/**`, in the dry-run upload.

## Readiness

- [x] Symptom captured.
- [x] Initial trace path identified.
- [x] Sensitive environment evidence redacted.
- [x] Clean build trace experiment completed.
- [x] Runtime and implementation handoff prepared.
