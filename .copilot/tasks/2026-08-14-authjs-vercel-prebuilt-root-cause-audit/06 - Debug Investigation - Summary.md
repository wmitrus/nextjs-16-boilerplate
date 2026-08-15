# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-08-14-authjs-vercel-prebuilt-root-cause-audit`
- Objective: identify the source-to-artifact regression behind hosted AuthJS
  `Connection closed.` and the later invalid Vercel function package.
- Status: COMPLETED LOCALLY; hosted confirmation pending.
- Last updated: 2026-08-14.

## Confirmed Evidence

- Last known good Preview `6f2a1f09` predates custom output tracing rules.
- `ba5ba1cc` added global `outputFileTracingExcludes`, including `logs/**/*`.
- Next.js applies global excludes to its shared `next-server` trace with
  `picomatch(..., { contains: true })`; `logs/**/*` therefore excludes the
  Next.js `browser-logs/file-logger.js` dependency.
- Controlled build with only those excludes retained `console-file.js` in 69
  traces but retained `file-logger.js` in only one.
- Controlled build without tracing overrides retained both files in the same 69
  traces, including the AuthJS page and route, through real `.pnpm` paths.
- The later manual include built locally but the hosted builder rejected its
  symlinked Serverless Function package.
- The multiline GitHub output error was independent: human-readable deploy
  output and a pnpm warning were written as one `$GITHUB_OUTPUT` value.

## Conclusion And Handoff

- Root cause is repository tracing configuration, not AuthJS, Neon, cookies, or
  the session predicate.
- Remove both tracing overrides; do not patch Next.js or change pnpm linker mode.
- Parse the pinned Vercel CLI's successful JSON before publishing a deployment
  URL.
- Hosted Preview and staged Production evidence remain required before closure.

## 2026-08-14 Production Runtime Update

- Symptom: staged Production reached `READY`, `/auth/signin` retained its loading
  shell, and `/api/auth/session` returned `500`.
- Exact runtime evidence: Vercel logs for deployment
  `dpl_A62Nfc7pBYjGhWchmfeZMjDqpwW4` show the launcher exiting with
  `process.env.NEXT_DEPLOYMENT_ID is missing but runtimeServerDeploymentId is enabled`.
- Trigger: the workflow exported `NEXT_DEPLOYMENT_ID` only during
  `vercel build --prod`; Next.js treated it as provider-managed runtime identity
  and generated functions requiring the same variable at startup.
- Root cause location: Production prebuilt deployment-ID wiring, not AuthJS,
  Neon, PPR, fonts, static preloads, or the two-test smoke harness.
- Corrective direction: embed a custom top-level ID from a non-reserved build
  variable and reject the runtime flag in generated artifacts.
