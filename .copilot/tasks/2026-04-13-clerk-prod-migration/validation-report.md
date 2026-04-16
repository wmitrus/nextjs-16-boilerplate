# Validation Report — Clerk Production Instance Migration

**Task ID**: `2026-04-13-clerk-prod-migration`
**Date**: 2026-04-13

---

## Quality Gate Results

| Command           | Result  | Notes                                         |
| ----------------- | ------- | --------------------------------------------- |
| `pnpm typecheck`  | ✅ PASS | 0 errors                                      |
| `pnpm lint --fix` | ✅ PASS | 0 errors; 4 pre-existing warnings (unrelated) |
| `pnpm test`       | ✅ PASS | 146 files, 1011+ tests — all pass             |

---

## New Test Coverage

| Test                                                                            | File                   | Result  |
| ------------------------------------------------------------------------------- | ---------------------- | ------- |
| `should allow requests to clerk.accounts.dev when using a dev Clerk key`        | `secure-fetch.test.ts` | ✅ PASS |
| `should block requests to clerk.accounts.dev when using a production Clerk key` | `secure-fetch.test.ts` | ✅ PASS |

---

## Auth Flow Matrix — Manual Re-Verification Required Post-Key-Rotation

The following scenarios from `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
must be re-verified **after** Vercel env vars are rotated to production Clerk keys:

| ID    | Scenario                         | Priority | Status                               |
| ----- | -------------------------------- | -------- | ------------------------------------ |
| AF-01 | New user sign-up                 | Critical | DEFERRED — needs prod Clerk instance |
| AF-02 | New user requiring onboarding    | Critical | DEFERRED — needs prod Clerk instance |
| AF-03 | New user onboarding submit       | Critical | DEFERRED — needs prod Clerk instance |
| AF-04 | Post-onboarding landing          | Critical | DEFERRED — needs prod Clerk instance |
| AF-05 | Returning onboarded user sign-in | Critical | DEFERRED — needs prod Clerk instance |

---

## Residual Risks

| Risk                                                           | Severity | Mitigation                                                                                           |
| -------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| Production Clerk users can't sign in with dev credentials      | High     | Expected — must re-create accounts in prod Clerk                                                     |
| CSP allows `clerk.accounts.dev` in preview even with prod keys | Low      | Intentional — `isPreview` is broad; not a security risk since preview deployments serve trusted code |
| E2E tests reference dev Clerk user credentials                 | Medium   | Update E2E env vars in Vercel with prod Clerk test user credentials after migration                  |

---

## Deferred Items

- Playwright E2E re-run against production Clerk — blocked on Vercel env var rotation (manual step)
- Clerk webhook endpoint setup — not in scope for this task

---

## Summary

Code changes are complete and validated. The `clerk.accounts.dev` domain is now
correctly excluded from the SSRF allowlist when production Clerk keys
(`pk_live_` prefix) are detected, matching the existing CSP conditional logic.

**Manual steps remaining** (Vercel + Clerk Dashboard):

1. Create Clerk production application
2. Configure allowed redirect URLs (Vercel production + preview domains)
3. Rotate `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in Vercel
4. Re-create E2E test users in production Clerk
5. Re-run AUTH_FLOW_VERIFICATION_MATRIX scenarios
