# Evidence

## Hosted Failure

- Last known working Preview: commit `6f2a1f09`, deployment created
  2026-08-01 16:20 UTC. Anonymous `/auth/signin` rendered the form.
- Affected Preview and Production: cached PPR shell returned HTTP 200, then the
  browser reported `Connection closed.` before the form existed.
- Matching Vercel runtime logs for both environments reported
  `MODULE_NOT_FOUND` for
  `next/dist/server/dev/browser-logs/file-logger.js`, required through
  `console-file.js` and `node-environment.js`.
- Therefore AuthJS credentials, database queries, callbacks, and bootstrap did
  not execute before the failure.

## Package And Provider Evidence

- Installed Next.js 16.2.11 and checked 16.2.9/16.2.12 packages contain both the
  static require and the required file. A stable patch upgrade alone does not
  remove the packaging gap.
- Next.js documents `outputFileTracingIncludes` as the supported correction when
  tracing misses a runtime dependency.
- Vercel's upstream ignore change intentionally re-applies `.vercelignore` to
  generated `filePathMap` sources. Restoring ignored source paths by hand would
  violate the provider's security behavior.
- Vercel documents custom `deploymentId` for externally built prebuilt Next.js
  deployments and staged Production through `--skip-domain` plus `promote`.

## Local Proof

- Vercel CLI is pinned at `59.0.0` in `package.json` and `pnpm-lock.yaml`.
- Focused validators: 58 tests passed.
- `pnpm typecheck`: passed.
- `pnpm vercel:deploy:validate`: passed.
- Fresh `pnpm build`: passed; Next reported and used 16 workers, compiled the
  application, and generated 55/55 pages.
- Fresh Next NFT output references `file-logger.js` in 70 trace files, including
  `/auth/signin` and `/api/auth/[...nextauth]`.
- Existing `.vercel/output` is stale relative to the fresh `.next` and is
  correctly rejected. It is not accepted as proof of the new artifact.

## Remaining Hosted Proof

A fresh Preview and staged Production deployment are still required to prove
generated Vercel `filePathMap`, dry-run upload closure, hosted browser behavior,
and clean runtime logs for the patched revision.
