# Intake — Password Reset Token Not Atomically Single-Use (Case 4)

## Source

User-supplied security audit finding, Case 4 of the ongoing multi-case
remediation series (Case 1: cross-tenant IDOR; Case 2: `deactivatedAt` not
enforced; Case 3: AuthJS login abuse control).

## Mode

`security-incident-workflow` (TOCTOU race on a single-use security token).

## Severity

**P1** — a password reset token, whose entire security value rests on being
single-use, can be redeemed more than once under concurrency, allowing two
different passwords to be set for one account from one token.

## Problem Statement

`src/app/api/auth/reset-password/route.ts` validated and consumed the token
in two separate statements with an expensive operation between them:

```
SELECT ... WHERE token_hash = ? AND expires_at > now AND used_at IS NULL   -- check
await hash(password, 12)                                                   -- ~300ms
UPDATE password_reset_tokens SET used_at = now WHERE id = ?                -- act
```

The `UPDATE` was keyed on `id` alone. It re-verified neither `used_at IS
NULL` nor expiry, and its result was never inspected. Two concurrent
requests carrying the same token therefore both passed the `SELECT`, both
hashed, both "consumed" the token, and both wrote a password — last writer
wins.

The bcrypt call between check and act is what makes this practically
exploitable rather than theoretical: at cost 12 it holds the race window
open for hundreds of milliseconds, which is trivially wide enough to hit
with parallel requests.

## Confirmed By Investigation, Not Assumed

Read the route directly (not the report's paraphrase) and confirmed every
element of the claim: the two-statement split, the `eq(id)`-only predicate,
the absent `RETURNING` check, and bcrypt's position between them.

Then checked the repository's **other two single-use token flows** for the
same defect, the same discipline that found Case 2's second evaluator:

| Flow               | Location                                   | Verdict                                                                                                          |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Email verification | `src/app/auth/verify-email/page.tsx`       | **Already correct** — atomic `UPDATE ... WHERE tokenHash = ? AND expiresAt > NOW() AND usedAt IS NULL RETURNING` |
| Invitations        | `DrizzleInvitationRepository.markAccepted` | **Already correct** — `UPDATE ... WHERE id = ? AND status = 'pending' RETURNING`                                 |
| Password reset     | `src/app/api/auth/reset-password/route.ts` | **Defective** — the subject of this case                                                                         |

This reframes the finding usefully: it is not a missing pattern, it is a
**single divergence from a pattern this repository already implements
correctly twice**. The fix mirrors the existing correct code rather than
inventing an approach.

## Scope

- `src/app/api/auth/reset-password/route.ts` — atomic claim
- `src/app/api/auth/reset-password/route.test.ts` — new unit coverage
- `src/app/api/auth/reset-password/route.db.test.ts` — new real-DB
  concurrency proof
- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — SEC-35

## Out Of Scope

- Invalidating a user's _other_ outstanding reset tokens after a successful
  reset (OWASP-recommended hardening, but a behaviour change beyond closing
  this race) — logged as a possible enhancement instead.
- Rate limiting the reset endpoint itself (separate concern from atomicity).

## Acceptance Criteria

1. Exactly one of N concurrent redemptions of the same token succeeds.
2. The winning claim's `used_at` is never overwritten by a losing one.
3. A lost race is indistinguishable from an invalid token in the response.
4. An expired-but-unused token is still rejected by the claim itself, not
   only by the pre-check.
5. Proven against a real database, not only against mocks — the guarantee
   being tested is a SQL-level one.
6. All quality gates green.
