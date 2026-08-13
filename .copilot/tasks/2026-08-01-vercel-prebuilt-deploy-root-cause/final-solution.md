# Final Solution - Variant A

## Status

Local implementation is complete. The `.copilot` task is closed locally.
Leantime task `98` remains open in `Do oceny` until hosted preview and post-merge
production deploy verification are complete.

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

- Kept the default `.vercelignore` source-safe for remote preview builds.
- Added `.vercelignore.prebuilt`, which excludes root source and non-runtime
  artifacts without excluding `.next` or `node_modules`, and activate it only
  after the local production build.
- Added a preview source dry-run guard requiring the Next.js config, package
  manifest, and generated migration journal before real deployment.
- Removed prototype sanitizer behavior that edited generated `.vc-config.json`.
- Added supported route-level Next.js output tracing excludes for non-runtime
  repository paths. Next 16.2.11 Turbopack does not apply these exclusions to
  its Node proxy trace; the upload guard therefore remains authoritative.
- Ensured workflows and helper commands resolve `vercel@latest` through
  `pnpm dlx`, with artifact and upload-plan guards enforcing compatibility.
- Updated the validator to use `Object.values(filePathMap)` as source paths.
- Added fail-closed checks for:
  - missing traced source files;
  - source paths escaping the repository root;
  - symlink escapes;
  - allowed runtime source paths missing from the dry-run upload;
  - forbidden source paths present in the dry-run upload;
  - uploads exceeding `5000` files or `83886080` bytes.

## Validation Evidence

- Focused unit tests passed: `35` tests in `3` files.
- Focused ESLint passed on changed TypeScript files.
- TypeScript passed with `pnpm exec tsc --noEmit --pretty false`.
- Prettier checks passed for changed formatted files.
- `git diff --check` passed.
- The original validation observed `58.4.4`; current deployments resolve the
  latest CLI dynamically.
- A fresh clean Vercel build without production migrations passed.
- Dry-run upload coverage passed:
  - `11292` traced source references;
  - `266` forbidden metadata references excluded from upload;
  - `4365` uploaded files;
  - `73499700` bytes;
  - `0` missing allowed references;
  - `0` forbidden uploads.
- Preview source dry-run passed with `626` `src/**` files and the generated
  migration journal present.

## Deferred Proof

Real `vercel deploy --prebuilt --prod` was not run locally because production
migrations and deployment authority belong to the protected workflow:

```shell
DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:migrate:prod && pnpm build
```

Final acceptance requires verifying that the updated hosted workflows pass:

- PR preview source-upload guard, remote migration/build, and ready status;

- fresh Vercel production build;
- artifact contract guard;
- dry-run upload coverage guard;
- real prebuilt production deploy;
- deployment ready status.
