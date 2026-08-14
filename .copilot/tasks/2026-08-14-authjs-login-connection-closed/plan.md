# AuthJS Connection-Closed Final Plan

## Root Cause

Vercel functions omitted Next.js
`dist/server/dev/browser-logs/file-logger.js`. Loading the shared server runtime
failed, the cached PPR shell remained unresolved, and the browser surfaced
`Connection closed.`. AuthJS and Neon were not the failing boundary.

## Resolution

Follow `final-root-cause-and-deployment-standard.md` and
`implementation-plan.md`. The local implementation is complete. Hosted proof is
pending a fresh Preview and staged prebuilt Production deployment.

## Leantime

- Auth incident milestone/task: `99` / `100`.
- Vercel prebuilt incident milestone/task: `97` / `98`.
