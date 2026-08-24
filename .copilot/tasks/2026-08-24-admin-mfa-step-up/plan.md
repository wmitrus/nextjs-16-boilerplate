# Case 18 (SEC-48) — MFA + Step-Up Auth for Admin Mutations

**Branch**: `claude/password-policy-audit-miz994` (PR #75 — user's explicit
instruction: this case rides on the current PR/branch, not a new one)
**Date**: 2026-08-24
**Finding as reported**: "17. MFA / step-up auth dla admina" — with the current
feature surface (user deactivate, policy changes, invitations, billing,
security settings) MFA/step-up is a sensible production element. OWASP names
MFA the strongest defence against most password attacks and recommends
re-authentication for sensitive operations. Minimum: admin → MFA. Better:
high-risk mutation → recent-auth <= N minutes → MFA verified.

## Cause

There is no authentication-assurance boundary anywhere in this repository.

`evaluateNodeProvisioningAccess` (the single central gate for every Node/RSC
access decision) checks, in order: authentication → `deactivatedAt` (SEC-33)
→ session revocation (SEC-36) → onboarding → tenant → ABAC. Every one of
those answers _who_ the caller is and _what_ they may do. Nothing answers
**how strongly, and how recently, they proved it**.

Concretely, today:

- A stolen or borrowed admin session deactivates users, rewrites ABAC
  policies, issues invitations and changes audit-log retention with no
  further proof of identity, for the full 30-day JWT lifetime.
- `AUTH_PROVIDER=authjs` has exactly one factor (a password) and no second
  factor exists in the codebase — SEC-47 already noted this when it set the
  NIST single-factor 15-character floor rather than the 8-character
  two-factor one.
- `AUTH_PROVIDER=clerk` supports MFA in the provider, but nothing in this
  application requires it, reads it, or notices its absence.
- `sessionIssuedAt` (SEC-36) looks like a freshness fact but is not one:
  NextAuth v4 rotates the JWT (`updateAge`, default 24h), so `iat` means
  "when the session was last refreshed", not "when the human last
  authenticated".

`billing` is named in the finding but has no route handler or UI today
(`src/modules/billing` is service + schema only) — there is nothing to gate.
The guard is built so that the first billing mutation is covered the moment
it is written, without a decision being made again.

## Decisions (user, 2026-08-24)

Four scope decisions, then four implementation decisions. The user rejected
or amended the proposed recommendation in five of the eight — recorded here
verbatim in substance, because the reasoning is the durable part.

| Question               | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What counts as step-up | **Real MFA on both providers.** Step-up means _fresh authentication at a required assurance level_, not "TOTP". Password-only never satisfies MFA. No second factor = **fail closed + enrollment required**, never a downgrade to password-only. Clerk and AuthJS stay adapters behind one contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Where the proof lives  | **Stateless, app-signed, short-lived cookie.** Bound to the internal user id and a provider-neutral **logical session reference**. The proof describes required _assurance/factors_, never a provider-specific method. The base session is always validated before the proof, so revocation/deactivation make a cryptographically valid proof useless. No `step_up_verifications` table — audit stays in the existing audit subsystem. **Not signed with `NEXTAUTH_SECRET` or `CLERK_SECRET_KEY`**: step-up spans both providers, so it gets its own application-level key material, or a provider leaks into a shared mechanism.                                                                                                                                         |
| Which operations       | **Deny-by-default for every state-changing `/api/admin/**` handler**, present and future, through one centralized server-side guard. Exemptions are explicit, narrowly scoped, carry an in-code justification, and **the exemption list starts empty**. A static repository guard fails when a new admin mutation appears without enforcement or an approved exemption. The requirement does **not\*\* depend on whether the caller is a tenant admin or a platform admin — those are authorization levels; step-up is a separate authentication-assurance boundary.                                                                                                                                                                                                      |
| Freshness + rollout    | **15 minutes, fixed in code — no `ADMIN_STEP_UP_TTL_MINUTES`.** A configurable TTL is another security knob that can be set wrong, and this boilerplate has no use case that needs it. Enforcement is required by default and fail-closed; **missing configuration means required, never bypass**. A bypass exists solely for controlled local dev/E2E, validated centrally, and must be unusable in deployed Production or Preview. Normal admin E2E may use the controlled bypass; dedicated step-up E2E must exercise the real challenge and proof flow.                                                                                                                                                                                                               |
| TOTP implementation    | **`otplib` v13 functional API + `qr` for server-side QR.** The user corrected two factual claims in the proposal: `@oslojs/otp` is **deprecated on npm** ("Package no longer supported" — verified in this session), and otplib is **not** in maintenance mode (13.5.0, published 2026-08-21 — verified in this session; the 2026 releases added OTP validation hardening and TOTP replay controls). No hand-rolled RFC 6238: dynamic truncation, Base32, time-step handling, tolerance windows, token normalization, replay semantics, authenticator interoperability and test vectors are ownership this repo does not need. Parameters pinned explicitly in code (SEC-47 precedent), library confined to the AuthJS adapter — it must not leak into the core contract. |
| Recovery codes         | **10 single-use codes, `<public code id>-<random secret>`, Argon2id over the secret.** The proposal's "~80 bits of entropy, so SHA-256 is enough" was rejected: NIST SP 800-63B requires look-up secrets below 112 bits to be stored as a salted hash with a password hashing scheme. The public code id makes the lookup O(1) — one row, therefore exactly **one** Argon2id verification per attempt, not ten. Atomic single-use consume, strict rate limiting, never logged (neither the code nor the submitted value), and regeneration invalidates the whole previous set.                                                                                                                                                                                            |
| MFA at sign-in         | **Yes, for every AuthJS account that has MFA enrolled** — password + TOTP/recovery to get a session at all. Admin access additionally **requires** enrollment. Step-up is a layer on top, not a substitute (OWASP recommends MFA especially for administrators and names sign-in as the moment to require it; NIST separates initial multi-factor authentication from later step-up that raises an existing session's assurance). Critically: **no ABAC inside `authorize()`** — the credentials provider asks only a question that belongs to the auth module ("does this account have MFA enrolled?"), never "is this user an admin?". The admin gate stays where it is and enforces enrollment there.                                                                  |
| TOTP secret at rest    | **AES-256-GCM, never plaintext.** One `APP_SECURITY_MASTER_KEY` used _only_ as HKDF input; independent versioned subkeys per purpose with distinct context labels (`step-up-proof-signing/v1`, `authjs-totp-encryption/v1`) — never the same key material for two operations. Unique random 96-bit nonce per encryption, record-bound AAD (so a ciphertext cannot be moved between accounts), persisted as key version + nonce + ciphertext + auth tag. Rotation-ready from the first version (current + previous). Master key outside repo and DB, separate per Production/Preview, CSPRNG-generated. Never log a decrypted seed, enrollment URI or QR payload.                                                                                                          |

## Solution shape

Four layers, provider-neutral at the top, provider-specific only at the edge.

1. **Assurance contract** (`src/core/contracts/mfa.ts`) — `MfaService`
   (`getStatus`, `verifyChallenge`) plus a provider-neutral logical session
   reference on the identity contract. No otplib, no Clerk, no NextAuth here.
2. **Application key material** (`src/core/security/`) — HKDF-derived,
   versioned subkeys from one master key; AES-256-GCM envelope; HMAC-SHA256
   step-up proof. Web Crypto, so the same code is valid in Node and Edge.
3. **Enforcement** (`src/security/core/step-up/`, `src/security/api/`) —
   `withAdminStepUp` wrapper + the static `/api/admin/**` guard test.
4. **Provider adapters** — Clerk (`verifyTOTP`/`twoFactorEnabled` via
   `@clerk/backend`, both stable APIs — Clerk's own `fva` claim and
   `has({ reverification })` are marked experimental/beta and are
   deliberately not depended on) and AuthJS (own TOTP + recovery codes).

## Phases (live checklist)

- [ ] P1 — app key material: env, HKDF subkeys, AES-GCM envelope, proof sign/verify
- [ ] P2 — DB: `user_mfa_totp`, `user_mfa_recovery_codes`, migration + journal + `readMigrationSql` case
- [ ] P3 — AuthJS MFA service: otplib policy, recovery codes, atomic consume
- [ ] P4 — Clerk MFA adapter + DI wiring + logical session reference on both identity sources
- [ ] P5 — step-up guard + static `/api/admin/**` guard + all admin mutation routes wired
- [ ] P6 — AuthJS sign-in MFA (`authorize()` + sign-in client)
- [ ] P7 — admin gate requires enrollment (layout + API)
- [ ] P8 — UI: enrollment page, step-up dialog, admin client wiring
- [ ] P9 — E2E, docs (SEC-48, `docs/features`, handoff, PE), full gates

## Falsification

(filled in per phase — every new assertion must be confirmed to fail with the
guarded code deliberately broken, then restored)

## Validation

(filled in at close)

## Session limitation — Leantime

`pnpm lt` exists in `package.json`, but this session is a fresh remote clone:
`.env.leantime` and `.env.leantime-dev` are gitignored and therefore absent,
and no `LEANTIME_URL` / `LEANTIME_API_KEY` is present in the environment.
Verified by exact path, not by search results. This is a **session tooling
limitation**, not a broken repository integration — the same limitation the
previous case (SEC-47) ran under.
