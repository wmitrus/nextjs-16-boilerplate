# Playwright E2E Architecture

## Purpose

This document is the repository source of truth for how Playwright E2E is structured, where new specs belong, which helper layer owns which concern, and when authenticated session reuse is allowed.

Use this document before adding a new spec, refactoring an existing spec, or changing E2E fixture strategy.

## Primary Sources Of Truth

- `scripts/e2e/run-scenario.mjs`
  - authoritative scenario runner
  - applies scenario env, DB selection, reset/migrate/seed behavior, and Playwright argument forwarding
- `e2e/runtime-profile.ts`
  - derives the active auth provider, tenancy mode, tenant-context source, seeded tenant assumptions, and related runtime switches
- `e2e/global.setup.ts`
  - prepares Clerk test env and global Clerk Playwright bootstrapping
- `e2e/clerk-auth.ts`
  - Clerk provider helpers, identity env resolution, interactive sign-in helpers, and safe captured-session helpers
- `e2e/authjs-auth.ts`
  - AuthJS provisioning, route-readiness probing, interactive sign-in helper, and safe captured-session helpers

## Command Topology

### Authoritative entrypoint

Use:

```shell
node scripts/e2e/run-scenario.mjs <scenario> [scenario-options] -- <playwright-args>
```

or a package script built on top of it.

Examples:

```shell
pnpm e2e
pnpm e2e:auth
pnpm e2e:authjs:core
pnpm e2e:auth-matrix:phase3
pnpm e2e:scenario:single
pnpm e2e:scenario:org-provider
```

### Non-authoritative entrypoint

`pnpm e2e:raw` and direct `playwright test` are for narrow ad hoc browser checks only.

Do not use raw Playwright as sign-off evidence for:

- auth/bootstrap/onboarding flows
- AuthJS admin behavior
- container-backed or seeded-data scenarios
- provisioning-runtime investigations

Reason: raw Playwright bypasses scenario DB setup and can run against the current `.env.local` app runtime.

### Server lifecycle

Each scenario-runner invocation starts from scenario-specific process env. The Next.js server must not be reused across different scenario families by default because auth provider, tenancy mode, tenant-context source, DB URL/driver, and public app URL are read at server startup.

`scripts/e2e/run-scenario.mjs` therefore defaults `PLAYWRIGHT_REUSE_EXISTING_SERVER=false`. Only override it for narrow local debugging when you have proved the already-running server was started with the same scenario env.

## Runtime Profiles And Scenario Model

The repository does not have one generic E2E runtime. The active browser scenario is shaped by `e2e/runtime-profile.ts`.

The important scenario families are:

- `single`
  - Clerk single-tenant runtime
  - default `pnpm e2e` path
- `personal`
  - Clerk personal-tenant runtime
- `org-provider`
  - Clerk org runtime where active org comes from provider context
- `org-db`
  - Clerk org runtime where active tenant is resolved from DB/cookie context
- `authjs`
  - AuthJS runtime used for session route health, dashboard entry, onboarding entry, and admin surfaces

When `E2E_BACKEND_MODE=container`, the isolated DB is always:

```text
postgres://postgres:postgres@127.0.0.1:5433/app_test
```

If a supposedly isolated run mutates the dev DB, suspect a raw Playwright entrypoint first.

## Directory-Level Architecture

The `e2e/` folder is intentionally flat. File placement is based on scenario semantics, not on nested folder ownership.

### Infrastructure and helper layer

- `e2e/global.setup.ts`
  - global Clerk Playwright setup
- `e2e/runtime-profile.ts`
  - runtime-profile inference
- `e2e/env-files.ts`
  - env file reading helpers used by E2E infrastructure
- `e2e/internal-api-key.ts`
  - internal route auth helper for E2E-only provisioning endpoints
- `e2e/clerk-auth.ts`
  - Clerk-specific identities and session helpers
- `e2e/authjs-auth.ts`
  - AuthJS-specific provisioning and sign-in helpers

### Public / unauthenticated specs

These must stay unauthenticated unless authenticated behavior is explicitly the subject under test.

- `e2e/home.spec.ts`
- `e2e/security.spec.ts`
- `e2e/feature-flags-demo.spec.ts`
- `e2e/error-boundary.spec.ts`
- `e2e/authjs-session.spec.ts`
- `e2e/authjs-verify-email.spec.ts`

### Interactive auth-flow specs

These validate login, signup, onboarding, or auth-driven redirect behavior. They must preserve fresh browser/auth flow semantics.

- `e2e/auth.spec.ts`
- `e2e/authjs-dashboard-entry.spec.ts`
- `e2e/authjs-onboarding-entry.spec.ts`

### Steady-state authenticated specs

These assert behavior after auth/bootstrap/onboarding has already settled. These are valid candidates for shared authenticated `storageState` reuse.

- `e2e/users.spec.ts`
- `e2e/admin.spec.ts`
- `e2e/admin-users.spec.ts`

### Mixed matrix spec

- `e2e/provisioning-runtime.spec.ts`

This file is the canonical example of a mixed suite:

- some scenarios must remain interactive because they validate bootstrap, onboarding, sign-out/sign-in, or redirect-chain semantics
- some scenarios are safe steady-state checks and can reuse prebuilt authenticated state

Do not force one fixture model across the entire file.

## Placement Decision Tree For New Specs

Use this sequence before creating a new E2E spec.

### 1. Is the route public, demo, or explicitly E2E-allowed without auth?

If yes:

- add a public spec in `e2e/`
- do not add Clerk/AuthJS setup
- do not add `storageState`

Examples:

- homepage or public landing behavior
- showcase/demo pages
- `/e2e-error`
- AuthJS public route-health or verify-email pages

### 2. Is the behavior under test the act of signing in, signing up, onboarding, sign-out, session re-entry, org selection, or redirect settlement?

If yes:

- keep an interactive flow spec
- start logged out or from the exact pre-settlement identity state the scenario requires
- do not replace the flow with captured `storageState`

Examples:

- post-sign-in destination
- incomplete-user onboarding settlement
- sign-out then sign-in again
- auth-driven redirect loops or bootstrap entry routing

### 3. Is the scenario only about behavior after the session is already settled?

If yes:

- prefer a steady-state authenticated spec
- reuse captured `storageState` or a worker-scoped authenticated setup
- keep per-test browser contexts fresh even when storage state is reused

Examples:

- `/users` page rendering for a completed Clerk user
- `/admin*` authenticated AuthJS page rendering
- stable refresh behavior on a protected route after onboarding is already complete

### 4. Is the new scenario part of the auth/bootstrap/onboarding matrix across runtime profiles?

If yes:

- prefer extending `e2e/provisioning-runtime.spec.ts`
- tag the case with the appropriate `@auth-matrix-phase*` coverage marker when it belongs to the formal matrix
- classify that individual case as interactive or steady-state before choosing fixtures

### 5. Does the new scenario only assert a new public/demo page contract?

If yes:

- create a small dedicated spec file rather than adding it to an authenticated suite

## Fixture Taxonomy

### Public fixture model

Use plain Playwright `page` with no auth setup.

Apply to:

- public pages
- demo/showcase routes
- E2E-only public routes
- AuthJS public route health

### Interactive auth fixture model

Use provider helper functions that perform the real sign-in or provisioning flow.

Clerk examples live in:

- `e2e/clerk-auth.ts`

AuthJS examples live in:

- `e2e/authjs-auth.ts`

Apply to:

- sign-in and sign-up flows
- onboarding entry or completion flows
- sign-out/sign-in stability checks
- org/tenant-selection flows
- redirect behavior that is caused by auth/bootstrap itself

### Steady-state authenticated fixture model

Use captured authenticated `storageState` only when the scenario begins after the auth/bootstrap/onboarding transition has already settled.

Current repository examples:

- `e2e/users.spec.ts`
  - Clerk completed-user steady-state coverage
- `e2e/admin.spec.ts`
  - AuthJS admin steady-state coverage
- `e2e/admin-users.spec.ts`
  - AuthJS admin steady-state coverage with per-test API route mocking
- safe subset inside `e2e/provisioning-runtime.spec.ts`
  - completed and incomplete single-user steady-state assertions only

### Mixed-suite rule

If one file contains both transition-sensitive and steady-state scenarios:

- split them by fixture semantics inside the file
- or split them into separate spec files if the boundary becomes clearer that way

Never downgrade a transition-sensitive test into a shared-session test just because adjacent tests already use `storageState`.

## Provider-Specific Helper Responsibilities

### Clerk helpers

`e2e/clerk-auth.ts` owns:

- identity-to-env mapping
- supported Clerk identities
- stable password fixture reconciliation for users, organizations, and organization membership roles
- generated hosted sign-up artifact cleanup
- interactive sign-in helpers
- onboarding completion for generic provisioned users
- captured-session helpers for safe steady-state reuse

Use Clerk helpers when:

- the runtime auth provider is Clerk
- the scenario needs provider org context, incomplete users, or seeded org DB members

#### Clerk fixture lifecycle contract

Before changing Clerk E2E setup, read `scripts/e2e-clerk-fixtures.md`, `e2e/clerk-auth.ts`, and `e2e/runtime-profile.ts`.

Stable fixtures and generated hosted sign-up artifacts are different lifecycles:

- Stable password users and org/provider organizations come from env configuration and must be reused across runs. `e2e/clerk-auth.ts` reconciles missing users, missing organizations, and membership roles before browser sign-in.
- Generated hosted sign-up users are disposable and must use the `e2e+clerk_test-*@example.com` pattern so cleanup can delete only test-created accounts.
- Hosted sign-up can also create empty default Clerk organizations named `My Organization` with slugs such as `my-organization-*`. Cleanup may delete only those empty default organizations and must protect configured stable slugs, including `E2E_CLERK_ORG_PROVIDER_OWNER_SLUG` and `E2E_CLERK_ORG_PROVIDER_MEMBER_SLUG`.
- The `org-provider` scenario treats stable Clerk org slugs as the provider source of truth. The owner user must be a member with `org:admin`; the member user must be a member with `org:member`.
- The `org-db` scenario treats seeded application organization IDs as app context truth. Active-context cookies must use `SEEDED_ORGANIZATION_IDS`; Clerk org membership and seeded tenant IDs are not substitutes.

Operational guardrails:

- Do not create per-test stable Clerk users or organizations.
- Keep bounded retries and clear error formatting around Clerk Backend API and testing-token calls.
- Worker-scoped authenticated storage fixtures must check runtime compatibility before creating browser/session state because test-body `test.skip()` cannot prevent worker setup from running.
- Keep `@clerk/backend` as a direct dependency whenever scripts or E2E helpers import Clerk Backend clients.

### AuthJS helpers

`e2e/authjs-auth.ts` owns:

- AuthJS test credential generation
- provisioning through `/api/internal/e2e/authjs-user`
- readiness probing for the provisioning route during Next.js dev cold start
- interactive AuthJS sign-in
- captured-session helpers for safe steady-state reuse

Use AuthJS helpers when:

- the runtime auth provider is AuthJS
- the scenario needs provisioned AuthJS users or AuthJS admin/session coverage

## Authoring Rules For New Specs

### Route semantics first

Before choosing fixtures, inspect:

- route policy
- redirect source
- layout guards
- `src/proxy.ts` when request interception or auth preprocessing matters

If you cannot prove the scenario starts after settlement, keep the interactive flow.

### Prefer existing suite families

Do not create duplicate suite families when the scenario clearly belongs to an existing file.

Typical placement:

- new public homepage or demo behavior:
  - dedicated public spec in `e2e/`
- new protected steady-state users behavior:
  - `e2e/users.spec.ts`
- new AuthJS admin steady-state page behavior:
  - `e2e/admin.spec.ts` or `e2e/admin-users.spec.ts`
- new auth/bootstrap/onboarding matrix case:
  - `e2e/provisioning-runtime.spec.ts`
- new AuthJS sign-in or onboarding routing case:
  - `e2e/authjs-dashboard-entry.spec.ts` or `e2e/authjs-onboarding-entry.spec.ts`

### Keep the browser proof narrow

Add the smallest spec or scenario that closes the risk.

Do not widen into a broad matrix run unless the changed behavior truly spans multiple runtime profiles or auth states.

### Use serial mode deliberately

When a file builds an expensive authenticated state once and reuses it safely across tests, follow the established per-file serial pattern used in steady-state authenticated suites.

This is a performance and stability choice, not a default for all E2E files.

## Auth Matrix Guidance

When a scenario belongs to the auth/bootstrap/onboarding matrix:

- use the matrix docs as the scenario source of truth
- preserve `@auth-matrix-phase*` traceability where relevant
- prefer focused `--grep` runs for the affected phase or scenario cluster

This is especially important for `e2e/provisioning-runtime.spec.ts`, which is both:

- a coverage spec
- a matrix-backed verification surface

## Evidence And Logging Model

For agent-driven or debugging runs:

- use `--reporter=line`
- prefer scenario-runner commands
- use `PLAYWRIGHT_SERVER_LOG_DIR=logs/playwright/<run-name>` when route-level server evidence matters

Repository artifact expectations:

- durable server logs belong under `logs/playwright/...`
- Playwright-managed outputs stay in `playwright-report/` and `test-results/`

## Hard Rules

- Do not treat raw `playwright test` as authoritative for scenario-backed sign-off.
- Do not add auth setup to public/demo/E2E-only routes by default.
- Do not reuse `storageState` for login, signup, onboarding, sign-out, session re-entry, tenant/org selection, or auth-driven redirect semantics.
- Do not force one fixture model across a mixed suite.
- Do not add a new spec until you can name which suite family it belongs to and why.

## Quick Checklist Before Adding A New E2E Test

1. Which runtime profile owns this scenario?
2. Is the route public, interactive-auth, steady-state authenticated, or matrix-mixed?
3. Does the scenario begin before or after auth/bootstrap/onboarding settlement?
4. Which existing suite family should own it?
5. Which helper layer owns the auth/provider setup?
6. Which scenario-runner command is the smallest valid proof?

If any of these answers is unclear, stop and inspect the route/layout/proxy behavior before writing the test.
