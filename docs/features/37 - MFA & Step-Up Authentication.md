# MFA & Step-Up Authentication

**Status**: implemented (SEC-48)
**Security pattern**: `docs/ai/general/SECURITY_CODING_PATTERNS.md` → SEC-48
**Task artifacts**: `.copilot/tasks/2026-08-24-admin-mfa-step-up/plan.md`

Administrative work in this boilerplate is protected by three distinct
requirements. They are separate on purpose — each answers a different
question, and each is enforced somewhere different.

| Requirement                                           | Enforced in                                   | Question it answers                            |
| ----------------------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| MFA at sign-in for any account with a factor enrolled | `authorize()` (AuthJS) / the provider (Clerk) | may this session exist at all?                 |
| MFA enrollment for administrators                     | `AdminLayoutGuard`                            | may this person hold administrative authority? |
| A fresh step-up proof for each admin mutation         | `withAdminStepUp`                             | is the human still here, right now?            |

Step-up is an **authentication-assurance** boundary, not an authorization
one. It does not distinguish a platform admin from a tenant admin: those are
authorization levels, decided per route (SEC-26/SEC-41). If the operation is
an admin mutation, both pass the same challenge.

## What a user experiences

**Setting up a second factor** — `/account/security/mfa`

1. "Set up authenticator app" → a QR code, plus the key in text for manual
   entry.
2. Enter the 6-digit code to confirm. An enrollment that is started but never
   confirmed is **not** a second factor.
3. Ten single-use recovery codes are shown **once**. They are stored only as
   Argon2id hashes and can never be displayed again — reissuing replaces the
   whole set.

**Signing in** — an account with a factor enrolled is asked for the code
after its password is accepted. The field appears only once the server asks
for it, so nobody can learn which accounts have MFA without first holding a
valid password.

**Making an admin change** — the first mutation in a 15-minute window prompts
for a code. The prompt appears because the server refused the request, never
because the browser guessed; answering it replays the original request once.

**Losing the authenticator** — any of the ten recovery codes satisfies both
sign-in and step-up. Each works exactly once.

## Configuration

| Variable                           | Required                      | Meaning                                                                                                                                                                    |
| ---------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_SECURITY_MASTER_KEY`          | **Yes in production/preview** | Root secret, HKDF input only. Signs step-up proofs and encrypts TOTP seeds under separate derived subkeys. Minimum 32 characters; generate with `openssl rand -base64 48`. |
| `APP_SECURITY_MASTER_KEY_PREVIOUS` | No                            | The key being rotated out. Verification and decryption only.                                                                                                               |
| `ADMIN_STEP_UP_MODE`               | No (defaults to `required`)   | `required` or `bypass-local-only`. The bypass is rejected at startup **and** at runtime on any deployed environment.                                                       |

Set `APP_SECURITY_MASTER_KEY` **per environment** — Production and Preview
must not share one — and keep it in the deployment secret store, never in the
database or the repository. It is deliberately not `NEXTAUTH_SECRET` or
`CLERK_SECRET_KEY`: step-up spans both auth providers, and binding it to one
provider's secret would leak that provider into a shared mechanism and let a
provider-side rotation invalidate an unrelated control.

**Losing the key** makes every stored TOTP seed undecryptable and every
enrolled user must re-enroll (their recovery codes still work, since those
are hashed rather than encrypted). The envelope format carries a key id, so a
planned rotation is a cutover: publish the new key, move the old one to
`APP_SECURITY_MASTER_KEY_PREVIOUS`, let material re-encrypt, then drop it.

## Provider behaviour

|                | `AUTH_PROVIDER=authjs`                             | `AUTH_PROVIDER=clerk`                         |
| -------------- | -------------------------------------------------- | --------------------------------------------- |
| Factor storage | This application (`user_mfa_totp`, encrypted seed) | Clerk                                         |
| Enrollment UI  | `/account/security/mfa`                            | Clerk's own account UI, linked from that page |
| Verification   | otplib, pinned RFC 6238 policy                     | `users.verifyTOTP` (Backend API)              |
| Recovery codes | This application, Argon2id hashes                  | Clerk backup codes                            |

`supabase` and `neon` are placeholder providers: they get a fail-closed
adapter, so admin mutations under them are refused with a readable reason
rather than a container error.

Clerk's own reverification API (`has({ reverification })`) and its `fva`
session claim are **not** used — they are documented as public beta /
experimental, and depending on them would give Clerk sessions a different
step-up mechanism than AuthJS ones.

## Operational notes

- **Freshness is 15 minutes, fixed in code.** There is no
  `ADMIN_STEP_UP_TTL_MINUTES`: a tunable security window is one more thing
  that can be set wrong, and no use case here needs a different value.
- **Every refusal and every verification is audited** (`admin.step_up.denied`,
  `mfa.challenge.verified`, `mfa.challenge.failed`, `mfa.enrolled`,
  `mfa.disabled`, `mfa.recovery_codes.regenerated`) with a reason, never with
  the submitted code.
- **The challenge and enrollment endpoints are rate limited** through
  `checkStrictRateLimit` (SEC-42), keyed on the actor rather than the IP.
- **A replayed code and a wrong code look identical to the caller** (401).
  Only the audit trail distinguishes them — a correct code presented twice is
  evidence of interception, not a typo.

## Testing

- `pnpm test` covers the key material, the proof, the guard, the static
  deny-by-default rule, the sign-in second factor and the client flows.
- `pnpm test:db` covers the MFA adapter against a real database.
- `pnpm e2e:admin:step-up` runs the real round trip with enforcement
  **required**: enroll a TOTP factor, be refused without a proof, pass the
  challenge, be allowed. Other admin E2E suites run with the controlled
  local bypass because their subject is something else.
- **On CI this suite is not optional.** `.github/workflows/e2e-admin-step-up.yml`
  runs it on every pull request — no label, no `paths:` filter. Step-up is
  what stands between a stolen session and every destructive admin
  operation, and the regression it guards against is exactly "a change
  somewhere else quietly removed the challenge"; a suite that runs only when
  someone remembers a label would not catch that. The workflow also sets
  `E2E_REQUIRE_STEP_UP_SUITE=true`, which makes the spec **throw** instead of
  self-skipping if the runtime is misconfigured — a security suite that skips
  silently is worse than none, because CI goes green having proven nothing.

## Adding a new admin mutation

Wrap it, or the build fails:

```ts
export const POST = withErrorHandler(
  withNodeProvisioning(withAdminStepUp(async (request, context, access) => { ... })),
);
```

`src/security/api/with-admin-step-up.guard.test.ts` walks every route under
`src/app/api/admin/**` and fails on any state-changing export that is not
wrapped. Its exemption list starts empty and the guard asserts that it stays
empty — an exemption is a hole in an authentication boundary and is reviewed
as one.
