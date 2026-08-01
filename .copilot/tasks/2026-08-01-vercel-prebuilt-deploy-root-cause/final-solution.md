# Final Solution - Variant A

## Status

Local implementation is complete. The `.copilot` task is closed locally.
Leantime task `98` remains open in `Do oceny` until post-merge production deploy
verification is complete.

## Root Cause

The production failure was caused by a contract mismatch between generated
Vercel prebuilt metadata and upload file selection.

Vercel/Next generated function `.vc-config.json` files with `filePathMap` source
values under repository `node_modules/.pnpm`. Vercel CLI `58.4.4` re-applied the
repository's user `.vercelignore` rule for `node_modules` to those generated
source paths. The uploader omitted required files while still uploading metadata
that referenced them, so remote materialization failed with `ENOENT`.

OpenTelemetry and New Relic were incidental trace participants, not the root
cause.

## Chosen Remediation

Variant A: keep the existing prebuilt deployment model and align it with the
Vercel Build Output contract.

The pipeline remains:

```text
vercel pull -> env validation -> migrations -> vercel build --prod -> guards -> vercel deploy --prebuilt --prod
```

The remediation adds contract guards and removes the user ignore conflict.

## Implemented Changes

- Removed user `.vercelignore` rules for `.next` and `node_modules`.
- Kept root-only excludes for env files, logs, source, tests, docs, coverage,
  and reports.
- Removed prototype sanitizer behavior that edited generated `.vc-config.json`.
- Added supported route-level Next.js output tracing excludes for non-runtime
  repository paths. Next 16.2.11 Turbopack does not apply these exclusions to
  its Node proxy trace; the upload guard therefore remains authoritative.
- Ensured workflows and helper commands use repository-pinned Vercel CLI through
  `pnpm exec vercel`.
- Updated the validator to use `Object.values(filePathMap)` as source paths.
- Added fail-closed checks for:
  - missing traced source files;
  - source paths escaping the repository root;
  - symlink escapes;
  - allowed runtime source paths missing from the dry-run upload;
  - forbidden source paths present in the dry-run upload;
  - uploads exceeding `5000` files or `83886080` bytes.

## Validation Evidence

- Focused unit tests passed: `23` tests in `2` files.
- Focused ESLint passed on changed TypeScript files.
- TypeScript passed with `pnpm exec tsc --noEmit --pretty false`.
- Prettier checks passed for changed formatted files.
- `git diff --check` passed.
- Pinned CLI check returned `58.4.4`.
- A fresh clean Vercel build without production migrations passed.
- Dry-run upload coverage passed:
  - `11292` traced source references;
  - `266` forbidden metadata references excluded from upload;
  - `4365` uploaded files;
  - `73499700` bytes;
  - `0` missing allowed references;
  - `0` forbidden uploads.

## Deferred Proof

Real `vercel deploy --prebuilt --prod` was not run locally because production
migrations and deployment authority belong to the protected workflow:

```shell
DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:migrate:prod && pnpm build
```

Final acceptance requires merging the PR and verifying that the updated
production workflow passes:

- fresh Vercel production build;
- artifact contract guard;
- dry-run upload coverage guard;
- real prebuilt production deploy;
- deployment ready status.
