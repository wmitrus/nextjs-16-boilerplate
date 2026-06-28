# Intake — Admin Direct Invitation

**Task ID**: `2026-04-24-admin-direct-invitation`
**Date**: 2026-04-24
**Status**: Complete
**Leantime Task ID**: `81`

## Objective

Implement the admin "direct invitation" feature: allow an authenticated admin to invite any user by email directly, bypassing the waitlist flow. Activate the `/admin/invitations` page.

## User Story

> As an admin, I want to send an invitation directly to a user's email so they can create an account — without requiring them to apply to the waitlist first.

## Acceptance Criteria

- [x] Admin can navigate to `/admin/invitations` (currently "coming-soon", must become active)
- [x] Admin sees a form: email + role selector → send invitation
- [x] Invitation email is sent to the target email with a token link
- [x] Admin sees a list of pending/accepted/expired/revoked invitations for the organization
- [x] Admin can revoke a pending invitation
- [x] Sending a duplicate invitation (same email + org, pending status) returns a clear error
- [x] Only authenticated admins can access the page and API routes
- [x] The feature works regardless of `REGISTRATION_MODE` (admin bypass is always allowed)
- [x] The invite acceptance flow (existing `/auth/invite/[token]`) works unchanged

## Completion Notes

- Canonical Leantime task: `81`.
- The feature was already implemented in code; this run added the missing route test coverage for `GET /api/admin/invitations` and `DELETE /api/admin/invitations/[id]`, then synchronized the task artifacts.

## Readiness Checklist

- [x] Existing invitation module (`src/modules/invitations/`) reviewed
- [x] Existing admin patterns (`src/app/admin/waitlist/`, `src/app/api/admin/waitlist/`) reviewed
- [x] `POST /api/auth/invite` reviewed — user-scoped, requires authenticated session
- [x] Admin hub page reviewed — "Invitations" card present, status `coming-soon`
- [x] All three specialist agents must approve before implementation proceeds

## Referenced Files

| File                                                                            | Purpose                                |
| ------------------------------------------------------------------------------- | -------------------------------------- |
| `src/modules/invitations/domain/InvitationService.ts`                           | Service interface                      |
| `src/modules/invitations/infrastructure/DefaultInvitationService.ts`            | Service implementation                 |
| `src/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository.ts` | Repository                             |
| `src/modules/invitations/ui/InviteMemberForm.tsx`                               | Existing invite form (reuse candidate) |
| `src/app/api/auth/invite/route.ts`                                              | Existing user-scoped invite route      |
| `src/app/admin/waitlist/`                                                       | Reference admin page pattern           |
| `src/app/api/admin/waitlist/[id]/route.ts`                                      | Reference admin API pattern            |
| `src/app/admin/page.tsx`                                                        | Admin hub — needs card status change   |
| `src/security/api/with-node-provisioning.ts`                                    | Auth wrapper for routes                |

## Open Questions (for Specialists)

1. Should admin invitation use a new `/api/admin/invitations` route or the existing `/api/auth/invite`?
2. What ABAC permission scopes admin direct invite vs regular member invite?
3. Does `REGISTRATION_MODE=invite-only` block or allow admin direct invite?
4. Should role list shown to admin be all org roles or filtered?
5. What `withNodeProvisioning` / admin guard pattern is correct for admin API routes?

## Out of Scope

- Bulk invitation (multiple emails at once)
- CSV import
- Invitation templates/customization
- Non-admin members sending invitations (existing flow handles this)
