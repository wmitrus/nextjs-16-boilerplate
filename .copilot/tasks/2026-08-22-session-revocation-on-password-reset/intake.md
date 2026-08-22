# Intake — Password Reset Does Not Invalidate Existing JWT Sessions (Case 5)

## Source

User-supplied security audit finding, Case 5 of the ongoing multi-case
remediation series (Cases 1–4: cross-tenant IDOR; `deactivatedAt` not
enforced; login abuse control; password-reset token race).

## Mode

`security-incident-workflow` (session lifecycle / account-takeover recovery).

## Severity

**P1** — the standard account-takeover recovery action does not evict the
attacker. A user who resets their password after a session compromise is
told they have recovered the account while the stolen session keeps working
for up to 30 days.

## Problem Statement

`auth.config.ts` configures `session: { strategy: 'jwt', maxAge: 30 days }`
with no database session store. There is consequently no server-side session
record to delete and no mechanism by which any event could stop an
already-issued token from being honoured. The password reset changed the
stored hash and nothing else.

Interaction worth naming: SEC-33 already enforces `deactivatedAt` from the
database on every request, so _disabling_ an account did evict stale
sessions. Password reset had no equivalent. That is exactly the shape of gap
that survives review — one lifecycle event was covered, so the whole class
looked handled.

## Decision Record (via `AskUserQuestion`, this session)

Two genuine design decisions were put to the user rather than chosen
unilaterally:

1. **Mechanism: timestamp (`sessions_valid_from` vs JWT `iat`)**, over a
   version counter plus a new `sv` claim. Decisive argument: `iat` is
   already present in every JWT, so the check applies to tokens issued
   _before_ this shipped. A counter would have forced a choice between
   logging every user out on deploy or leaving a gap until old tokens
   expired.
2. **Location: `users` table + the two central evaluators**, over
   `user_credentials` + validation inside the AuthJS adapter. Decisive
   argument: both evaluators already fetch the user row per request for the
   SEC-33 deactivation check, so the comparison costs no extra query, and
   the column sits beside `deactivatedAt` where the same class of fact
   already lives.

## Scope

- `users` schema + migration `0017` — `sessions_valid_from`
- `src/security/core/session-revocation.ts` (new) — the comparison, shared
  by both evaluators so they cannot drift
- `src/security/core/node-provisioning-access.ts`,
  `src/security/core/security-context.ts` — enforcement
- `src/core/contracts/identity.ts` — `sessionIssuedAt` claim
- `src/core/contracts/user.ts`, `DrizzleUserRepository` — carry the column
- AuthJS session callback + both identity sources — surface `iat`
- `src/app/api/auth/reset-password/route.ts` — raise the marker
- `NodeSecurityContextDependencies` + its three callers — required dependency
- Tests at every layer above; SEC-36

## Out Of Scope

- Bumping the marker on account deactivation (SEC-33 already denies those
  users per request; adding it would be redundant).
- A user-facing "sign out everywhere" control (a feature, not this fix).
- Clerk-side session revocation — already tracked as `PE-02`.

## Acceptance Criteria

1. A session issued before a reset is refused; one issued after is not.
2. Enforced in **both** central evaluators, not just one.
3. A user who is both deactivated and revoked still reports
   `ACCOUNT_DISABLED` — revocation must not mask the stronger signal.
4. Fails closed when a marker exists but the session carries no issue time.
5. Inert for users who have never reset, and for providers with no `iat`.
6. The marker is raised in the same transaction as the reset.
7. All quality gates green.
