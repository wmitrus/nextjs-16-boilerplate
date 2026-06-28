# Admin Bootstrap Research — Platform Admin Access

## The Problem

In `TENANCY_MODE=single` + `AUTH_PROVIDER=authjs`, ALL users including the first one are
provisioned with the `member` role (`decideNewMembershipRole()` returns `'member'` for
the `single` case). The `owner` role, which grants `SECURITY_MANAGE_POLICIES` (the ABAC
permission the admin guard checks), is **never assigned**. No user can ever access `/admin`.

This is a **provisioning gap**, not a misconfiguration.

## Two Distinct Role Systems (Must Not Be Conflated)

| System         | Values                   | Storage                 | Used By                 |
| -------------- | ------------------------ | ----------------------- | ----------------------- |
| Security-layer | `guest \| user \| admin` | Not stored (conceptual) | Middleware floor checks |
| Tenant DB      | `owner \| member`        | `roles` table           | ABAC / PolicyEngine     |

The admin panel guard uses the **tenant DB system** via `SECURITY_MANAGE_POLICIES` permission.
The security-layer `admin` role is currently wired to nothing in production — it exists as a
contract only.

## Industry Survey: Approaches to "First Admin" / "Platform Super Admin"

### 1. DB-Seeded Bootstrap (Rails, Django, Laravel)

Pros: Explicit, auditable, works at any scale.
Cons: Requires a deploy-time seed step with DB access.
Used by: Traditional MVC frameworks.

### 2. Environment Variable Admin List (Grafana, Ghost, Gitea, Strapi, Directus)

- `GF_SECURITY_ADMIN_USER` (Grafana)
- `ghost_mail__from` + DB flag (Ghost)
- `GITEA_ADMIN_USER` / `GITEA_ADMIN_PASSWORD` (Gitea)
- `ADMIN_EMAIL` (Strapi, Directus)

Pros: Works immediately, environment-specific, auditable in CI/CD, standard Vercel workflow.
Cons: Bypasses ABAC entirely, requires secret management in the env pipeline.
Verdict: **Professional and widely used**. Not a shortcut — it is the industry standard for
bootstrap admin and emergency access.

### 3. First-User-Is-Owner (Discourse, Pocketbase, Ghost, Supabase self-hosted)

The first provisioned user automatically gets the highest role. Subsequent users get a
lower role.
Pros: Zero config, works out of the box, mirrors how self-hosted tools behave.
Cons: Race conditions (mitigated by single-flight provisioning which already exists here),
unclear semantics for multi-tenant apps (but not relevant for single-tenancy).
Verdict: **Correct for TENANCY_MODE=single**. This is actually the missing piece in the
provisioning logic — `single` tenancy should behave like `personal` for the first user.

### 4. JWT / Auth Provider Claims (Clerk org:admin, Auth0 roles, Firebase custom claims)

Admin role encoded in the token itself from the provider.
Pros: Consistent with provider UI, no extra DB steps.
Cons: Provider-specific, requires custom claim setup in each provider.
Verdict: Good for Clerk (provider controls role via organization membership).
Not applicable for AuthJS credentials provider which has no role claims.

### 5. Bootstrap Token (HashiCorp Vault, some k8s operators)

A one-time env var token that grants admin when presented. Invalidated after first use.
Pros: Very secure.
Cons: Complexity, easy to lock yourself out.
Verdict: Overkill for this use case.

### 6. Admin CLI Script (many open-source tools)

`pnpm admin:grant-owner user@example.com` — a script that upgrades a user's DB role.
Pros: Explicit, no persistent env var.
Cons: Requires DB access at deploy time.
Verdict: Good complementary tool, not sufficient alone.

## Recommended Solution: Two-Layer Approach

### Layer 1 — Fix Provisioning (correct behavior for new deployments)

In `TENANCY_MODE=single`, the user who creates the tenant (first user, `tenantCreatedNow === true`)
should get `owner`. All subsequent users get `member`. This mirrors `personal` tenancy behavior
and matches every self-hosted tool's first-user-is-admin pattern.

**Change in `DrizzleProvisioningService.ts`:**

```typescript
function decideNewMembershipRole(input, tenantCreatedNow): 'owner' | 'member' {
  if (input.tenancyMode === 'personal') return 'owner';
  if (input.tenancyMode === 'single' && tenantCreatedNow) return 'owner'; // ← ADD THIS
  if (input.tenancyMode === 'org' && ...) { ... }
  return 'member';
}
```

### Layer 2 — `ADMIN_USER_EMAILS` Env Var (emergency / Vercel bootstrap)

For existing deployments where the first user was already provisioned as `member`, or for
Vercel environments where you want explicit control.

`ADMIN_USER_EMAILS=admin@company.com,ops@company.com`

- Server-side only, never exposed to client
- Comma-separated list of email addresses
- Case-insensitive match against `access.identity.email`
- Checked **after** provisioning guard (user must still be authenticated + provisioned)
- Short-circuits the ABAC check when matched
- Should be logged (INFO) when used so it's visible in observability

**For Vercel:**

- Set in Vercel Dashboard → Settings → Environment Variables → Server
- Scope to **Production only** (not "All Environments") — prevents accidental admin in Preview
- Rotate / remove once ABAC admin role is properly assigned via DB

## Security Analysis

| Approach              | Auth Bypass?        | Audit Trail      | Env Leak Risk | Vercel-compatible |
| --------------------- | ------------------- | ---------------- | ------------- | ----------------- |
| ABAC owner role (DB)  | No                  | Full             | No            | Yes               |
| ADMIN_USER_EMAILS env | Partial (ABAC only) | LOG on use       | Medium        | Yes               |
| First-user-is-owner   | No                  | Provisioning log | No            | Yes               |
| JWT claim             | Depends on provider | Provider-managed | Low           | Yes               |

**`ADMIN_USER_EMAILS` bypasses ABAC but does NOT bypass authentication or provisioning.**
A user must still be: (1) logged in, (2) have a DB user record, (3) be provisioned.
This is a meaningful security layer — it's not a magic password.

## Comparison: Email vs User ID for the Env Var

| Attribute            | Email (`ADMIN_USER_EMAILS`)         | User ID (`ADMIN_USER_IDS`)          |
| -------------------- | ----------------------------------- | ----------------------------------- |
| Human-readable       | ✅ Easy to configure                | ❌ UUIDs are not readable           |
| Stable               | ⚠️ Email can change (account merge) | ✅ UUID is stable forever           |
| Pre-deployment known | ✅ Known before first deploy        | ❌ ID only known after first signup |
| Recommendation       | **Use for initial bootstrap**       | Use for long-term admin assignment  |

**Recommendation**: Start with `ADMIN_USER_EMAILS` for bootstrap. Once the first admin
can access the panel and assign DB `owner` role to themselves (future admin RBAC UI), the
env var can be removed. Long-term, admin access should come entirely from the DB `owner` role.

## Vercel Configuration Guide

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `ADMIN_USER_EMAILS` with value `your-admin@company.com`
3. Set **Environment: Production** (do NOT select "All Environments")
4. Click Save — next deployment will pick it up
5. For Preview environments, set a separate value if needed for staging testing

## Implementation Plan

- [x] Research complete
- [ ] Fix `decideNewMembershipRole` in `DrizzleProvisioningService` for `single` tenancy
- [ ] Add `ADMIN_USER_EMAILS` to `src/core/env.ts`
- [ ] Create `src/security/core/platform-admin.ts` utility
- [ ] Update `AdminLayoutGuard` to check platform admin before ABAC
- [ ] Update `HeaderAuthControlsAuthjs.tsx` and `UserAvatarMenu.tsx` to conditionally show Admin link
- [ ] Update `.env.example` with documentation
- [ ] Update `docs/features/32 - AuthJS Custom Auth Provider.md` with admin setup guide
