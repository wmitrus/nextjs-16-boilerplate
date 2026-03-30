# Clerk E2E Fixtures

This document defines the Clerk fixtures required by the scenario runner and
the runtime provisioning matrix.

The target matrix covers:

- `single`
- `personal`
- `org/provider`
- `org/db`
- cross-provider / unverified-email negative paths
- optional OAuth redirect paths

## 1. Prerequisites

Before creating fixtures in Clerk Dashboard:

1. Use the Clerk test instance for this repository.
2. Enable email + password sign-in/sign-up.
3. Make email address a valid sign-in identifier for the instance.
4. For password-based E2E fixtures, do not require an additional sign-in step
   that forces email-code verification or other second-factor verification for
   these users.
5. Do not require MFA for the dedicated E2E password users.
6. If you want to exercise the hosted Clerk sign-up verification UI in E2E,
   enable the relevant first-factor verification method on the Clerk test
   instance. For the current AF-01 browser path, that means email-code
   verification must be enabled for sign-up.
7. Enable Organizations only for the `org/provider` and `org/db` scenarios.
   They are not required for `single` or `personal`.
8. Set both sign-in and sign-up force redirect URLs to `/auth/bootstrap`.
9. Ensure the Clerk session token exposes a real email claim to `auth()`.
   Supported contracts in this boilerplate are:
   - preferred explicit custom session claim: `email`
   - supported backward-compatible custom session claim: `primaryEmail`
10. Store local Clerk fixture secrets in `.env.e2e.local` or `.env.e2e`.

Recommended custom session token snippet:

```json
{
  "email": "{{user.primary_email_address}}"
}
```

Important runtime contract:

- The runtime suite is designed around Clerk's recommended Playwright helper
  flow: load Clerk on a public page, then call
  `clerk.signIn({ signInParams: { strategy: 'password', ... } })`.
- The test harness must not manually mint or inject Clerk session cookies.
- If a Clerk fixture signs in only through an interactive "Check your email"
  or "new device" challenge, that fixture is not E2E-ready for this suite.
- In practice, the first thing to check is Clerk's Client Trust / additional
  sign-in verification behavior for the test instance. If that policy is on
  for these fixtures, the runtime helper will correctly stop instead of trying
  to bypass the challenge with custom cookies.
- If the app provisions users with `external+clerk-...@local.invalid`, the
  session token did not expose a usable email claim. That is a contract/config
  problem, not a valid steady-state for production.

Verification-code contract for hosted Clerk E2E:

- Clerk test emails are deterministic when the email contains `+clerk_test`.
- The current `e2e/auth.spec.ts` sign-up helper already creates emails in that
  pattern.
- For Clerk-hosted email verification using test emails, the expected code is
  `424242`.
- This rule is suitable for the narrow interactive Clerk verification slice,
  not as a replacement for the repo's main password-fixture strategy.
- No separate CI-only Clerk toggle is required for that code itself. The
  important prerequisites are: use a Clerk test instance, enable the relevant
  first-factor verification method, and keep dedicated password fixtures free
  of extra Client Trust / MFA challenges.
- If Clerk verification still introduces new-device, second-factor, or other
  non-first-factor challenges, treat that as unsupported for the current
  Playwright helper flow rather than trying to bypass it in the app.

## 2. Required Organizations

Create these organizations in Clerk Dashboard:

| Organization     | Purpose                             | Required env var                     |
| ---------------- | ----------------------------------- | ------------------------------------ |
| `e2e-org-owner`  | positive `org/provider` owner path  | `E2E_CLERK_ORG_PROVIDER_OWNER_SLUG`  |
| `e2e-org-member` | reserved `org/provider` member path | `E2E_CLERK_ORG_PROVIDER_MEMBER_SLUG` |

Recommended slug values:

```dotenv
E2E_CLERK_ORG_PROVIDER_OWNER_SLUG=e2e-org-owner
E2E_CLERK_ORG_PROVIDER_MEMBER_SLUG=e2e-org-member
```

## 3. Required Users

Create these Clerk users with email + password credentials:

| Identity                        | Purpose                                              | Email verified | Clerk org membership                                   | Canonical env vars                                                                         |
| ------------------------------- | ---------------------------------------------------- | -------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `clerk_single_provisioned_user` | reusable signed-in user for single-mode auth/runtime | yes            | none                                                   | `E2E_CLERK_SINGLE_PROVISIONED_USER_USERNAME`, `E2E_CLERK_SINGLE_PROVISIONED_USER_PASSWORD` |
| `clerk_single_new_user`         | first bootstrap in `TENANCY_MODE=single`             | yes            | none                                                   | `E2E_CLERK_SINGLE_NEW_USER_USERNAME`, `E2E_CLERK_SINGLE_NEW_USER_PASSWORD`                 |
| `clerk_personal_new_user`       | first bootstrap in `TENANCY_MODE=personal`           | yes            | none                                                   | `E2E_CLERK_PERSONAL_NEW_USER_USERNAME`, `E2E_CLERK_PERSONAL_NEW_USER_PASSWORD`             |
| `clerk_org_provider_owner`      | `org/provider` owner-role positive path              | yes            | member of `e2e-org-owner`, role contains `owner/admin` | `E2E_CLERK_ORG_PROVIDER_OWNER_USERNAME`, `E2E_CLERK_ORG_PROVIDER_OWNER_PASSWORD`           |
| `clerk_org_provider_member`     | reserved `org/provider` member-role fixture          | yes            | member of `e2e-org-member`, non-owner role             | `E2E_CLERK_ORG_PROVIDER_MEMBER_USERNAME`, `E2E_CLERK_ORG_PROVIDER_MEMBER_PASSWORD`         |
| `clerk_org_db_seeded_member`    | `org/db` seeded membership path                      | yes            | none required                                          | `E2E_CLERK_ORG_DB_SEEDED_MEMBER_USERNAME`, `E2E_CLERK_ORG_DB_SEEDED_MEMBER_PASSWORD`       |
| `clerk_link_blocked_unverified` | cross-provider linking negative path                 | no             | none                                                   | `E2E_CLERK_LINK_BLOCKED_UNVERIFIED_USERNAME`, `E2E_CLERK_LINK_BLOCKED_UNVERIFIED_PASSWORD` |

Optional auth-regression identity for rerunnable incomplete-user checks:

| Identity                | Purpose                                                              | Email verified | Clerk org membership | Canonical env vars                                                         |
| ----------------------- | -------------------------------------------------------------------- | -------------- | -------------------- | -------------------------------------------------------------------------- |
| `clerk_incomplete_user` | reusable Clerk identity for the auth-regression incomplete-user flow | yes            | none                 | `E2E_CLERK_INCOMPLETE_USER_USERNAME`, `E2E_CLERK_INCOMPLETE_USER_PASSWORD` |

Important contract for this identity:

- this identity is reusable, but the incomplete app state is not a permanent fixture
- for rerunnable runs, the test or operator must recreate the onboarding-incomplete app state during the run after DB reset
- do not treat this identity as a permanently preserved incomplete internal user across runs
- do not assign organizations for the `single` incomplete-user flow

Seed-coupled fixture constraints:

- `E2E_CLERK_ORG_DB_SEEDED_MEMBER_USERNAME` must currently be `bob@example.com`
- `E2E_CLERK_LINK_BLOCKED_UNVERIFIED_USERNAME` must currently be `alice@example.com`

Those two constraints exist because the current E2E suite reuses the local DB
seed records for `org/db` and cross-provider-linking negatives.

## 4. Dashboard Setup Steps

### 4.1 Create the organizations

1. Open Clerk Dashboard.
2. Go to `Organizations`.
3. Create:
   - `e2e-org-owner`
   - `e2e-org-member`
4. Keep the slugs stable and copy them into env.

### 4.2 Create the users

For each identity above:

1. Go to `Users`.
2. Create the user with a dedicated email and password.
3. Mark email as verified for all users except
   `clerk_link_blocked_unverified`.
4. For the two seed-coupled identities, use the exact required emails:
   - `bob@example.com` for `clerk_org_db_seeded_member`
   - `alice@example.com` for `clerk_link_blocked_unverified`
5. Store the email/username and password in `.env.e2e.local` or `.env.e2e`.

### 4.2a Hosted verification test-emails

Use this only for interactive hosted sign-up / verification coverage such as
AF-01.

Rules:

1. Generate a throwaway email containing `+clerk_test`.
2. Complete Clerk's hosted verify-email step with code `424242`.
3. Do not reuse this pattern for the stable password-fixture identities above.
4. If Clerk reports that `email_code` is not enabled, enable email-code
   verification on the Clerk test instance before treating the flow as an app
   regression.
5. If the instance adds MFA, Client Trust, or other extra verification on top
   of the first-factor email-code step, do not classify that as app-routing
   failure. It is a Clerk-instance policy issue for this harness.

### 4.3 Assign organization memberships

Assign memberships like this:

| User                        | Organization     | Role expectation                   |
| --------------------------- | ---------------- | ---------------------------------- |
| `clerk_org_provider_owner`  | `e2e-org-owner`  | role containing `admin` or `owner` |
| `clerk_org_provider_member` | `e2e-org-member` | non-owner role                     |

Do not use Clerk organization membership as tenant truth in `org/db`. That mode
is DB-managed and depends on seeded app-side membership only.

For `single` and `personal`:

- do not assign organizations unless you are intentionally testing an org flow
- tenant truth remains in the application database, not in Clerk

## 5. Env Mapping

Add this block to `.env.e2e.local`:

```dotenv
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=

# Universal E2E backend mode switch
# pglite    => lightweight local file-backed mode
# container => isolated container-backed mode on test DB 5433/app_test
E2E_BACKEND_MODE=container

# Optional local container-engine override
# DB_COMPOSE_ENGINE=podman

# Optional Playwright base URL override
# PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000

# Scenario A: single / returning provisioned user
E2E_CLERK_SINGLE_PROVISIONED_USER_USERNAME=
E2E_CLERK_SINGLE_PROVISIONED_USER_PASSWORD=

# Scenario A: single / first bootstrap new user
E2E_CLERK_SINGLE_NEW_USER_USERNAME=
E2E_CLERK_SINGLE_NEW_USER_PASSWORD=

# Optional auth-regression reusable identity for the single incomplete-user path
# This is only the Clerk identity. The onboarding-incomplete app state should be recreated during the run.
E2E_CLERK_INCOMPLETE_USER_USERNAME=
E2E_CLERK_INCOMPLETE_USER_PASSWORD=

# Scenario B: personal / first bootstrap new personal user
E2E_CLERK_PERSONAL_NEW_USER_USERNAME=
E2E_CLERK_PERSONAL_NEW_USER_PASSWORD=

# Scenario C: org/provider / owner-capable fixture in e2e-org-owner
E2E_CLERK_ORG_PROVIDER_OWNER_USERNAME=
E2E_CLERK_ORG_PROVIDER_OWNER_PASSWORD=

# Scenario C: org/provider / member fixture in e2e-org-member
E2E_CLERK_ORG_PROVIDER_MEMBER_USERNAME=
E2E_CLERK_ORG_PROVIDER_MEMBER_PASSWORD=

# Stable org/provider slugs expected by the suite
E2E_CLERK_ORG_PROVIDER_OWNER_SLUG=e2e-org-owner
E2E_CLERK_ORG_PROVIDER_MEMBER_SLUG=e2e-org-member

# Scenario D: org/db / seeded DB-linked member, must stay bob@example.com
E2E_CLERK_ORG_DB_SEEDED_MEMBER_USERNAME=bob@example.com
E2E_CLERK_ORG_DB_SEEDED_MEMBER_PASSWORD=

# Cross-provider linking negative fixture, must stay alice@example.com and remain unverified
E2E_CLERK_LINK_BLOCKED_UNVERIFIED_USERNAME=alice@example.com
E2E_CLERK_LINK_BLOCKED_UNVERIFIED_PASSWORD=

# Optional. Example: google or github
# E2E_CLERK_OAUTH_PROVIDER=google
```

Legacy aliases still exist temporarily for:

- `E2E_CLERK_USER_USERNAME`
- `E2E_CLERK_USER_PASSWORD`
- `E2E_CLERK_UNPROVISIONED_USER_USERNAME`
- `E2E_CLERK_UNPROVISIONED_USER_PASSWORD`
- `E2E_CLERK_ORG_OWNER_USERNAME`
- `E2E_CLERK_ORG_OWNER_PASSWORD`
- `E2E_CLERK_ORG_MEMBER_USERNAME`
- `E2E_CLERK_ORG_MEMBER_PASSWORD`
- `E2E_CLERK_UNVERIFIED_EMAIL_USER_USERNAME`
- `E2E_CLERK_UNVERIFIED_EMAIL_USER_PASSWORD`

Use the canonical names above for all new setup.

## 6. Scenario Runner Usage

Run the scenario matrix through the package scripts:

```bash
pnpm e2e:auth
pnpm e2e:scenario:single
pnpm e2e:scenario:personal
pnpm e2e:scenario:org-provider
pnpm e2e:scenario:org-db
```

Targeted negative slices:

```bash
pnpm e2e:neg:missing-default-tenant
pnpm e2e:neg:linking-disabled
pnpm e2e:neg:free-tier-limit
```

Under the hood the runner:

1. loads `.env.local` for backwards-compatible local defaults
2. loads `.env.e2e` for shared local E2E values
3. loads `scripts/e2e/env/base.env`
4. loads the selected scenario env and optional variant env
5. loads `.env.e2e.local` as the highest-precedence local overlay
6. prepares the selected backend mode:
   - `pglite`: resets the scenario-specific PGlite DB
   - `container`: starts the isolated test DB and resets `5433/app_test`
7. migrates, seeds, validates env, then runs Playwright

## 7. Verification-Code Design Notes

Current repo design:

- primary stable path: dedicated Clerk password fixtures sign in through the
  Playwright Clerk helper and then enter app-owned bootstrap/onboarding flows
- narrow hosted verification path: AF-01 style interactive Clerk sign-up uses a
  generated `+clerk_test` email and should complete Clerk email verification
  with `424242`

Operational guidance:

- do not require any extra env var for the hosted verification code; it is a
  fixed Clerk testing rule, not a repository secret
- do not create a stored `.env` variable for `424242`
- if CI/local runs need hosted sign-up verification, ensure the same Clerk test
  instance configuration is used in both environments
- if the hosted verification path remains unstable, record it as a harness-side
  Clerk verification issue rather than weakening the password-based runtime
  fixture strategy

## 8. DB State Notes

Clerk is persistent. The scenario runner resets the local DB per scenario.

Use these rules:

1. `clerk_single_provisioned_user` may already exist in Clerk, but the DB is
   treated as disposable and will be rebuilt by the runner.
2. `clerk_single_new_user` and `clerk_personal_new_user` must not rely on any
   pre-existing DB mappings.
3. `clerk_org_provider_owner` and `clerk_org_provider_member` may be re-used
   across runs, but bootstrap/provisioning will be replayed against each fresh
   scenario DB.
4. `clerk_org_db_seeded_member` must remain aligned with the seeded DB member
   email (`bob@example.com`) until the E2E suite gets a dedicated DB fixture
   loader for org/db.
5. `clerk_link_blocked_unverified` must remain aligned with the seeded DB user
   email (`alice@example.com`) until the cross-provider-linking negative path
   gets a dedicated DB fixture loader.
6. `clerk_incomplete_user`, when used, should be treated as a reusable Clerk identity only.
   The onboarding-incomplete app state must be created inside the run after DB reset by reaching `/onboarding` and intentionally not submitting onboarding before the returning-user assertions.

## 8. OAuth Setup

OAuth redirect tests are opt-in. They require:

1. A real OAuth connection enabled in the same Clerk test instance.
2. `E2E_CLERK_OAUTH_PROVIDER` set to the Clerk provider identifier, for
   example `google` or `github`.
3. Provider-side login automation if the provider cannot be completed inside
   the Clerk testing harness.

Current suite status:

- supported contract: provider button selection from Clerk UI
- not yet guaranteed end-to-end: external IdP credential submission and consent

Run the opt-in OAuth slice with:

```bash
pnpm e2e:oauth
```

## 9. Validation

Run:

```bash
node scripts/check-e2e-auth-env.mjs --scenario single
```

Expected:

- success when the required identities and org slugs are configured
- warning only if legacy alias vars are used instead of canonical names

## 10. Troubleshooting

If the Clerk helper sign-in does not result in an authenticated app session:

1. Confirm the app keys point to the same Clerk test instance as the fixtures:
   - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
2. Confirm the fixture user has:
   - email address
   - password set
   - email verified when the scenario expects a verified user
3. Confirm password sign-in is enabled for the instance.
4. Confirm the instance does not force an extra verification step for these
   password fixtures.
5. Check Client Trust / new-device verification behavior in the Clerk test
   instance. If it is enabled for these users, the helper will not be able to
   complete password sign-in as a first-factor-only flow.
6. If the browser lands on a "Check your email" screen for an existing test
   user, treat that as a Clerk fixture/policy problem, not as a provisioning or
   tenant-resolution problem in the app.
