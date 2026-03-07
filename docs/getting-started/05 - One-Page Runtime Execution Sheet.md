# One-Page Runtime Execution Sheet

Use this sheet for live runtime validation with explicit checklist rows.

Assumed baseline:

- `AUTH_PROVIDER=clerk`
- DB migrated + seeded
- app running on `http://localhost:3000`

## Execution Model (Authoritative)

Use **chained mode** for this sheet.

- One DB state for the full run.
- One browser session.
- Scenario order is fixed: `A -> B -> C -> D`.

Reason: Scenario D positive-path membership reuses setup from earlier scenarios.

## How to Use

- Mark `Done` per row while executing tests.
- After each env change, restart `pnpm dev`.
- Treat `/security-showcase` mutation as a separate authorization diagnostic, not a tenancy gate.

## Quick Setup (Once)

| Done | Step | Command / Action      | Expected                         |
| ---- | ---- | --------------------- | -------------------------------- |
| [ ]  | Q-1  | `pnpm env:check`      | env validation passes            |
| [ ]  | Q-2  | `pnpm db:migrate:dev` | migrations applied               |
| [ ]  | Q-3  | `pnpm db:seed`        | seed complete                    |
| [ ]  | Q-4  | `pnpm dev`            | app boots without startup errors |

## Baseline Auth Gate (Before Scenario Tests)

| Done | Step | Command / Action                          | Expected               |
| ---- | ---- | ----------------------------------------- | ---------------------- |
| [ ]  | B-1  | `curl -i http://localhost:3000/api/users` | `401` + `UNAUTHORIZED` |
| [ ]  | B-2  | Open `/users` while signed out            | redirect to `/sign-in` |

## Scenario A - Single Tenant

Set:

```dotenv
TENANCY_MODE=single
DEFAULT_TENANT_ID=10000000-0000-4000-8000-000000000001
```

### Clerk Setup (Scenario A)

| Done | Step | Command / Action                                            | Expected                                  |
| ---- | ---- | ----------------------------------------------------------- | ----------------------------------------- |
| [ ]  | A-C1 | In Clerk Dashboard ensure email sign-in/sign-up is enabled. | user can authenticate with email          |
| [ ]  | A-C2 | Organizations may stay disabled (or enabled but unused).    | no org configuration is required          |
| [ ]  | A-C3 | Ensure test user exists and can sign in.                    | authenticated session without org context |

### Runtime Verification (Scenario A)

| Done | Step | Command / Action                                                                                                    | Expected                                                                   |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [ ]  | A-R1 | Restart `pnpm dev` after env change.                                                                                | app starts                                                                 |
| [ ]  | A-R2 | Sign in with Clerk user (no org required).                                                                          | authenticated session                                                      |
| [ ]  | A-R3 | Complete `/onboarding` if shown.                                                                                    | success, no provisioning error                                             |
| [ ]  | A-R4 | Open `/users`.                                                                                                      | page loads, no tenant-context redirect                                     |
| [ ]  | A-R5 | Browser console: `fetch('/api/users').then(async r => ({status:r.status, body: await r.json()})).then(console.log)` | `200` success                                                              |
| [ ]  | A-R6 | Optional diagnostic: submit Update Settings in `/security-showcase`.                                                | result is controlled (`success` or explicit authorization error), no crash |

## Scenario B - Personal Tenant

Set:

```dotenv
TENANCY_MODE=personal
```

### Clerk Setup (Scenario B)

| Done | Step | Command / Action                             | Expected                          |
| ---- | ---- | -------------------------------------------- | --------------------------------- |
| [ ]  | B-C1 | Keep email sign-in/sign-up enabled.          | login works for provisioning flow |
| [ ]  | B-C2 | Organizations are optional and not required. | org setup not needed              |
| [ ]  | B-C3 | Use existing test user or create a new one.  | user can sign in                  |

### Runtime Verification (Scenario B)

| Done | Step | Command / Action                                              | Expected                    |
| ---- | ---- | ------------------------------------------------------------- | --------------------------- |
| [ ]  | B-R1 | Restart `pnpm dev` after env change.                          | app starts                  |
| [ ]  | B-R2 | Sign in and complete onboarding.                              | personal tenant provisioned |
| [ ]  | B-R3 | Open `/users`.                                                | page works                  |
| [ ]  | B-R4 | Browser console API probe from Scenario A.                    | `200` success               |
| [ ]  | B-R5 | Optional diagnostic: Update Settings in `/security-showcase`. | controlled result, no crash |

## Scenario C - Org via Provider

Set:

```dotenv
TENANCY_MODE=org
TENANT_CONTEXT_SOURCE=provider
```

### Clerk Setup (Scenario C)

| Done | Step | Command / Action                                                                                        | Expected                                |
| ---- | ---- | ------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [ ]  | C-C1 | In Clerk Dashboard enable Organizations.                                                                | org features available                  |
| [ ]  | C-C2 | Create organization (example: `org-provider-test`).                                                     | organization exists                     |
| [ ]  | C-C3 | Add test user to that organization.                                                                     | user has org membership                 |
| [ ]  | C-C4 | In app click `UserButton` -> account/org context and set this org as active for current session.        | provider session exposes active `orgId` |
| [ ]  | C-C5 | For role-path checks set org role: contains `admin`/`owner` -> internal `owner`, otherwise -> `member`. | role mapping path is deterministic      |

### Runtime Verification (Scenario C)

| Done | Step | Command / Action                                                   | Expected                                                                                   |
| ---- | ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [ ]  | C-R1 | Restart `pnpm dev` after env change.                               | app starts                                                                                 |
| [ ]  | C-R2 | Sign in user **without active org** and open `/users`.             | redirect `/onboarding?reason=tenant-context-required`                                      |
| [ ]  | C-R3 | Browser console API probe with no active org.                      | `409` + `TENANT_CONTEXT_REQUIRED`                                                          |
| [ ]  | C-R4 | Activate org in session, then open `/users` **before onboarding**. | redirect `/onboarding?reason=tenant-context-required` (tenant mapping not yet provisioned) |
| [ ]  | C-R5 | Browser console API probe with active org but before onboarding.   | `409` + `TENANT_CONTEXT_REQUIRED`                                                          |
| [ ]  | C-R6 | Complete onboarding, then test `/users` and `/api/users`.          | both success (`200` for API)                                                               |
| [ ]  | C-R7 | Optional diagnostic: Update Settings in `/security-showcase`.      | controlled result, no crash                                                                |

## Scenario D - Org via DB Context

Set:

```dotenv
TENANCY_MODE=org
TENANT_CONTEXT_SOURCE=db
TENANT_CONTEXT_HEADER=x-tenant-id
TENANT_CONTEXT_COOKIE=active_tenant_id
```

### Clerk Setup (Scenario D)

| Done | Step | Command / Action                                                                 | Expected                |
| ---- | ---- | -------------------------------------------------------------------------------- | ----------------------- |
| [ ]  | D-C1 | Keep email sign-in/sign-up enabled in Clerk.                                     | authentication works    |
| [ ]  | D-C2 | Organizations are optional in this mode (resolver ignores provider org context). | no Clerk org dependency |
| [ ]  | D-C3 | Ensure test user can sign in.                                                    | authenticated session   |

### Runtime Verification (Scenario D)

| Done | Step | Command / Action                                                                                                                            | Expected                                              |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [ ]  | D-R1 | Restart `pnpm dev` after env change.                                                                                                        | app starts                                            |
| [ ]  | D-R2 | Ensure current user has membership in tenant `10000000-0000-4000-8000-000000000001` (for example by Scenario A onboarding in chained mode). | positive-path membership exists                       |
| [ ]  | D-R3 | Browser console: `document.cookie = 'active_tenant_id=; Max-Age=0; path=/';` then open `/users`.                                            | redirect `/onboarding?reason=tenant-context-required` |
| [ ]  | D-R4 | Browser console: `document.cookie = 'active_tenant_id=10000000-0000-4000-8000-000000000002; path=/';` then fetch `/api/users`.              | `403` + `TENANT_MEMBERSHIP_REQUIRED`                  |
| [ ]  | D-R5 | Browser console: `document.cookie = 'active_tenant_id=10000000-0000-4000-8000-000000000001; path=/';` then fetch `/api/users`.              | `200` success                                         |
| [ ]  | D-R6 | Optional diagnostic: Update Settings in `/security-showcase`.                                                                               | controlled result, no crash                           |

## Non-UI Security Gate Checks (Required)

These checks cover critical provisioning security paths not fully executable via Clerk-only manual runtime.

| Done | Step | Command / Action                                                                                                                          | Expected              |
| ---- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [ ]  | G-1  | `pnpm test:db -- src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.db.test.ts -t "cross-provider email linking"` | targeted suite passes |
| [ ]  | G-2  | `pnpm test:db -- src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.db.test.ts -t "free-tier limit"`              | targeted suite passes |

## Final Pass Criteria

| Done | Check                                                        | Expected |
| ---- | ------------------------------------------------------------ | -------- |
| [ ]  | Positive path works for A/B/C/D on `/users` and `/api/users` | Yes      |
| [ ]  | Missing tenant context returns controlled response           | Yes      |
| [ ]  | Non-member tenant returns controlled response                | Yes      |
| [ ]  | Non-UI security gate checks G-1/G-2 pass                     | Yes      |
| [ ]  | No unhandled runtime exceptions                              | Yes      |

## Notes

- `AUTH_PROVIDER=authjs` and `AUTH_PROVIDER=supabase` are not runtime-complete yet (identity adapters are placeholders).
- `/security-showcase` mutation check is diagnostic only in this runbook until policy mapping for that action is explicitly aligned.
- For architecture rationale see:
  - `03 - Tenancy, Organizations, Roles and Onboarding - Runtime Matrix`
  - `04 - Manual QA Checklist - Tenancy & Provisioning Runtime`
