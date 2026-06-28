# Constraints — Admin User Management

**Task ID**: `2026-04-24-admin-user-management`
**Consolidated**: 2026-04-25
**Sources**: Architecture Guard (01), Security & Auth (02), Next.js Runtime (03)

---

## Hard Constraints (Must Not Violate)

### Next.js 16 / cacheComponents

1. **No `export const dynamic` or `export const runtime`** in any route or RSC page segment — compile-time hard error with `cacheComponents: true`
2. **`await getServerRequestLogContext({ pathname: '/admin/users' })`** must be the first async call in `page.tsx` — satisfies dynamic rendering + provides log context
3. **`await connection()`** must be the first statement inside each route handler exported function body — before `withNodeProvisioning` invocation or `getAppContainer()` call

### Authorization

4. **Auth gate pattern**: `withNodeProvisioning` + `isEnvBasedPlatformAdmin(access.subject.email)` OR ABAC check
5. **ABAC action mapping**:
   - List/view users → `ACTIONS.USER_READ`
   - Update display name → `ACTIONS.USER_UPDATE`
   - Deactivate user → `ACTIONS.USER_DEACTIVATE`
6. **Tenant context source**: Only `access.tenant.tenantId` from provisioning — never from request body or query string
7. **Authorization must be enforced inside route handler body** — not just middleware

### Data Safety

8. **IDOR protection**: Look up user by `id` param in DB; return 404 (not 403) on not found — prevents user enumeration
9. **Pagination clamping**: `limit = Math.min(Number(limit) || 50, 100)`, `offset = Math.max(Number(offset) || 0, 0)`
10. **Search parameterization**: Use Drizzle `ilike` with parameterized value — never string interpolation
11. **PATCH scope**: Only `displayName` is updatable — not email, not locale, not timezone (intake scope limit)
12. **Response strip**: No passwords, no hashed credentials, no tokens — `usersTable` is already clean

### Logging / PII

13. **Do NOT log email or displayName** in debug/info/audit log events — log `userId` only
14. **Deactivation audit**: Log `event: 'admin:user_deactivate'`, `userId`, `tenantId`, `adminId` at INFO level (SEC-10 applies — extract error fields, never raw error objects)

### Schema

15. **Migration required**: `deactivated_at TIMESTAMP WITH TIME ZONE NULL` column on `users` table — additive, non-breaking
16. **Migration must be generated** via `pnpm db:generate` before the DB layer tests can run
17. **Manual SQL migration rule**: if a migration is introduced without a matching Drizzle snapshot file, later `pnpm db:generate` runs will diff from stale metadata. Repair by adding a latest reconciliation snapshot baseline; do not split migration history by database target.

### Module Boundaries

18. **`/api/users` probe route must NOT be changed** — documented as sample data probe
19. **Stale `features/user-management/` types must be updated** to use `core/contracts/user.User` shape — `User = {id, name, email}` is wrong

---

## Architecture Constraints

20. **Layer mapping**:
    - DB queries → `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts`
    - Domain contract → `src/core/contracts/user.ts`
    - Admin API → `src/app/api/admin/users/`
    - RSC page → `src/app/admin/users/page.tsx`
    - Client component → `src/app/admin/users/UsersClient.tsx`
21. **`UsersClient` is `'use client'`** — all table interactivity, pagination, search, action confirmation, and API calls from client component
22. **RSC page does NOT pre-fetch user list** — renders shell + `UsersClient`; client fetches from API (consistent with invitations pattern)

---

## Test Constraints

23. **Route handler unit tests are required** — `route.test.ts` for both `route.ts` and `[id]/route.ts`
24. **Test pattern**: Mirror `src/app/api/admin/invitations/route.test.ts` mock structure
25. **`vi.mock('next/server')`** must use Pattern G (AGENTS.md): `vi.importActual` without type parameter
26. **Coverage target**: New tests should bring functions and branches above 75% threshold

---

## Reference Implementation

- RSC page: `src/app/admin/invitations/page.tsx`
- Client component: `src/app/admin/invitations/InvitationsClient.tsx`
- Route handler: `src/app/api/admin/invitations/route.ts`
- Route test: `src/app/api/admin/invitations/route.test.ts`
