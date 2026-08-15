# 03 - Next.js Runtime - Summary

## Task Context

- Task ID: `2026-08-14-authjs-vercel-prebuilt-root-cause-audit`
- Scope: Next.js 16 output tracing, Vercel source/prebuilt boundaries, and PPR
  failure propagation.
- Status: COMPLETED LOCALLY; hosted confirmation pending.
- Last updated: 2026-08-14.

## Runtime Findings

- `console-file.js` statically requires `file-logger.js`; a function containing
  the importer must contain the dependency even though logging is development
  oriented.
- Automatic Next.js tracing satisfies that relation under pnpm. Repository-wide
  excludes break it, and a manual include changes the generated path shape in a
  way the Vercel packager rejects.
- The cached PPR shell can return HTTP 200 before the Node continuation fails;
  browser `Connection closed.` is the downstream RSC symptom.
- Preview should remain a Vercel source build to exercise the remote builder and
  Neon Preview integration. Production may remain a validated prebuilt build.
- Production-only controls are artifact closure, the prebuilt ignore profile,
  staged deployment, and promotion. Automatic tracing and hosted smoke are
  shared controls.

## Runtime Constraints

- Keep `outputFileTracingIncludes` and `outputFileTracingExcludes` absent.
- Keep `experimental.cpus` bounded at 16; Vercel may choose fewer workers.
- Keep request-time `NextAuth(req, ctx, authOptions)` and the existing AuthJS
  session predicate unchanged.
- Require hosted Preview and staged Production smoke before incident closure.

## 2026-08-14 Deployment-ID Runtime Update

- Confirmed failure boundary: the Vercel Node launcher exits before route or
  AuthJS code because `runtimeServerDeploymentId` is enabled while runtime
  `NEXT_DEPLOYMENT_ID` is absent.
- Next.js 16.2.11 enables this runtime mode automatically when its reserved
  variable is present during a Vercel-supported production build.
- Runtime decision: retain top-level custom `deploymentId` for prebuilt Skew
  Protection, but source it from `VERCEL_PREBUILT_DEPLOYMENT_ID`. Do not set the
  reserved runtime variable and do not enable runtime resolution explicitly.
- Preview requires no matching change because Vercel owns its source build and
  runtime identity together.
