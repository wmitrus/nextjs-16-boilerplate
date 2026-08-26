# Final Root Cause And Deployment Standard

## Status

This document supersedes every earlier root-cause conclusion in this task.

## Confirmed Root Cause

The hosted AuthJS sign-in failure was not caused by AuthJS, Neon, the session
callback, `getServerSession()`, or credential validation.

Both affected Preview and Production functions terminated while loading the
Next.js server runtime:

```text
Cannot find module '../dev/browser-logs/file-logger'
Require stack:
next/dist/server/node-environment-extensions/console-file.js
next/dist/server/node-environment.js
```

Vercel could still return the cached Partial Prerender shell with HTTP 200. The
function then failed while resuming the dynamic RSC content, and the browser
reported the downstream symptom `Unhandled Promise Rejection: Connection
closed.`. The form never rendered, so AuthJS credential and database code had
not run.

The last known good Preview was commit `6f2a1f09` (2026-08-01). Later commit
`ba5ba1cc` added repository-wide `outputFileTracingExcludes`. Next.js applies a
global `/*` exclude set to its shared `next-server` trace with substring-style
glob matching. Consequently `logs/**/*` matched the `browser-logs` directory
inside Next.js and removed `file-logger.js`, while leaving its importer
`console-file.js` in the functions. This was the source-to-artifact regression.

## Correct Runtime Fix

Keep the normal AuthJS server predicate:

```typescript
await connection();
const session = await getServerSession(authOptions);
```

Do not replace it with `getToken()` as a fix for this incident. That changes the
session-read semantics but cannot restore a module missing from the deployed
function.

Remove both repository-wide `outputFileTracingExcludes` and
`outputFileTracingIncludes`. Let Next.js and Vercel own automatic output file
tracing. A controlled build without either override traced `file-logger.js`
through its real pnpm store path in every relevant Node route, including
`/auth/signin` and `/api/auth/[...nextauth]`.

The attempted manual include is explicitly rejected. Its glob resolves through
the `node_modules/next` pnpm symlink; the remote builder then produced an invalid
Serverless Function package and Vercel rejected it during output deployment.
Do not patch Next.js, switch pnpm linker mode, or manually copy files into
generated Vercel output for this incident.

## Preview And Production Standard

Preview remains a Vercel source deployment. It validates the remote builder,
Preview environment, exact PR-head source, and Neon deployment-scoped branching.
It must not be converted wholesale to prebuilt deployment.

Production remains a local CI `vercel build --prod` followed by
`vercel deploy --prebuilt --prod`. The model is supported, but only with these
controls:

- exact lockfile-pinned Vercel CLI;
- custom, unique Next.js `deploymentId` during the external Production build;
- generated `.vc-config.json` source-path and upload-plan validation;
- a staged `--skip-domain` deployment;
- browser/runtime smoke against the immutable staged URL;
- `vercel promote` only after the smoke passes;
- a short smoke against the promoted Production URL.

Production-only controls are `.vercelignore.prebuilt`, prebuilt artifact and
dry-run closure validation, custom prebuilt `deploymentId`, and staged promotion.
They do not belong in ordinary Preview.

The custom Production ID must be read from
`VERCEL_PREBUILT_DEPLOYMENT_ID` in `next.config.ts` and embedded at build time.
Never export `NEXT_DEPLOYMENT_ID` in the prebuilt workflow and never enable
`runtimeServerDeploymentId` manually. `NEXT_DEPLOYMENT_ID` is the
Vercel-managed runtime contract used when Vercel owns both sides of the build;
setting it only in CI build scope makes the uploaded functions require a value
that is absent at runtime. Source-built Preview remains provider-managed and
does not need the Production custom-ID variable.

Shared controls are automatic framework tracing, pinned CLI, source provenance,
machine-readable deploy output, and hosted anonymous smoke for `/auth/signin`
plus JSON verification of `/api/auth/session`. Preview should keep this smoke
because it catches the same remote function-startup class before Production,
although it cannot certify the separate prebuilt artifact path.

The Preview smoke is exactly two tests from
`e2e/vercel-runtime-smoke.spec.ts`. Its Playwright config must set `testMatch` so
the full scenario-managed E2E directory is never executed against the hosted
Preview. Deployment, runtime smoke, and Lighthouse use separate GitHub jobs so
their statuses identify the failing boundary correctly.

## Resource Limit

Next.js build workers are capped at 16 through `experimental.cpus`. A fresh
production build reported `cpus: 16`, collected page data with 16 workers,
generated all 55 pages, and completed successfully.

## Required Proof

Before closing the hosted incident, a fresh deployment must prove:

1. every generated function that includes Next.js `console-file.js` also
   includes `file-logger.js` through a non-manual framework trace;
2. the dry-run upload includes every allowed traced source;
3. anonymous `/auth/signin` renders the Sign In form with no `Connection closed`
   page error or failed RSC request;
4. `/api/auth/session` returns HTTP 200 JSON;
5. Vercel runtime logs contain no matching `MODULE_NOT_FOUND`.
6. generated Next.js config contains the custom `deploymentId` and does not set
   `runtimeServerDeploymentId: true`;
7. runtime logs contain no `NEXT_DEPLOYMENT_ID is missing` launcher failure.

Existing client rejection handling and visible Suspense fallback may remain as
defense-in-depth UX. They are not the root-cause fix.

## CI Output Correction

Do not capture human-readable `vercel deploy --logs` output as a deployment URL.
Run the pinned local CLI directly with `--json`, preserve its exit status, parse
the URL only after success, and only then write one validated HTTPS value to
`$GITHUB_OUTPUT`. This prevents pnpm warnings and build logs from corrupting
GitHub Actions outputs.

## Subsequent Production Runtime Incident

After the tracing fix, Production deployment
`dpl_A62Nfc7pBYjGhWchmfeZMjDqpwW4` exposed a second, independent startup
failure. The deploy reached `READY`, but the two hosted tests failed and Vercel
logs reported:

```text
process.env.NEXT_DEPLOYMENT_ID is missing but runtimeServerDeploymentId is enabled
```

This failure again occurred before AuthJS. Its root cause was the prebuilt
workflow exporting the reserved `NEXT_DEPLOYMENT_ID` only during build. The
correct fix is the custom build-only variable and embedded top-level
`deploymentId` described above, not an auth change and not removal of Skew
Protection.

## Subsequent Production Tenant Configuration Incident

Once function startup and AuthJS sign-in were repaired, authenticated bootstrap
returned `?error=tenant_config`. The browser's nearby
`/auth/bootstrap/start?_rsc=...` `404`s were speculative RSC prefetch responses,
not the failing navigation. The actual route executed and returned `307`.

Vercel runtime logs reported `TENANT_NOT_PROVISIONED`. A read-only production DB
check proved that one complete tenant, organization, membership, roles, and
policies already existed, while Production `DEFAULT_TENANT_ID` pointed at a
different UUID. Migrations had completed and were not causal.

The only correct repair is to align Production-only `DEFAULT_TENANT_ID` with the
existing bootstrapped tenant and create a fresh deployment. Do not create a
second tenant, modify AuthJS/bootstrap routes, or make single-tenant provisioning
silently create root tenant data.

Production now runs `pnpm tenant:readiness:vercel:prod` after
`vercel build --prod` migrations and before prebuilt upload. The check is not
copied into GitHub's Preview pre-deploy phase because Neon binds the branch DB
during the hosted source build; a pre-upload GitHub query could validate the
wrong database.

## Hosted Closure

Preview and Production deploy successfully, and the automated hosted smoke
(`pnpm vercel:runtime:smoke`) confirms `/auth/signin` renders without the
`Connection closed.` regression and `/api/auth/session` returns JSON in both
environments — this is CI evidence, not a claim of record.

Full authenticated sign-in, bootstrap-admin, and protected/admin usage were
**not** exercised by CI: the `Playwright Auth Matrix E2E` suite that would
cover them is label-gated (`run-e2e-matrix`) and was never triggered on the
PRs in this chain (#65, #66, #68). A live Production admin-page regression
found on 2026-08-26 (`INTERNAL_API_KEY_PREVIOUS` too short — see
[OZI-50](https://linear.app/oziniusz/issue/OZI-50)) confirms that gap was
real, not theoretical. This document is the operational standard for the
`Connection closed.` incident specifically; it is not evidence that the admin
panel works end-to-end.
