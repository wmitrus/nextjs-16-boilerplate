# Final Security Check

**Agent**: Security/Auth Agent  
**Date**: 2026-03-13  
**Input**: implementation-report.md, validation-report.md  
**Scope**: Confirm trust-boundary issue is closed, no new auth/security regression introduced, residual risks named.

---

## 1. Incident Classification (Final)

**Original classification**: Functional correctness failure — not a security vulnerability  
**Final classification**: Confirmed. No security posture was weakened by the fix.

---

## 2. Affected Security Boundaries Reviewed

| Boundary                          | Changed?                           | Assessment                                                      |
| --------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| Identity establishment            | No                                 | `ClerkRequestIdentitySource` → `identitySource.get()` unchanged |
| Tenant authority source           | No                                 | All 4 modes source tenant ID from server-side only              |
| Provisioning write path           | No                                 | `DrizzleProvisioningService.ensureProvisioned()` unchanged      |
| Bootstrap auth gate               | Yes — reordered + new catch        | No weakening; see SC-1 analysis below                           |
| `org+provider` interstitial (new) | Yes — new client component         | No server-side trust violation; see SC-5 analysis below         |
| `UsersLayout` redirect target     | Yes — changed to `/auth/bootstrap` | No security impact; see RC-6 analysis below                     |
| `buildProvisioningInput()` (new)  | Yes — new server utility           | No client-supplied values accepted; see SC-4 analysis below     |

---

## 3. Security Constraint Verification

### SC-1 — Identity always established server-side

`bootstrap/page.tsx` still calls `identitySource.get()` (Clerk server-side `auth()` via DI) before any provisioning logic. The early-exit for `org+provider` no-org case fires only AFTER `rawIdentity` is established from Clerk's server-side API. No client-supplied identity is accepted.

**SAFE**

### SC-2 — Tenant authority sources by mode unchanged

`buildProvisioningInput()` reads tenant context from:

- `single`: `env.DEFAULT_TENANT_ID` (server env)
- `personal`: returns `undefined` (tenant derived from internal user ID by provisioning service)
- `org+provider`: `rawIdentity.tenantExternalId` from Clerk JWT via `identitySource.get()` — never from request params
- `org+db`: `headers()` / `cookies()` (server-side only, set by the proxy layer)

No mode reads tenant ID from form data, query params, or client-submitted values.

**SAFE**

### SC-3 — Provisioning write path server-side and transactional

`ensureProvisioned()` is called from:

1. `bootstrap/page.tsx` (RSC — Node runtime) — unchanged call site
2. `onboarding/actions.ts` (server action) — moved from module UI layer but execution context identical

Neither is callable from a client component. Both are protected by identity checks before calling.

**SAFE**

### SC-4 — No client-submitted tenant or org ID in provisioning input

`buildProvisioningInput()` does not read from `searchParams`, form fields, or request body. `tenantExternalId` comes from `rawIdentity.tenantExternalId` (Clerk JWT). `activeTenantId` comes from server-side headers/cookies for `org+db` mode.

**SAFE**

### SC-5 — `org+provider` interstitial uses Clerk SDK, not fabricated org state

`BootstrapOrgRequired` renders `<OrganizationSwitcher>` from `@clerk/nextjs`. Post-selection re-navigation goes to `/auth/bootstrap` (full page navigation — Clerk updates the JWT before re-render). The component does not call any server action, does not create org records in the app DB directly, and does not accept any org ID as input.

**SAFE**

### SC-6 — Cross-provider email linking policy unchanged

`CrossProviderLinkingNotAllowedError` catch block preserved in both `bootstrap/page.tsx` and `onboarding/actions.ts`. No change to error mapping.

**SAFE**

### SC-7 — Bootstrap error UI distinguishes failure types

`BootstrapOrgRequired` is a completely separate rendering path (`return <BootstrapOrgRequired />`) that fires before `ensureProvisioned` is called. `BootstrapErrorUI` is only rendered on post-provisioning errors (`tenant_config`, `quota_exceeded`, `cross_provider_linking`, `db_error`). The two paths do not overlap.

**SAFE**

### SC-8 — Sensitive data not in new log statements

New log call in `bootstrap/page.tsx` (bootstrap branch early-exit for no-org case) does not add any new logging. The `BootstrapOrgRequired` render has no logging. `with-auth.ts` bootstrap catch block does not log the error — it passes through silently. No tokens, emails, UUIDs, or JWT values added to logs.

**SAFE**

### SC-9 — `ClerkUserRepository` not registered

Unchanged. Not registered. No new DI wiring added.

**SAFE**

---

## 4. `with-auth.ts` Reorder — Security Analysis

The reorder moves `isBootstrapRoute` check before the main `resolveIdentity()` call. Inside the bootstrap branch, `resolveIdentity()` is still called to verify authentication:

```typescript
if (ctx.isBootstrapRoute) {
  let bootstrapUserId: string | undefined;
  try {
    const bootstrapIdentity = await resolveIdentity(options);
    bootstrapUserId = bootstrapIdentity?.id;
  } catch (err) {
    if (err instanceof UserNotProvisionedError) {
      return handler(req, ctx); // pass through — user not yet provisioned
    }
    throw err; // all other errors propagate
  }
  if (!bootstrapUserId) {
    return NextResponse.redirect(new URL('/sign-in', req.url)); // unauthenticated
  }
  return handler(req, ctx);
}
```

Key observations:

1. Unauthenticated users (no session) are still redirected to `/sign-in` — authentication gate is preserved
2. `UserNotProvisionedError` is specifically caught and passed through — this is correct behavior for new users who are authenticated with Clerk but not yet in the app DB
3. All other errors propagate — no broad exception swallowing
4. The bootstrap RSC page (`bootstrap/page.tsx`) does its own `identitySource.get()` check and handles the unauthenticated case explicitly — the middleware pass-through does not bypass RSC-level auth

**No weakening of authentication gate.** Pass-through to RSC is safe because the RSC performs its own identity check.

**SAFE**

---

## 5. Trust Boundary Assessment (Final)

| Trust Boundary                          | Pre-fix                                    | Post-fix                                  | Delta                                                    |
| --------------------------------------- | ------------------------------------------ | ----------------------------------------- | -------------------------------------------------------- |
| Clerk session → `rawIdentity`           | Server-side `auth()`                       | Unchanged                                 | None                                                     |
| `rawIdentity` → `ProvisioningInput`     | Inline, duplicated                         | Centralized in `buildProvisioningInput()` | Reduced surface (fewer code paths to audit)              |
| `org+provider` no-org path              | Hard error, no recovery                    | Interstitial + re-navigate                | No trust weakening                                       |
| `UsersLayout` `TENANT_CONTEXT_REQUIRED` | Redirect to `/onboarding` (loop)           | Redirect to `/auth/bootstrap`             | Better security — sends to the correct provisioning gate |
| `with-auth.ts` bootstrap path           | `resolveIdentity()` before bootstrap check | Bootstrap check wraps `resolveIdentity()` | Preserved; `UserNotProvisionedError` explicitly handled  |

---

## 6. Verdict

**The fix is SAFE.**

No trust boundary was weakened. No authentication gate was removed or bypassed. No client-submitted values enter the provisioning input. The new client component (`BootstrapOrgRequired`) correctly uses Clerk's client-side SDK and does not make trust-level claims. The middleware reorder is safe because the bootstrap RSC provides its own defense-in-depth identity check.

---

## 7. Residual Risks (Confirmed From Prior Reviews)

These risks are unchanged from the incident intake and constraints document:

1. **RC-2 — `DEFAULT_TENANT_ID` unseeded in `single` mode**: Operational deployment risk. Not a security vulnerability. Bootstrap renders `BootstrapErrorUI error="tenant_config"`. Requires startup validation or seed tooling.

2. **RC-3 — `org+db` mode has no self-service provisioning path**: By-design constraint. Users need admin/invitation-based provisioning. Not a security gap — it is a product gap.

3. **Pre-existing `arch:lint` failure**: Structural / governance issue. Not a security risk. Requires Architecture Guard review.

No new residual security risks were introduced.
