# Task Plan — Explicit Client-IP Trust Model (SEC-43)

## Status

**✅ IMPLEMENTED.** Thirteenth case in the multi-case security-audit
remediation series; commits land on the same branch as Cases 1–12,
`claude/security-audit-multi-tenant-idor-e1y3yr`.

Findings, the hard Next.js constraint and the full Decision Record are in
`intake.md` and are not repeated here.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–12.** Not
re-diagnosed here.

## What Was Built

- `src/shared/lib/network/client-ip.ts` — the trust model. Four provider-aware
  resolvers, chosen by `DEPLOYMENT_PROXY`; there is deliberately no "try every
  header" path.
- `src/shared/lib/network/get-ip.ts` — `getIP` replaced by `getClientIp`
  returning `ClientIp`, plus the two policy helpers
  (`rateLimitKeyForClient`, `auditIpForClient`) that make each caller's
  handling of an unknown client explicit.
- `DEPLOYMENT_PROXY` / `TRUSTED_PROXY_CIDRS` in `src/core/env.ts`, with
  `resolveDeploymentProxyValue` (required in production, `none` in dev/test)
  and `validateDeploymentProxyConfigValues`.
- Nine call sites converted. Two of them — `with-auth.ts` and
  `with-internal-api-guard.ts` — were reading raw headers directly and were
  found by this case's own guard.
- `ConditionEvaluator.isNotFromBlockedIp` now fails closed on an absent IP.

## Defect Introduced And Caught In Review

The first conversion keyed the generic Edge window as
`rateLimitKeyForClient(pathname, client)`. That would have turned
`API_RATE_LIMIT_REQUESTS` from _10 per client_ into _10 per client per path_ —
silently multiplying every client's allowance by the number of endpoints they
touch. Caught while reading the diff against the failing test expectations,
and changed to a fixed `'api'` prefix. Recorded because a "just add a prefix"
edit is exactly the kind that reads as harmless.

## A Test That Was Green For The Wrong Reason

`security-context.test.ts` asserted `context.ip === '127.0.0.1'` and passed —
but `mockGetClientIp` had **0 calls**. The mock never intercepted this file:
`./security-context` is imported before `@/testing`, which is what registers
the mock. It passed because the real `getIP()` returned the hardcoded
`'127.0.0.1'` fallback, which happened to equal the value the mock pretended
to supply.

Rather than repair the mock plumbing, those tests now drive the **real**
resolver through `mockEnv.DEPLOYMENT_PROXY` plus headers — which is what they
should have done. A new paired test asserts that the _same_ request yields
`ip: null` with no declared trust model: the header is identical, only the
declaration differs, which is the entire point of the case.

## Enforcement

`client-ip.guard.test.ts` walks `src/` and fails on any file outside the
resolver naming a client-IP header. Comments are stripped before scanning: the
rule is about what the code reads, and a guard that punished explaining _why_
a header must not be trusted would train people to write worse comments.
Verified to fail when `with-internal-api-guard.ts` is reverted.

## Quality Gates

| Gate                      | Command                 | Result                                |
| ------------------------- | ----------------------- | ------------------------------------- |
| Typecheck                 | `pnpm typecheck`        | ✅                                    |
| Lint (with fix)           | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing warnings |
| Unit tests                | `pnpm test`             | ✅ 236 files / 1850 tests             |
| DB integration tests      | `pnpm test:db`          | ✅ 22 files / 179 tests               |
| Circular dependency check | `pnpm skott:check:only` | ✅                                    |
| Unused dependency check   | `pnpm depcheck`         | ✅                                    |
| Env consistency           | `pnpm env:check`        | ✅                                    |

**Not run in this session**: Playwright E2E.

## Deployment Action Required Before This Merges

`DEPLOYMENT_PROXY` is required when `NODE_ENV=production`, so **the Vercel
Production and Preview environments must have `DEPLOYMENT_PROXY=vercel` set
before a build runs**, or env validation fails the deploy. This is the
intended fail-fast behaviour, not a defect — but it is a deploy-ordering
requirement and the owner was told before the push.

`TRUSTED_PROXY_CIDRS` is not needed for `vercel`.

## Residual Risk / Follow-Ups

- `trusted-proxy` is topology-anchored, not peer-anchored — see `intake.md`
  and SEC-43. Sound only where the app is unreachable except through the
  declared proxy.
- The `vercel` resolver reads `x-vercel-forwarded-for` then `x-real-ip`. Both
  are Vercel-set; the ordering is a judgement, not something verified against
  Vercel's documented guarantees in this session. Tracked as `PE-19`.
- `trusted-proxy` cannot be anchored at the socket peer in Next.js. Tracked as
  `PE-20`.

## Runtime Note

The resolver is Edge-safe by construction: no `node:*` imports, and
`ipaddr.js` is pure JavaScript. This mattered — `withRateLimit` runs in the
Edge proxy, where the `net.isIP()` the report suggested is unavailable.
