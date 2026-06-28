# Implementation Plan — Admin Direct Invitation

**Task ID**: `2026-04-24-admin-direct-invitation`
**Status**: READY TO IMPLEMENT — all constraints collated, all specialists approved

## Files To Create

- [ ] `src/app/api/admin/invitations/route.ts` — GET (list) + POST (create) routes
- [ ] `src/app/api/admin/invitations/[id]/route.ts` — DELETE (revoke) route
- [ ] `src/app/admin/invitations/page.tsx` — RSC page (list + inline send form)
- [ ] `src/app/admin/invitations/InvitationsClient.tsx` — `'use client'` form + list
- [ ] `src/app/api/admin/invitations/route.test.ts` — unit tests

## Files To Modify

- [ ] `src/app/admin/page.tsx` — change "Invitations" card status to `active`

## Implementation Sequence

### Phase 1 — API Routes

**`src/app/api/admin/invitations/route.ts`**

- `GET`: `withNodeProvisioning` → admin check → `connection()` → resolve org → `service.listByOrganization(orgId)` → return list (omit `token`)
- `POST`: `withNodeProvisioning` → admin check → `connection()` → parse body (email + roleId) → validate roleId in org → `service.createInvitation()` → catch `DuplicateInvitationError` (409) → return 201

**`src/app/api/admin/invitations/[id]/route.ts`**

- `DELETE`: `withNodeProvisioning` → admin check → `connection()` → `service.revokeInvitation(id)` → 200

Admin check helper (inline in each route):

```typescript
const userEmail = access.identity.email;
const isEnvAdmin = isEnvBasedPlatformAdmin(userEmail);
if (!isEnvAdmin) {
  const authzService = container.resolve<AuthorizationService>(
    AUTHORIZATION.SERVICE,
  );
  const hasAdminPolicy = await authzService.can({
    tenant: { tenantId: access.tenant.tenantId },
    subject: { id: access.user.id },
    resource: { type: RESOURCES.SECURITY, id: 'admin-panel' },
    action: ACTIONS.SECURITY_MANAGE_POLICIES,
  });
  if (!hasAdminPolicy) {
    return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
  }
}
```

Org resolution (TENANCY_MODE=single pattern, same as waitlist route):

- Use `DEFAULT_TENANT_ID` → query org from `organizationsTable WHERE tenantId = DEFAULT_TENANT_ID`

### Phase 2 — Page + Client Component

**`src/app/admin/invitations/page.tsx`**

- RSC: `await getServerRequestLogContext(...)` → resolve services → fetch invitations + fetch roles → pass to `InvitationsClient`
- Export `metadata`

**`src/app/admin/invitations/InvitationsClient.tsx`**

- `'use client'`
- Renders invitation list table (email, status, expiresAt, createdAt, revoke button)
- Renders send form (email input + role select + submit)
- On submit: `POST /api/admin/invitations` → `router.refresh()`
- On revoke: `DELETE /api/admin/invitations/{id}` → `router.refresh()`
- Status display: pending (yellow), accepted (green), revoked (gray), expired (red)

### Phase 3 — Admin Hub Card

**`src/app/admin/page.tsx`**

- Change `status: 'coming-soon'` → `status: 'active'` for the Invitations card

### Phase 4 — Tests

**`src/app/api/admin/invitations/route.test.ts`**

- Mock `withNodeProvisioning`, `isEnvBasedPlatformAdmin`, `authzService`
- Test cases:
  - Unauthenticated → 401
  - Authenticated non-admin → 403
  - Invalid email format → 400
  - roleId not UUID → 400
  - roleId not in org → 400
  - Duplicate pending invitation → 409
  - Success → 201 with `{ invitationId, email, expiresAt }`

## Validation Steps (post-implementation)

```bash
pnpm typecheck
pnpm lint --fix
pnpm test src/app/api/admin/invitations
```
