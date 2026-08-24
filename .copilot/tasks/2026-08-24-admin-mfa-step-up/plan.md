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

- [x] P1 — app key material: env, HKDF subkeys, AES-GCM envelope, proof sign/verify
- [x] P2 — DB: `user_mfa_totp`, `user_mfa_recovery_codes`, migration + journal + `readMigrationSql` case
- [x] P3 — AuthJS MFA service: otplib policy, recovery codes, atomic consume
- [x] P4 — Clerk MFA adapter + DI wiring + logical session reference on both identity sources
- [x] P5 — step-up guard + static `/api/admin/**` guard + all 18 admin mutations wired
- [x] P6 — AuthJS sign-in MFA (`authorize()` + sign-in client)
- [x] P7 — admin gate requires enrollment (layout + API)
- [x] P8 — UI: enrollment page, step-up dialog, 12 admin clients wired
- [x] P9 — docs (SEC-48, `docs/features/37`, ENV-requirements, handoff, PE-26…29), gates.
      E2E spec written (`e2e/admin-step-up.spec.ts`) and wired into CI as a
      per-PR job; **not executed in this session** — see "Session
      limitations" below.

## Solution — what actually shipped

| Layer          | Files                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Key material   | `src/core/security/app-keys.ts` (HKDF subkeys, key ids, rotation), `envelope-encryption.ts` (AES-256-GCM, record-bound AAD), `base64url.ts` |
| Policy + proof | `src/security/core/step-up/{policy,proof,cookie}.ts`                                                                                        |
| Contract       | `src/core/contracts/mfa.ts` (`MfaService`, `MfaEnrollmentService`), `identity.ts` (`logicalSessionId`)                                      |
| AuthJS factor  | `src/modules/auth/infrastructure/mfa/{totp,recovery-codes,DrizzleAuthJsMfaService,UnsupportedMfaService}.ts`                                |
| Clerk factor   | `src/modules/auth/infrastructure/clerk/ClerkMfaService.ts`                                                                                  |
| Enforcement    | `src/security/api/with-admin-step-up.ts` + `.guard.test.ts`, all 18 admin mutations                                                         |
| Endpoints      | `/api/auth/step-up` (GET/POST), `/api/auth/mfa/totp` (POST/PUT/DELETE), `/api/auth/mfa/recovery-codes` (POST)                               |
| Sign-in        | `authorize()` second factor + `sign-in-client.tsx` two-step form                                                                            |
| Admin gate     | `AdminLayoutGuard.requireMfaEnrollment`                                                                                                     |
| UI             | `/account/security/mfa` (page + client), `StepUpProvider` + dialog, 12 admin clients mutating through `stepUpFetch`                         |
| DB             | migration `0019_rare_outlaw_kid` + its `readMigrationSql()` case in the same commit                                                         |

## Falsification

Every new assertion was confirmed to fail when the code it guards was
deliberately broken, then restored:

- **HKDF domain separation** — making both purposes derive under one `info`
  label makes the two subkeys sign identically; the test fails.
- **`getStatus` counting a pending enrollment** — returning `Boolean(row)`
  instead of `Boolean(row.confirmedAt)` breaks four DB tests.
- **Recovery-code single use** — dropping `used_at IS NULL` from the
  candidate lookup breaks the reuse test.
- **TOTP replay** — removing the freshness predicate from the compare-and-set
  breaks two DB tests. (Notably, an _earlier_ draft also had a redundant
  in-code comparison; removing that changed nothing, which is how it was
  found to be dead weight and deleted — the CAS is the single enforcement
  point.)
- **Static guard** — un-wrapping one admin mutation fails the guard with the
  route named.
- **Step-up guard** — skipping the enrollment check, falling back to the user
  id when the provider exposes no session id, and treating `unavailable` as
  `required` each break exactly the test written for them.
- **Sign-in MFA** — removing the missing-code branch (2 failures), not
  counting a wrong code as a failed attempt (1), skipping the MFA gate
  entirely (5).
- **Client** — rendering the code field unconditionally, sending an empty
  code, prompting on any 403, and replaying after cancel each break their
  test.

Two bugs were found _by_ falsification rather than review: a flaky
tamper-detection test (flipping the trailing base64 character can decode to
identical bytes — it now flips a leading one), and a `mockLimit` "once" queue
leaking between tests after a schema-rejection path consumed none of it.

## Validation

Run in this session, all green:

| Gate                    | Result                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`        | clean                                                                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm lint --fix`       | 0 errors, 12 warnings — the pre-existing baseline, none in new code                                                                                                                                                                                                                                                                                                                                       |
| `pnpm test`             | 256 files / 2118 tests; coverage 82% statements, 78.7% branches (threshold 70)                                                                                                                                                                                                                                                                                                                            |
| `pnpm test:db`          | 23 files / 193 tests (pglite), incl. the new MFA adapter suite                                                                                                                                                                                                                                                                                                                                            |
| `pnpm skott:check:only` | no circular dependencies                                                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm depcheck`         | clean (`otplib`, `qr` both used)                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm env:check`        | `.env.example` in sync                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm madge`            | no circular dependency                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm build`            | passes with `AUTH_PROVIDER=authjs`; `/account/security/mfa`, `/api/auth/step-up` and `/api/auth/mfa/**` all compile. Under the default `AUTH_PROVIDER=clerk` the build fails in this sandbox at prerender with "`@clerk/clerk-react`: The publishableKey passed to Clerk is invalid" — this container only has the `.env.example` placeholder key, so it is an environment fact, unrelated to this change |

## CI blockers found by making the E2E mandatory

Wiring the step-up suite into CI surfaced three failures in a row, none of
them in the feature and all of them pre-existing gaps that had never been hit
because no AuthJS scenario suite had ever run in CI at all:

1. **Clerk fixtures demanded for a non-Clerk run.**
   `check-e2e-auth-env.mjs` validated Clerk test identities for _every_
   scenario, and `global.setup.ts` fetched a Clerk testing token
   unconditionally. Both now gate on the active provider; Clerk runs are
   unchanged (`requiresClerkFixtures(undefined)` is `true`, because unset
   means the app's own default).
2. **Podman on a Docker runner.** `scripts/compose-db-local.mjs` defaults to
   `DB_COMPOSE_ENGINE=podman` -- right for this project's local workflow,
   wrong on a GitHub runner where Podman has no socket. Fixed in the workflow
   (`DB_COMPOSE_ENGINE=docker`), which also starts the database with `--wait`
   so the reset cannot race a Postgres that is still starting.
3. **A production build with no `.env.local`.** The suite finally ran, and
   every test failed on the provisioning route returning `500` -- the SEC-45
   error boundary, i.e. a throw _before_ the handler. Root cause: CI runs
   `next start` (`NODE_ENV=production`), where `DEPLOYMENT_PROXY` (SEC-43) and
   `NEXTAUTH_SECRET` are cross-field-required, and locally both had always
   come from a developer's `.env.local`. A fresh clone has none, so the
   composition root threw on every request. Both are now pinned in
   `scripts/e2e/env/base.env` -- the versioned scenario baseline, so a fresh
   clone is runnable without anyone's private env file.

Verified locally for (3) under CI-equivalent conditions -- `.env.local` moved
aside, production server, scenario env: the provisioning route answers
`400 Invalid request body` (the readiness probe's success condition) instead
of `500`, and an unauthenticated admin mutation answers `401` rather than
failing in the pipeline.

**Fourth run: green.** On head `55ebcd3` the job
("Playwright Admin Step-Up E2E", run 4, 2026-08-24 17:51:43Z) passed, and the
log proves the suite actually executed rather than skipping itself:
`Running 4 tests using 1 worker` followed by all four named specs and
`4 passed (9.3s)` -- enrollment redirect, mutation refused-then-allowed,
recovery code consumed exactly once, and sign-in demanding the second factor.
`[global-setup] AUTH_PROVIDER=authjs — skipping Clerk testing-token setup.`
in the same log confirms the provider-aware gating from (1) doing its job.

## Codacy triage (user decision, 2026-08-24)

After the user re-calibrated the thresholds, the scan came back with a small
set of findings. **The thresholds are now frozen** -- Function Length 120,
Cyclomatic Complexity 15, Parameter Count 10, File Length 500 -- deliberately
not raised further: at 130/20 the two real findings below would vanish along
with the noise, which is tuning the analyser to the code rather than the other
way round.

| Finding                               | Decision            | Done                                                                                                    |
| ------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| Policies `PATCH` -- 127 lines / CC 17 | refactor            | request parsing and the resource/action vocabulary check extracted; the shared domain-error mapping too |
| Waitlist `POST` -- 126 lines / CC 24  | refactor            | `handleWaitlistApproval` / `handleWaitlistRejection`; the router keeps auth, uuid and action selection  |
| Step-up `POST` -- 131 lines           | one extraction      | `respondToFailedChallenge` (log + audit + HTTP shape)                                                   |
| `ClerkRequestIdentitySource` -- CC 24 | **not** refactored  | accepted exception, ignored in the Codacy UI; rationale recorded in the class doc comment               |
| `verifyStepUpProof` -- CC 19          | controlled refactor | `checkClaimsAcceptable` splits semantic acceptance from cryptographic authenticity                      |
| TOTP "hardcoded password"             | false positive      | test fixture seed; ignored in the Codacy UI, rationale recorded next to the constant                    |

Two of these are structural improvements independent of any metric. Waitlist
`POST` held two complete workflows -- approve (approve entry, resolve
destination, invite, handle invite failure, audit) and reject (reject entry,
optional email, handle email failure, audit) -- sharing only a route,
an authorization check and an error mapping. `verifyStepUpProof` answered two
different questions in one body: _is this proof authentic?_ (cryptography,
which is not expected to be edited) and _is an authentic proof acceptable for
this request?_ (freshness and binding policy, which is). They now sit on
either side of a named boundary.

The two accepted exceptions are recorded in the code itself, not only in the
Codacy UI, so a later agent does not "fix" them: the Clerk class carries the
reason its CC score misrepresents it (optional-field normalisation for one log
line, not twenty-four behavioural decisions), and the TOTP fixture carries the
reason it must stay a constant (deterministic RFC 6238 vectors).

**Coverage gap found while falsifying.** Deleting the resource/action
vocabulary check from the policies `PATCH` broke no test -- it had none before
this refactor moved it. Three regression tests now cover it (unknown
resource, action from another resource, action outside the vocabulary), and
they were falsified: removing the check fails all three.

## Session limitations

- **E2E not executed locally, but wired into CI.** After the first push the
  user required this suite to run on CI rather than being a local command:
  `.github/workflows/e2e-admin-step-up.yml` now runs it on every pull
  request (no label, no `paths:` filter) with a tripwire
  (`E2E_REQUIRE_STEP_UP_SUITE=true`) that turns a silent skip into a failure.
  This session still could not execute it here: `scripts/check-e2e-auth-env.mjs` requires Clerk fixture credentials
  (`E2E_CLERK_*`, kept in the gitignored `.env.e2e.local`) for _every_
  scenario run regardless of `AUTH_PROVIDER`, and container mode additionally
  needs a Docker/Podman daemon, which this container does not have. Both are
  environment facts, not repository defects — CI has both.
- **Leantime not reachable** — see the note at the end of this file.
- **Playwright cannot launch a browser in this session.** The sandbox ships
  Chromium build 1194; this Playwright version wants
  `chromium_headless_shell-1208`, and the environment forbids
  `playwright install`. So the browser legs of the suite are verified on CI,
  not here; the server-side legs were verified with a real production server
  and direct HTTP probes as described above.

## Session limitation — Leantime

`pnpm lt` exists in `package.json`, but this session is a fresh remote clone:
`.env.leantime` and `.env.leantime-dev` are gitignored and therefore absent,
and no `LEANTIME_URL` / `LEANTIME_API_KEY` is present in the environment.
Verified by exact path, not by search results. This is a **session tooling
limitation**, not a broken repository integration — the same limitation the
previous case (SEC-47) ran under.
