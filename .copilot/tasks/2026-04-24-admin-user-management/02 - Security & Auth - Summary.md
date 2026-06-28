# 02 - Security & Auth - Summary

## Task Context

- **Task ID**: `2026-04-24-admin-user-management`
- **Task Objective**: Implement `/admin/users` — admin user listing, viewing, deactivation, profile update
- **Current Run Scope**: Auth check pattern selection, ABAC action mapping, PII exposure review, data response safety
- **Status**: COMPLETED
- **Last Updated**: 2026-04-25
- **Related Control Artifacts**: `plan.md`, `intake.md`, `01 - Architecture Guard - Summary.md`

---

## Scope Handled

- **Auth surfaces reviewed**: Admin route handler auth gate, RSC page auth check
- **Authorization surfaces reviewed**: ABAC action selection for list/read/update/deactivate
- **Trust-boundary questions in scope**: User ID in URL params, pagination params, search query, update body

---

## Inputs Reviewed

- **Code paths reviewed**:
  - `src/app/api/admin/invitations/route.ts` — reference admin auth pattern
  - `src/security/api/with-node-provisioning.ts` — provisioning wrapper
  - `src/security/core/platform-admin.ts` — `isEnvBasedPlatformAdmin`
  - `src/core/contracts/resources-actions.ts` — ABAC actions
  - `src/core/contracts/user.ts` — User contract (PII fields)
  - `src/modules/user/infrastructure/drizzle/schema.ts` — `usersTable`
- **Security/auth docs reviewed**: `SECURITY_CODING_PATTERNS.md`, `AGENTS.md` auth non-negotiables
- **Earlier task artifacts reviewed**: `01 - Architecture Guard - Summary.md`

---

## Actions Performed

- **Identity flow tracing**: `withNodeProvisioning` ensures authenticated, provisioned user before any handler logic. ✅
- **Authorization enforcement review**: ABAC actions `USER_READ`, `USER_UPDATE`, `USER_DEACTIVATE` confirmed for use — more specific than `SECURITY_MANAGE_POLICIES`. ✅
- **Tenant/org context review**: Single-tenant mode; `access.tenant.tenantId` from provisioning context is authoritative. ✅
- **Sensitive-data exposure review**: Email is PII. Admin panel justification documented. Passwords/tokens never in `usersTable` response. ✅

---

## Current-State Findings

**Confirmed**:

- `USER_READ`, `USER_UPDATE`, `USER_DEACTIVATE` ABAC actions already exist in `resources-actions.ts` — purpose-built for this feature
- Invitations route uses `SECURITY_MANAGE_POLICIES` for admin check — that's appropriate for policy/security management, but user management maps better to the USER resource actions
- `withNodeProvisioning` provides `access.tenant.tenantId` and `access.subject.id` — trust source established
- `usersTable` contains only: id, email, displayName, locale, timezone, onboardingComplete, createdAt, updatedAt — no passwords, no tokens, no secrets
- `deactivatedAt` (to be added via migration) is a timestamp, not sensitive beyond the fact of deactivation

**Risks**:

- IDOR risk on `[id]/route.ts` — user ID from URL must be validated to exist in DB; 404 if not found (not 403, to avoid user enumeration distinction)
- Search query injection — search must be parameterized via Drizzle `ilike`, never string concatenation
- Pagination params — `limit`/`offset` from query string must be parsed and clamped (max 100, min 1)

**Drift**: None identified

---

## Trust Boundary Assessment

- **Where identity is established**: `withNodeProvisioning` — Clerk/AuthJS edge identity → provisioning lookup → resolved access
- **Where authorization is enforced**: Inside route handler, after `withNodeProvisioning`, using `isEnvBasedPlatformAdmin` OR ABAC `USER_READ`/`USER_DEACTIVATE`/`USER_UPDATE`
- **Where tenant context is derived**: `access.tenant.tenantId` from provisioning — authoritative, not from request body or query
- **What claims/inputs are trusted**: `access.tenant.tenantId` (trusted), `access.subject.id` (trusted); all other inputs (params, body, query) are untrusted and must be validated

---

## Sensitive Data And Exposure Notes

**Email (PII)**:

- Email IS appropriate in the admin user list — this is an admin panel, not a public API
- Email must NOT be logged in debug/trace statements (use userId instead)
- Email must NOT be exposed in client-side error messages

**Response exposure**:

- Safe to include: `id`, `email`, `displayName`, `locale`, `timezone`, `onboardingComplete`, `createdAt`, `deactivatedAt`
- Must strip: nothing to strip from `usersTable` — the schema already contains no sensitive fields
- PATCH body: only `displayName` should be updatable via admin PATCH — not `email`, not `locale`, not `timezone` (scope limit per intake)

**Logging**:

- Do NOT log `email` or `displayName` in debug/info log events — use `userId` only
- Log `event`, `userId`, `tenantId`, `action` for audit events (deactivation)

**Cache exposure**: Route handlers use `await connection()` → dynamic rendering. No caching concern.

---

## Security Decisions / Constraints

**Approved controls**:

1. **Auth gate**: `withNodeProvisioning` + `isEnvBasedPlatformAdmin(access.subject.email)` OR `authzService.can({ action: ACTIONS.USER_READ, ... })` for GET; `USER_UPDATE` for PATCH; `USER_DEACTIVATE` for deactivate action
2. **ABAC action selection**: Use `USER_READ`, `USER_UPDATE`, `USER_DEACTIVATE` (not `SECURITY_MANAGE_POLICIES` — that's for security/policy management, not user administration)
3. **Input validation**: Zod schema for PATCH body (allow only `displayName: z.string().min(1).max(100)`); Zod for pagination params; Zod for deactivate body (empty or reason string)
4. **IDOR protection**: Always look up user by `id` param + confirm row exists; return 404 (not 403) on not found
5. **Search sanitization**: Drizzle `ilike` with parameterized `%${search}%` — no string interpolation into SQL
6. **Pagination clamping**: `limit = Math.min(Number(limit) || 50, 100)`, `offset = Math.max(Number(offset) || 0, 0)`
7. **Deactivation audit**: Log `event: 'admin:user_deactivate'`, `userId`, `tenantId` at INFO level (not email)

**Rejected directions**:

- Using `SECURITY_MANAGE_POLICIES` for user management — it's semantically wrong (that action controls security policy management, not user administration)
- Exposing `deactivatedAt` in error messages or logs
- Allowing `email` to be updated via PATCH — out of scope, security risk

**Required enforcement points**:

- Authorization check must happen inside the route handler body, not just at middleware
- `access.tenant.tenantId` must be used for any DB query — never trust a tenantId from the request body

---

## Artifact Synchronization

- `plan.md`: Security & Auth step status updated
- `intake.md`: Open questions on ABAC answered (USER_DEACTIVATE, not SECURITY_MANAGE_POLICIES)
- `implementation-plan.md`: Will include security constraints section

---

## Open Questions / Blockers

None blocking. All auth and security questions resolved:

- ✅ ABAC action: `USER_READ` / `USER_UPDATE` / `USER_DEACTIVATE`
- ✅ PII in admin list: acceptable for admin panel
- ✅ `deactivatedAt` in response: yes, as a timestamp
- ✅ Updateable fields via PATCH: `displayName` only

---

## Handoff Notes

- **Next specialist**: `03 - Next.js Runtime` — RSC placement, route handler caching, `connection()` usage
- **What must not be re-decided**:
  - ABAC action selection (USER_READ/UPDATE/DEACTIVATE)
  - Email is PII but acceptable in admin list
  - Only `displayName` updatable via admin PATCH
  - Pagination must be clamped (max 100)
  - IDOR protection via DB lookup + 404

---

## Update Log

### Update Entry

- **Date**: 2026-04-25
- **Trigger**: Initial security & auth review for admin user management task
- **Summary of change**: Full review completed — ABAC actions, PII exposure, trust boundaries, input validation, deactivation audit
- **Sections refreshed**: All
