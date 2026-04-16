# Intake — Clerk Production Instance Migration

**Task ID**: `2026-04-13-clerk-prod-migration`
**Leantime Task ID**: 44
**Date**: 2026-04-13

---

## Objective

Migrate this boilerplate's Clerk authentication from a **development instance**
(keys prefixed `pk_test_` / `sk_test_`) to a **production instance** (keys
prefixed `pk_live_` / `sk_live_`).

---

## Trigger

Browser console warning observed on Vercel deployment:

```text
Clerk: Clerk has been loaded with development keys. Development instances have
strict usage limits and should not be used when deploying your application to
production.
```

---

## Source Evidence

| Evidence                           | Location                                                         |
| ---------------------------------- | ---------------------------------------------------------------- |
| Clerk warning                      | Browser console (user report)                                    |
| Dev key outbound allowlist         | `src/security/outbound/secure-fetch.ts:31`                       |
| CSP conditional handling (correct) | `src/security/middleware/with-headers.ts:34`                     |
| Dev key example                    | `.env.example` — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...` |
| Auth flow matrix                   | `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`               |

---

## Code Finding Summary

### ✅ Already correct

`src/security/middleware/with-headers.ts` — CSP builder checks
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_')` and only adds
`https://*.clerk.accounts.dev` + `wss://*.clerk.accounts.dev` when dev keys
are detected. Switching to `pk_live_...` automatically removes these dev CSP
entries.

### ⚠️ Requires code change

`src/security/outbound/secure-fetch.ts` — `clerk.accounts.dev` is in the
`coreAllowed` list unconditionally for all environments. In production, outbound
requests to `clerk.accounts.dev` should not be permitted. The fix must mirror the
`with-headers.ts` pattern (conditional on `pk_test_` key prefix).

### ✅ No Clerk webhook secret

No `CLERK_WEBHOOK_SECRET` found in codebase — no webhook migration required.

### ✅ Test fixtures

`pk_test_mock` / `sk_test_mock` in test files are correct mock values — no
test changes required for that.

---

## Requirements

1. **Code**: Fix `secure-fetch.ts` — make `clerk.accounts.dev` conditional on dev keys.
2. **Vercel env vars** (manual): Rotate `CLERK_SECRET_KEY` and
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to production values for all Vercel
   environments (production + preview).
3. **Clerk Dashboard** (manual): Create production instance, configure allowed
   redirect URLs for the Vercel domain.
4. **Auth flow re-verification** (manual): Re-run `AUTH_FLOW_VERIFICATION_MATRIX`
   scenarios against the production instance after key rotation.

---

## Acceptance Criteria

- [ ] `clerk.accounts.dev` removed from production outbound allowlist (code fix)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `validation-report.md` documents manual Vercel + Clerk Dashboard steps
- [ ] Auth matrix scenarios identified as requiring re-verification post-rotation

---

## Readiness Checklist

- [x] Root cause identified in code
- [x] CSP handling confirmed correct (no change needed)
- [x] No webhook secret migration needed
- [ ] Leantime task created (Step 1)
- [ ] Security & Auth review complete (Step 2)
- [ ] Code fix implemented and tested (Step 3)
- [ ] Validation gate passed (Step 4)
- [ ] Leantime task closed (Step 5)

---

## Open Questions

_None — scope is clear from code investigation._

---

## Deferred / Out of Scope

- E2E Playwright re-run against production Clerk — requires Vercel env vars rotated first (manual step)
- Clerk Dashboard webhook setup — not implemented in this boilerplate yet
- User migration from dev → prod Clerk instance — user must re-register or be invited in prod instance
