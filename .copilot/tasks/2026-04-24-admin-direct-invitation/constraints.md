# Constraints — Admin Direct Invitation

Collated from Architecture Guard (01), Security & Auth (02), Next.js Runtime (03), and Validation Strategy (05).

All constraints must be satisfied before implementation is considered complete.

## Architecture Constraints

| ID  | Constraint                                                                                          |
| --- | --------------------------------------------------------------------------------------------------- |
| A-1 | New page at `src/app/admin/invitations/page.tsx`                                                    |
| A-2 | New API routes at `src/app/api/admin/invitations/route.ts` (GET, POST) and `[id]/route.ts` (DELETE) |
| A-3 | Admin hub card status changed from `coming-soon` → `active` in `src/app/admin/page.tsx`             |
| A-4 | Domain logic stays in `src/modules/invitations/` — routes are delivery layer only                   |
| A-5 | Do NOT reuse `POST /api/auth/invite` internally — separate admin route                              |
| A-6 | Role list: query all roles for the organization from `rolesTable`                                   |
| A-7 | Admin form component in `src/modules/invitations/ui/` or `src/app/admin/invitations/`               |

## Security Constraints

| ID  | Constraint                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| S-1 | Admin API routes MUST add inline admin check: `isEnvBasedPlatformAdmin(email)` OR ABAC `SECURITY_MANAGE_POLICIES`   |
| S-2 | `REGISTRATION_MODE` must NOT be checked in admin invitation routes                                                  |
| S-3 | Validate `roleId` belongs to org (`rolesTable WHERE id=roleId AND organizationId=orgId`) before creating invitation |
| S-4 | Catch `DuplicateInvitationError` → 409 response                                                                     |
| S-5 | List endpoint must NOT expose raw invitation `token` field                                                          |
| S-6 | Input validation: `email` → `z.email()`, `roleId` → `z.uuid()`                                                      |
| S-7 | Admin check uses `SECURITY_MANAGE_POLICIES` action (same as admin panel gate), NOT `USER_INVITE`                    |

## Runtime Constraints

| ID  | Constraint                                                             |
| --- | ---------------------------------------------------------------------- |
| R-1 | No `export const dynamic` or `export const runtime` anywhere           |
| R-2 | `await connection()` in all route handlers before `getAppContainer()`  |
| R-3 | RSC page: call `getServerRequestLogContext` before `getAppContainer()` |
| R-4 | `context.params` must be awaited (async in Next.js 16)                 |
| R-5 | Client component: use `router.refresh()` after successful mutation     |
| R-6 | `'use client'` directive on all interactive components                 |

## Validation Constraints

| ID  | Constraint                                                       |
| --- | ---------------------------------------------------------------- |
| V-1 | Unit tests for POST route (auth, validation, duplicate, success) |
| V-2 | `pnpm typecheck` must pass clean                                 |
| V-3 | `pnpm lint --fix` must pass clean                                |
