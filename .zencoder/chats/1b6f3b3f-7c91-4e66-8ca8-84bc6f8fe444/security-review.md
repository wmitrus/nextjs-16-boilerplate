# Security Review — Clerk Sign-Up & Provisioning Flow

**Agent**: Security/Auth Agent  
**Input**: incident-intake.md  
**Date**: 2026-03-13

---

## 1. Objective

Assess the authentication, authorization, tenancy, and trust-boundary correctness of the Clerk sign-up and provisioning flow. Identify security risks, misplaced trust, enforcement gaps, and sensitive-data exposure introduced or latent in the affected paths. Determine whether the incident represents a security vulnerability or a functional correctness failure, and provide a grounded remediation direction.

---

## 2. Current-State Findings

### 2.1 Identity Establishment

**File**: `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`

- Identity is established server-side by calling Clerk's `auth()` async API, which reads and verifies the session JWT from request cookies. This is correct — no client-supplied identity is trusted.
- `userId` (Clerk's external user ID) and `orgId` (Clerk org ID) are extracted from verified JWT claims.
- `email` is extracted from `sessionClaims.email` or `sessionClaims.primaryEmail`. **These claims are absent from Clerk's default v2 session token.** They must be explicitly added as custom session claims in the Clerk dashboard. If not configured, `email = undefined` → provisioning falls back to a synthetic `external+clerk-<id>@local.invalid` address. This is handled gracefully but is a silent configuration dependency.
- `emailVerified` is read from `sessionClaims.email_verified`. Also absent from default Clerk session token. If absent, cross-provider email linking is permanently blocked (even for `verified-only` policy), since `undefined !== true`.

**Assessment**: Identity source is correctly server-side and provider-SDK-contained. The Clerk session JWT is verified by the SDK before claims are read. No trust boundary violation here, but Clerk session token configuration is a hard dependency that is undocumented at the code level.

### 2.2 Internal Identity Resolution

**File**: `src/modules/auth/infrastructure/RequestScopedIdentityProvider.ts`

- In Node paths (bootstrap page, server actions), the `RequestScopedIdentityProvider` resolves `externalUserId → internalUserId` via `DrizzleInternalIdentityLookup.findInternalUserId()`.
- If no mapping exists, it throws `UserNotProvisionedError`. This is the correct sentinel for "authenticated externally but not yet provisioned internally."
- `Identity.id` returned to domain operations is always the **internal UUID** (enforced by the contract's documented invariant).
- In Edge middleware (proxy.ts), the `RequestScopedIdentityProvider` is created **without** a `lookup` option — it returns the Clerk external ID as `identity.id`. This is documented and is intentional: middleware only checks authentication presence; it does not perform domain operations with `identity.id`.

**Assessment**: Internal/external ID boundary is correctly enforced at the contract level. The edge vs. node distinction is documented. Correct.

### 2.3 Tenant Context Derivation

**Files**: `src/modules/auth/index.ts`, `src/modules/provisioning/infrastructure/OrgProviderTenantResolver.ts`, `src/modules/provisioning/infrastructure/OrgDbTenantResolver.ts`, `src/modules/provisioning/infrastructure/PersonalTenantResolver.ts`, `src/modules/provisioning/infrastructure/SingleTenantResolver.ts`

Tenant context is derived from four distinct paths depending on `TENANCY_MODE` + `TENANT_CONTEXT_SOURCE`:

| Mode           | Source                                           | Trust Level                        | Risk                                      |
| -------------- | ------------------------------------------------ | ---------------------------------- | ----------------------------------------- |
| `single`       | `env.DEFAULT_TENANT_ID` (server-side)            | Server env — trusted               | Breaks if tenant not seeded               |
| `personal`     | Internal user UUID (DB lookup)                   | DB — trusted                       | None (auto-creates)                       |
| `org+provider` | Clerk `orgId` from JWT claim                     | Provider JWT — trusted             | Absent for users without active Clerk org |
| `org+db`       | `x-tenant-id` header / `active_tenant_id` cookie | **Request-supplied — lower trust** | Mitigated by server-side membership check |

**Critical finding on `org+db`**: The `activeTenantId` is read from a cookie or header — client-influenced data. However, the provisioning service validates server-side: (a) tenant must exist in DB, (b) user must already have a membership. A user cannot access a tenant they're not a member of. This is the correct mitigation. **Trust is not fully rooted in provider claims**, but the server-side membership gate is a valid compensating control.

**MAJOR risk**: For `org+provider` mode, `orgId` is absent from newly signed-up users' Clerk sessions unless they are already members of a Clerk Organization at sign-up time. There is no path for a user to self-create a Clerk org and have it reflected in the session before the bootstrap page renders. Bootstrap unconditionally throws `TenantContextRequiredError` — user is permanently stuck.

### 2.4 Authorization Enforcement

**Files**: `src/security/middleware/with-auth.ts`, `src/security/core/node-provisioning-access.ts`, `src/security/api/with-node-provisioning.ts`

- Route access authorization happens server-side in middleware (edge) and in `withNodeProvisioning` guard (node) for API routes.
- Server actions (`completeOnboarding`) call `ensureProvisioned` and operate exclusively on server-side data. No client-submitted role, permission, or internal ID is accepted.
- `completeOnboarding` does NOT perform an explicit authorization check (e.g., "is this user allowed to complete onboarding for this identity?"). However, it derives identity from the server-side Clerk JWT, so only the authenticated user can provision themselves. The implicit authorization is sound.
- No scattered role checks found in page components or UI components.
- Authorization facade (`AuthorizationFacade`) and `withNodeProvisioning` represent the correct enforcement points for post-provisioning requests.

**MINOR risk**: `completeOnboarding` does not explicitly assert that `rawIdentity.userId` matches the currently authenticated session user (it effectively does since `identitySource.get()` is bound to the current request, but there is no explicit assertion). This is an implicit assumption, not an explicit enforcement.

### 2.5 Provisioning Write-Path

**File**: `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`

- All provisioning writes are inside a single DB transaction (`runInTransaction`).
- `onConflictDoNothing` used on all inserts — idempotent by design.
- Deterministic tenant ID generation prevents orphaned rows on concurrent inserts.
- Row-level lock (`SELECT FOR UPDATE` on `tenant_attributes`) serializes concurrent membership count checks.
- `inFlightProvisioning` module-level Map deduplicates concurrent calls within the same process. **In serverless (Vercel), this provides no guarantee across Lambda instances.** Correctness relies on DB-level idempotency, which is sound. The map is a performance optimization only — not a security mechanism.
- Cross-provider email linking policy (`disabled` / `verified-only`) is enforced at the provisioning boundary before any writes. This is the correct placement.

**INFORMATIONAL**: `buildProvisioningSingleFlightKey` includes `freeTierMaxUsers` and `crossProviderEmailLinking` in the key. This means if these env values change between deployments, in-flight provisioning from before the change will not be deduplicated with calls after. In practice this is irrelevant (deployments drain in-flight requests), but it is unnecessarily complex.

### 2.6 Duplicate Provisioning Call

**Files**: `src/app/auth/bootstrap/page.tsx`, `src/modules/auth/ui/onboarding-actions.ts`

Both files call `ensureProvisioned`. The function `resolveActiveTenantIdForProvisioning()` is **copy-pasted identically** into both files. This is a correctness and maintenance risk: if one is updated (e.g., to add a new mode), the other won't be, causing a silent divergence in how tenancy context is resolved between bootstrap and onboarding completion. The duplication is not a security vulnerability today but is a security debt that may become one.

### 2.7 Middleware Flow — Bootstrap Route Safety

**File**: `src/security/middleware/with-auth.ts`

Key finding on control flow ordering:

```
resolveIdentity()          ← called FIRST (can throw in Node middleware)
   ↓
isBootstrapRoute check     ← happens AFTER resolveIdentity
```

In the current architecture, middleware runs in Edge mode (proxy.ts) where `RequestScopedIdentityProvider` has no DB lookup and **cannot throw `UserNotProvisionedError`**. Safe today.

**LATENT RISK**: If middleware were ever switched to Node mode (with a DB-backed `IdentityProvider`), a new user hitting `/auth/bootstrap` would trigger `UserNotProvisionedError` inside `resolveIdentity()` **before** the `isBootstrapRoute` bypass check is reached. This would cause a 500 error, not a clean redirect. The bootstrap route would become inaccessible for new users.

The fix ordering in middleware should guard bootstrap routes (and potentially onboarding routes) **before** calling `resolveIdentity()`.

### 2.8 `ClerkUserRepository` — Dual-Backend Footgun

**File**: `src/modules/auth/infrastructure/ClerkUserRepository.ts`

This file implements `UserRepository` by reading/writing Clerk's `publicMetadata`. The container wires `DrizzleUserRepository` as `AUTH.USER_REPOSITORY`. `ClerkUserRepository` is not currently registered anywhere.

If `ClerkUserRepository` were ever substituted as `AUTH.USER_REPOSITORY`:

- `middleware` would read `onboardingComplete` from Clerk `publicMetadata`
- `completeOnboarding` would **write** `onboardingComplete` via `DrizzleUserRepository` (DB)
- The two would be permanently out of sync — middleware would never see `onboardingComplete: true`
- Users would be redirect-looped between `/onboarding` and protected routes forever

This is a **silent footgun** with no runtime detection. The file should either be deleted or explicitly labeled as an alternative/legacy adapter that is incompatible with the current write path.

### 2.9 Sensitive Data Handling

- **Logs**: `internalUserId`, `internalTenantId`, `membershipRole`, `provider`, `tenancyMode` are logged. None are secrets.
- **Email logging**: Email is NOT logged anywhere in the provisioning flow. The `maskEmail()` utility in `ClerkRequestIdentitySource` masks email before debug logging. Correct.
- **Error responses**: `BootstrapErrorUI` surfaces `cross_provider_linking`, `quota_exceeded`, `tenant_config`, `db_error`. These are generic enough not to reveal internal DB structure or user data. Correct.
- **`completeOnboarding` response**: Returns `{ message, redirectUrl }` or `{ error: 'string' }`. No internal IDs or sensitive data returned. `redirectUrl` goes through `sanitizeRedirectUrl`. Correct.
- **`displayName`, `locale`, `timezone`** are logged at `debug` level with `userId`. Acceptable; these are user-provided profile fields, not secrets.

No sensitive data exposure found in current logging or response paths.

### 2.10 Cache / Runtime Security

- Bootstrap page and server actions are request-time operations. No auth-sensitive data is being cached.
- `getAppContainer()` creates a fresh container per call. The `ClerkRequestIdentitySource.cached` field is instance-scoped and resets per container creation. Clerk `auth()` is called once per `getAppContainer()` invocation. Safe — no cross-request auth cache.
- `getInfrastructure()` caches the DB connection at process scope. This is the intended design. No auth data is cached here.
- No evidence of auth-sensitive responses being set with `Cache-Control: public` or similar.

---

## 3. Trust Boundary Assessment

### Boundary Map

```
[Clerk JWT (verified by SDK)]
    → ClerkRequestIdentitySource.get()        TRUSTED (provider verification)
    → RequestIdentitySourceData               EXTERNAL claims — not yet internal IDs
    → RequestScopedIdentityProvider           TRANSLATES external → internal via DB
    → Identity.id (internal UUID)             TRUSTED (DB-backed)

[Request cookie/header (org+db only)]
    → resolveActiveTenantIdForProvisioning()  LOWER TRUST (client-influenced)
    → ensureProvisioned(activeTenantId)        VALIDATED (tenant exists + membership check)
    → TenantContext.tenantId                  CONDITIONALLY TRUSTED (membership gate)

[Form data from user]
    → completeOnboarding(formData)            UNTRUSTED
    → displayName, locale, timezone           VALIDATED (string checks)
    → redirect_url                            SANITIZED (sanitizeRedirectUrl)
```

### Enforcement Points

| Operation                          | Enforcement                          | Location                           | Adequate?              |
| ---------------------------------- | ------------------------------------ | ---------------------------------- | ---------------------- |
| Authentication check               | `auth()` JWT verification            | ClerkRequestIdentitySource         | ✓ Yes                  |
| Internal user resolution           | DB lookup (provider + externalId)    | DrizzleInternalIdentityLookup      | ✓ Yes                  |
| Tenant existence check             | DB SELECT by ID                      | DrizzleProvisioningService         | ✓ Yes                  |
| Tenant membership check (`org+db`) | DB JOIN with membership table        | DrizzleProvisioningService         | ✓ Yes                  |
| Cross-provider linking             | Policy gate (disabled/verified-only) | DrizzleProvisioningService         | ✓ Yes                  |
| Free-tier user limit               | Count check with row lock            | DrizzleProvisioningService         | ✓ Yes                  |
| Onboarding completion enforcement  | DB check via UserRepository          | `with-auth.ts` (node only)         | ⚠ Edge-only bypass     |
| Route authorization                | PolicyEngine ABAC                    | `withNodeProvisioning`, middleware | ✓ Yes                  |
| Input validation (form fields)     | Type/string checks                   | completeOnboarding                 | ✓ Minimal but adequate |
| Redirect URL sanitization          | `sanitizeRedirectUrl`                | bootstrap + onboarding action      | ✓ Yes                  |

### Misplaced or Missing Checks

1. **`resolveIdentity()` before `isBootstrapRoute` check in middleware** — latent risk for Node mode (not currently exploitable).
2. **`completeOnboarding` trusts `rawIdentity.userId` implicitly** — sound by design (bound to request JWT) but not explicitly asserted.
3. **`org+db` tenant ID from cookie/header** — lower trust than provider claims; membership gate is adequate mitigation but the weaker trust signal is undocumented.

---

## 4. Docs vs Code Drift

**Security-relevant drift found**:

1. **Clerk session token claim documentation**: The code assumes `email` and `email_verified` may be present in `sessionClaims`. The Clerk dashboard configuration required to populate these claims is not documented anywhere in the codebase (no README note, no `.env.example` note, no inline code comment). The `ClerkRequestIdentitySource` warns at runtime when `email` is missing, but there is no operator-facing setup guide.

2. **`ClerkUserRepository.ts`**: This file exists but is not wired. It implies an alternative "Clerk-as-user-store" architecture. No documentation explains why it exists, whether it is deprecated, or whether it can be safely deleted. Its presence creates architectural ambiguity.

3. **Template file `docs/ai/templates/security-review-template.md`** is empty. Non-blocking for this review.

No docs directory was found with specific docs for the provisioning flow, sign-up flow, or tenancy setup guide that could be compared to code.

---

## 5. Risks

### CRITICAL

None identified. No authorization bypass, no cross-tenant data exposure, no client-trusted identity fields used for domain operations, no sensitive data in responses/logs.

### MAJOR

**RC-1** — `org+provider` users permanently stuck at bootstrap

- Clerk `orgId` is absent from new user sessions without an active Clerk Organization.
- Bootstrap calls `ensureProvisioned` which throws `TenantContextRequiredError`.
- User cannot reach `/onboarding`. There is no self-service path to create a Clerk org and retry.
- Affects: all users signing up under `TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=provider`.
- **Not a security vulnerability** — user is correctly blocked from provisioning without valid org context. But it is a complete product failure for this mode.

**RC-2** — `single` mode fails if `DEFAULT_TENANT_ID` is not seeded

- Bootstrap throws `TenantNotProvisionedError`.
- Configuration dependency has no startup validation (env validation only checks UUID format, not DB existence).
- Affects: any deployment using `TENANCY_MODE=single` without running the DB seed step.

**RC-3** — `org+db` mode has no self-service new-user path

- New users have no cookie/header; bootstrap fails with `TenantContextRequiredError`.
- By design (invitation-only model), but there is no documentation of this constraint.
- Affects: any operator who expects self-service sign-up under `org+db` mode.

### MINOR

**RC-4** — `resolveActiveTenantIdForProvisioning` duplicated between bootstrap and onboarding action

- Both `bootstrap/page.tsx` and `onboarding-actions.ts` contain identical copies.
- Any divergence will silently change which tenant context is used for provisioning.
- Security impact: a bug in one copy could cause a user to be provisioned under the wrong tenant for the onboarding completion step.

**RC-5** — Bootstrap route identity resolution ordering hazard

- `resolveIdentity()` is called before `isBootstrapRoute` check in `with-auth.ts`.
- Safe today (edge middleware, no DB lookup). Dangerous if ever switched to Node middleware.
- New users would see a 500 error instead of reaching bootstrap.

**RC-6** — `ClerkUserRepository` dual-backend footgun

- If ever registered as `AUTH.USER_REPOSITORY`, `onboardingComplete` reads from Clerk but writes to DB — permanent redirect loop for all users.
- Exists in the codebase with no deprecation notice.

**RC-7** — Clerk session claims undocumented configuration dependency

- `email` and `email_verified` missing from default Clerk session token.
- Provisioning silently falls back to synthetic email. Cross-provider linking silently blocked.
- No operator-visible documentation of required Clerk dashboard configuration.

### INFORMATIONAL

**RC-8** — `inFlightProvisioning` module-level Map is ineffective in serverless

- Only deduplicates within a single process. DB idempotency (`onConflictDoNothing`) is the real correctness guarantee. The map is harmless but misleadingly implies process-global deduplication protection.

**RC-9** — `getAppContainer()` creates a new container per call

- Not a security risk. Latent inefficiency. Each call creates new object instances (DB connection reused via `getInfrastructure`). Calling `getAppContainer()` multiple times in the same request would result in separate Clerk `auth()` calls. Currently only called once per page/action, but there is no enforcement of this.

---

## 6. Recommended Next Action

### Priority 1 (Must Fix — blocks product for affected modes)

**Fix RC-1**: For `org+provider` mode, handle the case where `orgId` is absent at sign-up time.

- **Direction**: Bootstrap page should detect "authenticated but no org context" and render a mode-specific waiting/instruction UI, not a generic `tenant_config` error. Optionally, for `personal` fallback provisioning on first login before org assignment.
- **Constraint**: Do NOT auto-create a Clerk org from bootstrap — that would require a Clerk Management API call and violates provider isolation boundaries. The tenant context must come from Clerk, not be manufactured by the app.

**Fix RC-2**: Add a startup validation for `TENANCY_MODE=single` that verifies `DEFAULT_TENANT_ID` exists in DB at boot time (not just UUID format).

- **Direction**: Add a DB probe in `getInfrastructure()` or a separate boot check called from `instrumentation.ts`.
- **Low blast radius**: Pure read-only probe, fails fast at startup not at runtime.

### Priority 2 (Should Fix — prevents security drift)

**Fix RC-4**: Extract `resolveActiveTenantIdForProvisioning()` into a single shared utility.

- **Direction**: Move to `src/modules/auth/ui/resolve-active-tenant.ts` (or similar) and import in both `bootstrap/page.tsx` and `onboarding-actions.ts`.
- **Constraint**: Must remain server-only (reads from `headers()` and `cookies()` which are Next.js server APIs). Do not expose via a public module boundary.

**Fix RC-5**: Move `isBootstrapRoute` and `isOnboardingRoute` checks in `with-auth.ts` **before** `resolveIdentity()`.

- **Direction**: These routes need no identity resolution at the middleware level — they are self-contained. Guard the path before the potentially-throwing `resolveIdentity()` call.
- **Low blast radius**: Ordering change only, no new logic.

**Fix RC-6**: Either delete `ClerkUserRepository.ts` or add an explicit `@deprecated` comment explaining it is incompatible with the current write path.

### Priority 3 (Should Document)

**Fix RC-7**: Add a comment block in `ClerkRequestIdentitySource.ts` and a note in `.env.example` documenting the required Clerk session token custom claims (`email`, `email_verified`). Add a runtime warning (already present for `email`) for `email_verified` absence.

---

## Change Safety Classification

| Change                                                            | Safety | Blast Radius                           |
| ----------------------------------------------------------------- | ------ | -------------------------------------- |
| RC-1: Bootstrap error UI for missing org context                  | SAFE   | Minimal — display logic only           |
| RC-2: Startup DB probe for DEFAULT_TENANT_ID                      | SAFE   | Minimal — read-only, boot-time         |
| RC-4: Extract `resolveActiveTenantIdForProvisioning`              | SAFE   | Low — refactor only, no logic change   |
| RC-5: Reorder bootstrap/onboarding check before `resolveIdentity` | SAFE   | Low — ordering change, no logic change |
| RC-6: Delete or deprecate `ClerkUserRepository`                   | SAFE   | Minimal — file not wired               |
| RC-7: Documentation additions                                     | SAFE   | None                                   |

**No proposed change touches the provisioning transaction, DB schema, identity contract, or Clerk SDK usage patterns. All changes are safe to implement independently.**
