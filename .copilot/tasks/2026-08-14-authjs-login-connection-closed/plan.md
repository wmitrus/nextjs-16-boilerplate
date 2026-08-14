# AuthJS Connection-Closed Final Plan

## Root Cause

The global Next.js trace exclusion added after the last good Preview treated
`logs/**/*` as a shared `next-server` ignore and removed
`dist/server/dev/browser-logs/file-logger.js`. Loading the shared server runtime
then failed, the cached PPR shell remained unresolved, and the browser surfaced
`Connection closed.`. AuthJS and Neon were not the failing boundary. The later
manual include was also invalid because it produced a symlinked Vercel function
package.

## Resolution

Follow `final-root-cause-and-deployment-standard.md` and
`implementation-plan.md`. The local implementation is complete. Hosted proof is
pending a fresh Preview and staged prebuilt Production deployment.

## Leantime

- Auth incident milestone/task: `99` / `100`.
- Vercel prebuilt incident milestone/task: `97` / `98`.
