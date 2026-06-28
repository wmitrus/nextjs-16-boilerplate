# Task: Invite Flow Bug Fix

## Task ID

`2026-04-23-invite-flow-fix`

## Leantime

Canonical task: `80` (`AuthJS invite flow bug fix`)

## Status

Complete

## Objective

Fix three interrelated issues in the AuthJS invite acceptance flow:

1. `await connection()` in `/auth/invite/[token]/page.tsx` triggers "Blocking RouteServer" error in Next.js 16 `cacheComponents: true` mode
2. When a user is already logged in and accepts an invite for a DIFFERENT email → wrong redirect, user ends up in their existing session without accepting
3. When user logs out and tries to accept invite from a fresh email → redirected to login page, cannot reach password-set step

All fixes must be production-ready. No workarounds.

## Known Context

- `AUTH_PROVIDER=authjs`
- `cacheComponents: true` bans `await connection()` in RSC pages if not Suspense-wrapped — must use `getServerRequestLogContext()` or `headers()` instead
- `src/proxy.ts` is the middleware-equivalent (not `middleware.ts`)
- The established fix pattern: replace `await connection()` with `await getServerRequestLogContext()` (which calls `headers()` internally)
- Invite flow: `/auth/invite/[token]` → user clicks "Create account & accept" or "Sign in to existing account"
- Existing session + different email = conflict scenario (must be explicitly handled)

## Workflow Steps

- [x] Step 1: Debug Investigation — root-cause all three failure modes
- [x] Step 2: Implementation — apply production-ready fixes
- [x] Step 3: Validation — focused lint + unit validation completed

## Completion Notes

- `src/security/middleware/route-policy.ts` now treats `/auth/invite` as a public route.
- `src/app/auth/invite/[token]/page.tsx` uses the runtime-safe request-log helper path and now distinguishes mismatch vs same-email signed-in sessions.
- Existing invited users signed in with the invited email can now accept directly from the invite page and continue through bootstrap.
- Invite sign-in links now preserve the invite return path instead of dropping context.
- Canonical Leantime task: `80`.

## Artifacts

- `06 - Debug Investigation - Summary.md`
- `04 - Implementation Agent - Summary.md`
- `validation-report.md`
