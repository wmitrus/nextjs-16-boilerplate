# Verification Runbook - Security Showcase (Single Tenant)

## Purpose

This runbook is a practical validation script for first-time setup.

Use it after completing:

- [01 - Local Quickstart - Single Tenant](./01%20-%20Local%20Quickstart%20-%20Single%20Tenant.md)

Goal: verify that auth, tenant context, and secure action flow are wired correctly.

---

## Test Scenario

Page: `/security-showcase`

Action under test: **Update Settings** (server action)

Expected behavior:

- no unhandled server exception
- controlled action result (`success` / controlled `unauthorized` / controlled `validation_error`)

---

## A) Pre-flight checks

Run in project root:

```bash
pnpm env:check
pnpm db:migrate:dev
pnpm db:seed
pnpm dev
```

Checkpoint:

- app starts on `http://localhost:3000`
- no startup env validation errors

---

## B) Session + tenant context checks (Clerk)

For your signed-in test user, verify in Clerk:

1. User belongs to at least one organization.
2. That organization is active in current session context.

If org context is missing, secure action should return a controlled unauthorized response:

- `Tenant context required`

This is expected and indicates tenant guard works correctly.

---

## C) Manual verification steps

1. Open `/security-showcase`
2. Sign in
3. In **Secure Server Action Form**, click **Update Settings**

Observe terminal logs and UI status/error.

---

## D) Result interpretation (what it means)

### 1) Result: `success`

Meaning:

- authentication is valid
- tenant context is valid
- authorization path allowed the action

### 2) Result: `unauthorized` + `Tenant context required`

Meaning:

- user is authenticated
- tenant/org context is missing in session

Action:

- fix Clerk organization membership/active org for current session

### 3) Result: `unauthorized` + `Authentication required`

Meaning:

- no authenticated identity in current request/session

Action:

- sign in again and re-test

### 4) Result: `unauthorized` + permission denied message

Meaning:

- authenticated + tenant context available
- authorization denied by membership/roles/policy

Action:

- verify authorization data and subject mapping in DB

---

## E) Known local-dev caveat (important)

Current authorization seed uses fixed UUID users in DB fixtures.

Also note: Clerk organization roles (Admin/Member) are not used as direct app
authorization roles in this flow. They control organization membership UX in Clerk,
but app authorization decisions come from DB memberships + DB policies.

When using external auth providers (for example Clerk), identity IDs may not match those seeded UUID records automatically.

Implication:

- tenant context can be valid
- action can still be denied by policy/membership checks due to subject mismatch

For first-time setup, treat this as a data-mapping task, not an auth-runtime bug.

---

## F) What to capture when reporting setup issues

Provide these 4 artifacts in one message:

1. Current `.env.local` values (redact secrets).
2. Terminal output around `POST /security-showcase`.
3. Exact action result shown in UI (`status`, `error`).
4. Confirmation whether user has active org context in Clerk.

This is the minimum diagnostic set required for deterministic support.
