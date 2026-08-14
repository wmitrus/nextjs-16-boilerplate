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

The last known good Preview was commit `6f2a1f09` (2026-08-01). The failing
deployments used the same Next.js release line but a different packaging/build
period. This localizes the regression to function tracing/packaging rather than
an auth-source change.

## Correct Runtime Fix

Keep the normal AuthJS server predicate:

```typescript
await connection();
const session = await getServerSession(authOptions);
```

Do not replace it with `getToken()` as a fix for this incident. That changes the
session-read semantics but cannot restore a module missing from the deployed
function.

Use Next.js's supported trace-completion mechanism, scoped to the exact missing
runtime dependency:

```typescript
outputFileTracingIncludes: {
  '/*': ['node_modules/next/dist/server/dev/browser-logs/file-logger.js'],
}
```

The `/*` route key is intentional because `console-file.js` belongs to the
shared Next.js Node runtime, not only the sign-in route. Do not widen this to the
whole Next package or manually copy files into generated Vercel output.

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

Shared controls are the exact runtime trace include, pinned CLI, source
provenance, and hosted anonymous smoke for `/auth/signin` plus JSON verification
of `/api/auth/session`. Preview should keep this smoke because it catches the
same remote function-startup/tracing class before Production, although it cannot
certify the separate prebuilt artifact path.

## Resource Limit

Next.js build workers are capped at 16 through `experimental.cpus`. A fresh
production build reported `cpus: 16`, collected page data with 16 workers,
generated all 55 pages, and completed successfully.

## Required Proof

Before closing the hosted incident, a fresh deployment must prove:

1. every generated Node function `.vc-config.json` includes `file-logger.js` in
   `filePathMap`;
2. the dry-run upload includes every allowed traced source;
3. anonymous `/auth/signin` renders the Sign In form with no `Connection closed`
   page error or failed RSC request;
4. `/api/auth/session` returns HTTP 200 JSON;
5. Vercel runtime logs contain no matching `MODULE_NOT_FOUND`.

Existing client rejection handling and visible Suspense fallback may remain as
defense-in-depth UX. They are not the root-cause fix.
