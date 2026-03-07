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
6. Enable Organizations only for the `org/provider` and `org/db` scenarios.
   They are not required for `single` or `personal`.
7. Set both sign-in and sign-up force redirect URLs to `/auth/bootstrap`.
8. Store local Clerk fixture secrets in `.env.e2e.local` or `.env.e2e`.

Important runtime contract:

- The runtime suite is designed around Clerk's recommended Playwright helper
  flow: load Clerk on a public page, then call
  `clerk.signIn({ signInParams: { strategy: 'password', ... } })`.
- The test harness must not manually mint or inject Clerk session cookies.
- If a Clerk fixture signs in only through an interactive "Check your email"
  or "new device" challenge, that fixture is not E2E-ready for this suite.

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

E2E_CLERK_SINGLE_PROVISIONED_USER_USERNAME=
E2E_CLERK_SINGLE_PROVISIONED_USER_PASSWORD=

E2E_CLERK_SINGLE_NEW_USER_USERNAME=
E2E_CLERK_SINGLE_NEW_USER_PASSWORD=

E2E_CLERK_PERSONAL_NEW_USER_USERNAME=
E2E_CLERK_PERSONAL_NEW_USER_PASSWORD=

E2E_CLERK_ORG_PROVIDER_OWNER_USERNAME=
E2E_CLERK_ORG_PROVIDER_OWNER_PASSWORD=

E2E_CLERK_ORG_PROVIDER_MEMBER_USERNAME=
E2E_CLERK_ORG_PROVIDER_MEMBER_PASSWORD=

E2E_CLERK_ORG_DB_SEEDED_MEMBER_USERNAME=bob@example.com
E2E_CLERK_ORG_DB_SEEDED_MEMBER_PASSWORD=

E2E_CLERK_LINK_BLOCKED_UNVERIFIED_USERNAME=alice@example.com
E2E_CLERK_LINK_BLOCKED_UNVERIFIED_PASSWORD=

E2E_CLERK_ORG_PROVIDER_OWNER_SLUG=e2e-org-owner
E2E_CLERK_ORG_PROVIDER_MEMBER_SLUG=e2e-org-member

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
6. resets the scenario-specific PGlite DB
7. migrates, seeds, validates env, then runs Playwright

## 7. DB State Notes

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
5. If the browser lands on a "Check your email" screen for an existing test
   user, treat that as a Clerk fixture/policy problem, not as a provisioning or
   tenant-resolution problem in the app.
