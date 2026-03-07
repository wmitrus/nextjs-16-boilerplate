# Clerk E2E Fixtures

This document defines the required Clerk fixtures for the full E2E matrix.

The target matrix covers:

- `single`
- `personal`
- `org/provider`
- `org/db`
- cross-provider / unverified-email negative paths

## 1. Prerequisites

Before creating fixtures in Clerk Dashboard:

1. Use the Clerk test instance for this repository.
2. Enable email + password sign-in/sign-up.
3. Enable Organizations.
4. Set both sign-in and sign-up force redirect URLs to `/auth/bootstrap` in app env.

## 2. Required Organizations

Create these organizations in Clerk Dashboard:

| Organization     | Purpose                                     | Required env var            |
| ---------------- | ------------------------------------------- | --------------------------- |
| `e2e-org-owner`  | positive `org/provider` owner path          | `E2E_CLERK_ORG_OWNER_SLUG`  |
| `e2e-org-member` | positive `org/provider` member path         | `E2E_CLERK_ORG_MEMBER_SLUG` |
| `e2e-org-empty`  | negative org fixture / non-member scenarios | `E2E_CLERK_ORG_EMPTY_SLUG`  |

Recommended slug values:

```dotenv
E2E_CLERK_ORG_OWNER_SLUG=e2e-org-owner
E2E_CLERK_ORG_MEMBER_SLUG=e2e-org-member
E2E_CLERK_ORG_EMPTY_SLUG=e2e-org-empty
```

## 3. Required Users

Create these Clerk users with email + password credentials:

| Identity                        | Purpose                                                     | Email verified | Organization membership                                     | Canonical env vars                                                                         |
| ------------------------------- | ----------------------------------------------------------- | -------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `clerk_single_provisioned_user` | existing provisioned user for authenticated happy paths     | yes            | none                                                        | `E2E_CLERK_SINGLE_PROVISIONED_USER_USERNAME`, `E2E_CLERK_SINGLE_PROVISIONED_USER_PASSWORD` |
| `clerk_single_new_user`         | signed-in user with no internal DB provisioning yet         | yes            | none                                                        | `E2E_CLERK_SINGLE_NEW_USER_USERNAME`, `E2E_CLERK_SINGLE_NEW_USER_PASSWORD`                 |
| `clerk_personal_new_user`       | first bootstrap in `TENANCY_MODE=personal`                  | yes            | none                                                        | `E2E_CLERK_PERSONAL_NEW_USER_USERNAME`, `E2E_CLERK_PERSONAL_NEW_USER_PASSWORD`             |
| `clerk_org_owner`               | `org/provider` owner-role positive path                     | yes            | member of `e2e-org-owner`, role contains `owner` or `admin` | `E2E_CLERK_ORG_OWNER_USERNAME`, `E2E_CLERK_ORG_OWNER_PASSWORD`                             |
| `clerk_org_member`              | `org/provider` member-role positive path                    | yes            | member of `e2e-org-member`, non-owner role                  | `E2E_CLERK_ORG_MEMBER_USERNAME`, `E2E_CLERK_ORG_MEMBER_PASSWORD`                           |
| `clerk_org_non_member`          | signed-in user without membership in selected org/db tenant | yes            | no membership in target organization under test             | `E2E_CLERK_ORG_NON_MEMBER_USERNAME`, `E2E_CLERK_ORG_NON_MEMBER_PASSWORD`                   |
| `clerk_unverified_email_user`   | cross-provider / unverified-email negative path             | no             | none                                                        | `E2E_CLERK_UNVERIFIED_EMAIL_USER_USERNAME`, `E2E_CLERK_UNVERIFIED_EMAIL_USER_PASSWORD`     |

## 4. Dashboard Setup Steps

### 4.1 Create the organizations

1. Open Clerk Dashboard.
2. Go to `Organizations`.
3. Create:
   - `e2e-org-owner`
   - `e2e-org-member`
   - `e2e-org-empty`
4. Keep the slugs stable and copy them into env.

### 4.2 Create the users

For each identity above:

1. Go to `Users`.
2. Create the user with a dedicated email and password.
3. Mark email as verified for all users except `clerk_unverified_email_user`.
4. Store the email/username and password in `.env.local`.

### 4.3 Assign organization memberships

Assign memberships like this:

| User                   | Organization       | Role expectation                   |
| ---------------------- | ------------------ | ---------------------------------- |
| `clerk_org_owner`      | `e2e-org-owner`    | role containing `admin` or `owner` |
| `clerk_org_member`     | `e2e-org-member`   | non-owner role                     |
| `clerk_org_non_member` | none in target org | must remain outside target org     |

Do not add `clerk_org_non_member` to `e2e-org-owner` or `e2e-org-member`.

## 5. Env Mapping

Add this block to `.env.local`:

```dotenv
E2E_CLERK_SINGLE_PROVISIONED_USER_USERNAME=
E2E_CLERK_SINGLE_PROVISIONED_USER_PASSWORD=

E2E_CLERK_SINGLE_NEW_USER_USERNAME=
E2E_CLERK_SINGLE_NEW_USER_PASSWORD=

E2E_CLERK_PERSONAL_NEW_USER_USERNAME=
E2E_CLERK_PERSONAL_NEW_USER_PASSWORD=

E2E_CLERK_ORG_OWNER_USERNAME=
E2E_CLERK_ORG_OWNER_PASSWORD=

E2E_CLERK_ORG_MEMBER_USERNAME=
E2E_CLERK_ORG_MEMBER_PASSWORD=

E2E_CLERK_ORG_NON_MEMBER_USERNAME=
E2E_CLERK_ORG_NON_MEMBER_PASSWORD=

E2E_CLERK_UNVERIFIED_EMAIL_USER_USERNAME=
E2E_CLERK_UNVERIFIED_EMAIL_USER_PASSWORD=

E2E_CLERK_ORG_OWNER_SLUG=e2e-org-owner
E2E_CLERK_ORG_MEMBER_SLUG=e2e-org-member
E2E_CLERK_ORG_EMPTY_SLUG=e2e-org-empty
```

Legacy compatibility still exists for:

- `E2E_CLERK_USER_USERNAME`
- `E2E_CLERK_USER_PASSWORD`
- `E2E_CLERK_UNPROVISIONED_USER_USERNAME`
- `E2E_CLERK_UNPROVISIONED_USER_PASSWORD`

But use the canonical names above for all new setup.

## 6. DB State Notes

Clerk is persistent. Local DB may be reset between runs.

Use these rules:

1. `clerk_single_provisioned_user` is allowed to be already provisioned in DB before the test starts.
2. `clerk_single_new_user` and `clerk_personal_new_user` must start without internal mappings in the current DB.
3. `clerk_org_owner` and `clerk_org_member` may be re-used across runs, but DB reset means bootstrap/provisioning will happen again.
4. For `org/db`, the target tenant and memberships are DB fixtures, not Clerk organizations. Clerk org membership is not the source of truth in that mode.

## 7. Validation

Run:

```bash
node scripts/check-e2e-auth-env.mjs
```

Expected:

- success when all required identities and org slugs are configured
- warning only if legacy alias vars are used instead of canonical names
