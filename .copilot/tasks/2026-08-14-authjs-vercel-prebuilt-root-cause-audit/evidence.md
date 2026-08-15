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
- Next.js documents includes/excludes as manual corrections, but its implementation
  applies global excludes to the shared `next-server` trace. Controlled builds
  proved `logs/**/*` removes the dependency because it matches Next.js
  `browser-logs` under substring-style matching.
- Vercel's upstream ignore change intentionally re-applies `.vercelignore` to
  generated `filePathMap` sources. Restoring ignored source paths by hand would
  violate the provider's security behavior.
- Vercel documents custom `deploymentId` for externally built prebuilt Next.js
  deployments and staged Production through `--skip-domain` plus `promote`.
- Vercel documents that prebuilt Skew Protection uses a custom top-level
  `deploymentId`; it does not require a runtime `NEXT_DEPLOYMENT_ID` when the ID
  is embedded into the build.

## Production Deployment-ID Incident

- GitHub Actions run `31838476407`, commit `92f76466`, produced staged
  Production deployment `dpl_A62Nfc7pBYjGhWchmfeZMjDqpwW4`.
- Deployment readiness was `READY` and `target=production`, but the immutable
  hosted smoke correctly failed: `/auth/signin` never rendered the form and
  `/api/auth/session` returned `500`.
- Vercel runtime logs for both requests contain the same launcher failure:
  `process.env.NEXT_DEPLOYMENT_ID is missing but runtimeServerDeploymentId is enabled`.
- The workflow exported `NEXT_DEPLOYMENT_ID` only around `vercel build --prod`.
  Installed Next.js 16.2.11 source shows that under Vercel builder context this
  automatically sets `experimental.runtimeServerDeploymentId = true`; the
  prebuilt runtime did not receive the manually created build value.
- A controlled Next.js config load with
  `VERCEL_PREBUILT_DEPLOYMENT_ID=local-31838476407-1` resolved
  `deploymentId=local-31838476407-1`, left `runtimeServerDeploymentId`
  unset, and observed no runtime `NEXT_DEPLOYMENT_ID`.
- The font and `next.svg` preload warnings are downstream effects of the
  incomplete page response, not the failure source.

## Local Proof

- Vercel CLI is pinned at `59.0.0` in `package.json` and `pnpm-lock.yaml`.
- Focused validators: 58 tests passed.
- `pnpm typecheck`: passed.
- `pnpm vercel:deploy:validate`: passed.
- Fresh `pnpm build`: passed; Next reported and used 16 workers, compiled the
  application, and generated 55/55 pages.
- Without custom trace overrides, fresh Next NFT output references
  `file-logger.js` in 69/70 trace files, including `/auth/signin` and
  `/api/auth/[...nextauth]`, using the real `.pnpm` store path.
- With only the old global excludes, 69 traces retained `console-file.js` but
  only one retained `file-logger.js`.
- With the later manual include, hosted Preview built successfully but Vercel
  rejected the generated Serverless Function package as symlinked.
- Existing `.vercel/output` is stale relative to the fresh `.next` and is
  correctly rejected. It is not accepted as proof of the new artifact.

## Remaining Hosted Proof

- The corrected Preview build and deployment completed, and the deployed page
  plus sign-in were manually confirmed working.
- The first automated hosted smoke attempt was invalid because its Playwright
  config selected all 109 E2E tests; failures requiring Clerk/scenario fixtures
  did not indicate a deployment failure.
- Automated sign-off still requires rerunning the corrected two-test hosted
  smoke. Staged Production `filePathMap`, dry-run closure, runtime smoke, and
  clean runtime logs also remain pending.
