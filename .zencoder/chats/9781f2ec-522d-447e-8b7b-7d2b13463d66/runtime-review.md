# Runtime Review

## Task

`2026-04-22-forgot-password-email` — Add `sendPasswordResetEmail` to EmailService and wire forgot-password route

## Summary

**No runtime concerns.** The forgot-password route is already correctly placed in Node.js runtime with `await connection()` at the top.

## Runtime Surfaces Affected

| File                                                                    | Runtime                             | Change                 |
| ----------------------------------------------------------------------- | ----------------------------------- | ---------------------- |
| `src/app/api/auth/forgot-password/route.ts`                             | Node.js (route handler)             | Add email service call |
| `src/modules/invitations/infrastructure/resend/ResendEmailService.ts`   | Node.js (called from route handler) | Add method             |
| `src/modules/invitations/infrastructure/smtp/NodemailerEmailService.ts` | Node.js (called from route handler) | Add method             |
| `src/modules/invitations/infrastructure/NoOpEmailService.ts`            | Node.js (called from route handler) | Add stub               |

## Server vs Client Placement

All changes are server-side only. No client bundle impact.

## Route Handler Behavior

- Already has `await connection()` — dynamic rendering opt-in ✅
- Already runs in Node.js (uses `crypto`, DB) — Edge runtime is not applicable ✅
- `createEmailService(env.*)` call at request time — correct, avoids prerender issues ✅

## `cacheComponents: true` Constraint

No `export const dynamic` or `export const runtime` in the route file. The `await connection()` opt-in is already present. No changes needed.

## Environment Variable Exposure

`createEmailService` reads from `env` server-side only:

- `env.EMAIL_PROVIDER` — server-only
- `env.RESEND_API_KEY` — server-only
- `env.RESEND_FROM_EMAIL` — server-only

No env vars are exposed to the client bundle.

## Caching / Revalidation

Not applicable — route handlers are dynamic by nature when `await connection()` is called.

## Runtime Constraints

1. `createEmailService` must be called inside the route handler body (request time), not at module level
2. No Edge runtime considerations — Node.js only
3. No changes to `src/proxy.ts` needed

## Status

- [x] Complete — no runtime blockers
