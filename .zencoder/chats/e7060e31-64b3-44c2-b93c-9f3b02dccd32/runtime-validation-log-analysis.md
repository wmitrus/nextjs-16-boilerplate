# Runtime Log Analysis — Postgres Path Validation

**Session**: e7060e31-64b3-44c2-b93c-9f3b02dccd32  
**Date**: 2026-03-16  
**Source**: pnpm dev server logs (290 lines, provided by user)

---

## 1. Objective

Analyze runtime dev server logs to determine whether the Postgres path is functioning correctly after the bootstrap error-handling fix, identify the exact flow that occurred, and surface any remaining concerns or anomalies.

---

## 2. Symptom Summary

**No failure in these logs.** The provided logs show a successful partial flow:

- App started with `driver: "postgres"` (confirmed at line 49)
- Infrastructure initialized without error (lines 42–61)
- User navigated to `/sign-up`, completed Clerk SSO callback
- `/users` guard evaluated correctly and issued `ONBOARDING_REQUIRED`
- `/onboarding` loaded successfully (200 OK, twice)

The logs **do not** show the onboarding form submission or any post-onboarding redirect. The capture ends at `/onboarding` load.

---

## 3. Confirmed Evidence

### 3.1 Postgres driver is active and connected

**Confirmed** (lines 42–61):

```
driver: "postgres"
event: "db:runtime:infrastructure_init_start"
event: "db:runtime:infrastructure_init_complete"
```

No connection error. Infrastructure initialized on the first request to `/users`.

### 3.2 The user already exists in the Postgres DB

**Confirmed** (lines 105–115):

```
userRecordExists: true
internalIdentityId: "7b33c578-4455-45fc-83d1-d1645624a7d3"
onboardingComplete: false
status: "ONBOARDING_REQUIRED"
```

The `DrizzleInternalIdentityLookup` successfully resolved the Clerk external user ID `user_395N3PAGGv4CJSyM3r6CbrLwPNH` to an internal UUID. This UUID (`7b33c578-...`) is **not** one of the two hardcoded seeded users (`alice: 00000000-...`, `bob: 00000000-...`), confirming this user was provisioned via `/auth/bootstrap` in a prior session, not via the seed.

### 3.3 /auth/bootstrap was NOT called in this session

**Confirmed** — no bootstrap-related log events appear in the 290-line capture. The user arrived at `/users` already provisioned, so the guard correctly skipped bootstrap and went to `ONBOARDING_REQUIRED`.

### 3.4 Users guard decision is correct

**Confirmed** (lines 95–117):

The `evaluateNodeProvisioningAccess` code returns `ONBOARDING_REQUIRED` when `user.onboardingComplete === false` — before checking tenant or membership. This explains the `null` values for `tenantRecordExists` and `membershipExists`: those checks are intentionally short-circuited when onboarding is incomplete.

```
tenantRecordExists: null   ← not checked (short-circuit at onboardingComplete)
membershipExists: null     ← not checked (short-circuit at onboardingComplete)
reason: "missing_onboarding_state"
```

This is expected behavior, not a bug.

### 3.5 Infrastructure is reused correctly

**Confirmed** (lines 119–254):

```
event: "db:runtime:infrastructure_reuse"
reuseCount: 1, 2, 3, 4...
```

The process-scoped infrastructure singleton is working correctly. DB is initialized once and reused across requests.

### 3.6 The implementation fix was exercised in a prior session (indirect confirmation)

**Confirmed indirectly.** The fact that `internalIdentityId: "7b33c578-..."` exists in Postgres means a prior bootstrap call succeeded. If the original bug ("Failed to fetch" on bootstrap) had prevented provisioning, the user would not be in the DB and this session would have seen `BOOTSTRAP_REQUIRED` instead of `ONBOARDING_REQUIRED`.

The fix is working: the prior bootstrap session completed successfully, the user was provisioned in Postgres, and this session correctly identifies the half-provisioned state.

---

## 4. Execution Path (this log session)

```
pnpm dev started (driver: postgres, NODE_ENV: development)

Browser: GET /sign-up → 200
Browser: POST /sign-up → 200 (Clerk sign-up initiated)
Clerk: GET /sign-up/SignUp_clerk_catchall_check → 200
Clerk: GET /sign-up/sso-callback (force_redirect=/users) → 200
Clerk: POST /sign-up/sso-callback → 200

Browser: GET /users
  → infrastructure init (postgres, first time)
  → Clerk identity resolved: userId=user_395N3PAGGv4CJSyM3r6CbrLwPNH
  → resolveNodeProvisioningAccess()
      → identityProvider.getCurrentIdentity()
          → DrizzleInternalIdentityLookup: finds internalId = "7b33c578-..."
      → userRepository.findById("7b33c578-...")
          → found: onboardingComplete = false
      → returns ONBOARDING_REQUIRED (short-circuits before tenant/membership check)
  → redirect: /onboarding
  → 200

Browser: GET /onboarding → 200 (compile: 112ms, render: 162ms)
Browser: GET /onboarding → 200 (compile: 12ms, render: 114ms)  ← second request

[logs end — form submission not captured]
```

---

## 5. Source-of-Truth Analysis

| State                           | Owner                                   | Status in logs                                   |
| ------------------------------- | --------------------------------------- | ------------------------------------------------ |
| External identity (Clerk)       | Clerk session token                     | ✅ Resolved correctly                            |
| Internal user identity mapping  | `auth_user_identities` table (Postgres) | ✅ Found — user was provisioned in prior session |
| User record + onboarding status | `users` table (Postgres)                | ✅ Found — `onboardingComplete: false`           |
| Tenant record                   | `tenants` table (Postgres)              | **Unknown** — check was short-circuited          |
| Membership record               | `memberships` table (Postgres)          | **Unknown** — check was short-circuited          |
| DEFAULT_TENANT_ID config        | `env.DEFAULT_TENANT_ID`                 | Not visible in logs                              |

The tenant and membership state will be exercised when the onboarding form is submitted (via `completeOnboarding` action calling `ensureProvisioned`).

---

## 6. Likely Failure Points (remaining risk)

### 6.1 Onboarding form submission: single-tenant `resolveTenant` dependency

**Likely** — requires verification.

When the user submits the onboarding form, `completeOnboarding` calls `provisioningService.ensureProvisioned()`. In single-tenant mode, `resolveTenant()` does:

```typescript
if (tenancyMode === 'single') {
  const rows = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, input.activeTenantId)) // = DEFAULT_TENANT_ID
    .limit(1);

  if (!rows[0]) {
    throw new TenantNotProvisionedError(
      `Single tenant '${input.activeTenantId}' does not exist. Ensure DEFAULT_TENANT_ID is seeded.`,
    );
  }
}
```

**This will succeed only if** the tenant with `DEFAULT_TENANT_ID` exists in the `tenants` table. Since the user was provisioned in a prior session (user record exists), this tenant must already exist — but it cannot be directly confirmed from these logs.

`TenantNotProvisionedError` is handled in `onboarding/actions.ts` (returns an error string). So a failure here would show a UI error, not a crash.

### 6.2 Two back-to-back GET /onboarding requests

**Unclear** — likely benign.

Lines 288–289 show two GET /onboarding requests in quick succession (141ms apart, second is faster due to compile cache). This is likely:

- First: actual navigation render
- Second: Next.js prefetch, browser speculative fetch, or a second browser tab

Not a sign of a redirect loop (would produce more requests). Worth monitoring in case the onboarding layout has a redirect that re-renders.

### 6.3 Clerk org claims present in single-tenant mode

**Observation, not a bug** — needs awareness.

The Clerk session has `activeOrganizationClaimPresent: true` and `tenantExternalIdPresent: true`, but the app is configured as `TENANCY_MODE=single`. These org claims are not used in single-tenant mode and are silently ignored by the provisioning input builder. No error occurs. However:

- If the developer meant to configure `TENANCY_MODE=org`, this is a misconfiguration
- If single-tenant is intentional, the Clerk org claims are harmless noise

This should be confirmed against intended configuration.

---

## 7. Hypotheses

### H1 — Prior bootstrap session succeeded on Postgres **(Confirmed indirectly)**

The user's internal record exists in Postgres with a non-seeded UUID, confirming a prior bootstrap call completed successfully. The fix applied in the Implementation step worked.

### H2 — Onboarding form submission will succeed **(Likely)**

Since the user was provisioned in a prior session (which required `ensureProvisioned` to succeed, which required the default tenant to exist), the tenant must already be in the DB. The onboarding form submission will re-call `ensureProvisioned` (idempotent) and then update the user profile and onboarding status.

### H3 — Onboarding form submission will fail with tenant error **(Low probability)**

If `DEFAULT_TENANT_ID` was changed between sessions, or if the tenant was deleted, `resolveTenant` will throw `TenantNotProvisionedError`. This would be caught in the action and surface as a form error (not a crash). This scenario is unlikely given the user was recently provisioned.

---

## 8. Missing Evidence / Uncertainty

| Gap                                       | Why it matters                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| Onboarding form submission logs           | Cannot confirm the full provisioning flow completed                          |
| Current `DEFAULT_TENANT_ID` value         | Cannot confirm it matches a tenant in the Postgres DB                        |
| Original bootstrap session logs           | Would directly confirm the fix resolved the prior "Failed to fetch"          |
| Tenant + membership existence in Postgres | Not queryable from these logs — requires DB inspection or submission attempt |

---

## 9. Recommended Next Action

**Proceed** with onboarding form submission and capture the resulting server logs. The critical log events to watch for:

- `provisioning:ensure:start` → `provisioning:ensure:success` — confirms tenant+membership exist and provisioning completes
- Any `provisioning:ensure:failure` with `stage: "tenant_upsert"` — would indicate tenant not found
- `bootstrap:redirect → redirect:/users` or `redirect:/onboarding` (depending on which page the form targets)

If the form submission succeeds, the full Postgres path is confirmed working end-to-end.

If the form submission returns a UI error about tenant config, inspect whether `DEFAULT_TENANT_ID` matches the seeded tenant IDs in `src/modules/authorization/infrastructure/drizzle/seed.ts` (`10000000-0000-4000-8000-000000000001` or `10000000-0000-4000-8000-000000000002`).
