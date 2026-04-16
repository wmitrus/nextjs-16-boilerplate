# 02 - Security & Auth Agent — Summary

**Task**: Clerk Production Instance Migration
**Task ID**: `2026-04-13-clerk-prod-migration`

## Review Scope

Assessed the security posture of the Clerk dev → production instance migration,
focusing on:

1. Outbound SSRF allowlist (`secure-fetch.ts`)
2. CSP header generation (`with-headers.ts`)
3. Auth flow verification requirements post-key-rotation

---

## Findings

### FINDING-01 — `clerk.accounts.dev` Unconditionally in Outbound Allowlist (Risk: Medium)

**File**: `src/security/outbound/secure-fetch.ts:31`

`clerk.accounts.dev` is in the `coreAllowed` array for **all** environments.
In production with `pk_live_` keys, no outbound calls to `clerk.accounts.dev`
are expected. Permitting it unnecessarily widens the SSRF attack surface.

**Required fix**: Apply the same conditional pattern as `with-headers.ts`:

```typescript
const isDevClerkKey =
  env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') === true ||
  env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_development_') === true;

const isPreview = env.VERCEL_ENV === 'preview';
const isDev = env.NODE_ENV === 'development';

const coreAllowed = [
  'clerk.com',
  'api.clerk.com',
  'clerk.services',
  'clerk-telemetry.com',
  ...(isDev || isPreview || isDevClerkKey ? ['clerk.accounts.dev'] : []),
  'api.github.com',
];
```

This mirrors `with-headers.ts` exactly and eliminates the domain in production
with production Clerk keys.

### FINDING-02 — CSP Dev-Domain Handling Correct (No Action)

**File**: `src/security/middleware/with-headers.ts:34–60`

CSP already adds `*.clerk.accounts.dev` conditionally:
`if (isPreview || isDev || isClerkDevKey)`. Switching to `pk_live_` keys in
production automatically removes the dev CSP domains. No code change needed.

### FINDING-03 — No Webhook Secret (Informational)

No `CLERK_WEBHOOK_SECRET` exists in `env.ts` or `.env.example`.
No webhook migration is required.

### FINDING-04 — Test Fixtures Use `pk_test` (No Action)

`src/testing/infrastructure/env.ts` sets `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test'`.
This does NOT start with `pk_test_` (no trailing underscore), so after the fix,
test environments will have `isDevClerkKey = false`. This is intentional —
tests mock all HTTP calls and never actually contact `clerk.accounts.dev`.
Existing tests are unaffected.

---

## Auth Flow Verification Matrix

After rotating Vercel env vars to production Clerk keys, the following
`AUTH_FLOW_VERIFICATION_MATRIX.md` scenarios must be re-verified manually
against the production Clerk instance:

| ID    | Scenario                         | Priority |
| ----- | -------------------------------- | -------- |
| AF-01 | New user sign-up                 | Critical |
| AF-02 | New user requiring onboarding    | Critical |
| AF-03 | New user onboarding submit       | Critical |
| AF-04 | Post-onboarding landing          | Critical |
| AF-05 | Returning onboarded user sign-in | Critical |
| AF-06 | New user SSO (if configured)     | High     |
| AF-10 | Session expiry behaviour         | High     |

Users registered in the Clerk dev instance **cannot** sign in to the production
instance. New accounts must be created in production Clerk.

---

## Clerk Dashboard Configuration Required (Manual)

When creating the production Clerk application:

1. Set **Allowed redirect URLs** to include the Vercel production domain and
   preview domains (e.g. `https://your-app.vercel.app/**`).
2. Set **Sign-in URL** and **Sign-up URL** to match `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
   and `NEXT_PUBLIC_CLERK_SIGN_UP_URL` env vars.
3. Confirm that the production Clerk application type matches the features used
   (Waitlist, Organizations if needed).

---

## Authorization Impact

No authorization changes are required. The production Clerk key rotation is
a provider configuration change. ABAC/RBAC logic in `src/modules/authorization/`
is unaffected.

---

## Constraints Passed to Implementation

| Constraint          | Value                                                        |
| ------------------- | ------------------------------------------------------------ | --- | --------- | --- | ----------------------------------------------- |
| File to change      | `src/security/outbound/secure-fetch.ts`                      |
| Pattern             | Match `with-headers.ts` conditional pattern exactly          |
| Condition           | `isDev                                                       |     | isPreview |     | isDevClerkKey`(include`pk*development*` prefix) |
| Tests to add        | Dev key allows `clerk.accounts.dev`; prod key blocks it      |
| Files to NOT change | `with-headers.ts`, `env.ts`, `testing/infrastructure/env.ts` |
| Blast radius        | Low — one file, one guard, matching existing pattern         |

---

## Status

**COMPLETE** — constraints defined, implementation ready to proceed.
