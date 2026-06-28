# Admin User Management — Intake

**Task ID**: `2026-04-24-admin-user-management`
**Source**: User request, 2026-04-24
**Leantime Task ID**: 70

---

## Objective

Build the admin user management section: browse, search, view, and act on users from the admin panel at `/admin/users`. The admin panel card is currently `coming-soon`. This is a production-grade admin feature with full auth, authorization, and data governance.

---

## Requirements (Normalized)

### Functional

1. Admin can browse all registered users (paginated)
2. Admin can search users by email or display name
3. Admin can view individual user detail (email, display name, locale, timezone, onboarding status, created date)
4. Admin can deactivate/suspend a user (soft-delete or status flag)
5. Admin can update a user's profile fields (display name only — not email, not password)
6. Token-stripped: no passwords, no auth tokens in any response

### Non-Functional

1. Requires admin authorization — env-based platform admin OR ABAC SECURITY_MANAGE_POLICIES
2. Follows existing pattern from `/api/admin/invitations/`
3. RSC page for initial data load, client component for interactivity
4. No `export const dynamic` or `export const runtime` — `cacheComponents: true` in effect
5. Uses `await connection()` before `getAppContainer()` in RSC and route handlers
6. Pagination: cursor or offset-based; admin lists can be large

---

## Scope Boundaries

| In Scope               | Out of Scope                    |
| ---------------------- | ------------------------------- |
| List all users         | Password reset from admin panel |
| Search by email/name   | Role assignment (separate task) |
| View user detail       | User impersonation              |
| Deactivate user (soft) | Hard delete                     |
| Update display name    | Email change                    |
| Admin auth gate        | Per-user ABAC beyond admin gate |

---

## Referenced Existing Code

| File                                                               | Relevance                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts` | Existing repo — needs `listAll()`, `findByEmail()`, `deactivate()` |
| `src/core/contracts/user.ts`                                       | Contract interface — may need extension                            |
| `src/modules/user/infrastructure/drizzle/schema.ts`                | `usersTable` schema                                                |
| `src/app/api/admin/invitations/route.ts`                           | Reference admin route pattern                                      |
| `src/app/admin/invitations/page.tsx`                               | Reference RSC admin page pattern                                   |
| `src/app/admin/invitations/InvitationsClient.tsx`                  | Reference client component pattern                                 |
| `src/security/api/with-node-provisioning.ts`                       | Auth wrapper                                                       |
| `src/security/core/platform-admin.ts`                              | `isEnvBasedPlatformAdmin`                                          |

---

## Readiness Checklist

- [x] Dev server: restart required after `auth.ts` fix (user to `rm -rf .next && pnpm dev`)
- [x] DB: local dev DB cleaned, only bootstrap org with valid role UUIDs
- [x] Existing `DrizzleUserRepository` reviewed — missing list/deactivate methods
- [x] Auth pattern understood from invitations reference
- [x] Leantime task opened (Step 0) — task #70
- [ ] Architecture Guard constraints known (Step 1)
- [ ] Security constraints known (Step 2)
- [ ] Runtime constraints known (Step 3)

---

## Open Questions

1. Should `features/user-management/` stubs be removed, refactored, or aligned?

## Follow-Up Resolution (2026-04-25)

- Post-implementation failure: `pnpm db:generate` attempted to duplicate migrations `0008` through `0012`.
- Confirmed cause: Drizzle metadata drift. `src/core/db/migrations/generated/meta/_journal.json` referenced migrations `0008` through `0012`, but no matching snapshot files existed after `0007_snapshot.json`.
- Confirmed non-cause: this was not caused by multiple local databases sharing one migration folder. The repository intentionally uses one migration source for PGlite, local dev Postgres, local test Postgres, and production-style Postgres.
- Repair shape accepted: add an empty reconciliation SQL file plus a latest snapshot file that reflects the real current schema, then append that entry to the journal.

## Follow-Up Resolution (2026-04-25) — AuthJS Redirect Expectations

- User requirement clarified: after sign-in, redirect to the previously requested internal URL like a professional application; only fall back to the boilerplate main authenticated entry when no prior URL exists.
- Architecture decision already established in task artifacts remains authoritative: bootstrap stays the app-owned first post-auth boundary, while this follow-up now introduces `/dashboard` as the boilerplate default authenticated landing route.
- Implementation scope for this follow-up: add a protected dashboard route, align AuthJS sign-in and sign-up defaults with `/auth/bootstrap/start?redirect_url=...`, preserve `/admin` intent through bootstrap fallback, and revalidate the route in Playwright.

## Follow-Up Resolution (2026-04-25) — E2E Runtime Isolation Rules

- Verified repository reality: `scripts/e2e/run-scenario.mjs` is the authoritative E2E entrypoint for runtime-sensitive flows because it applies the scenario env and database lifecycle before Playwright starts.
- Verified repository reality: `E2E_BACKEND_MODE=container` always maps to the isolated test DB profile `127.0.0.1:5433/app_test` via `TEST_DEFAULT_URL`.
- Verified risk: raw `playwright test` / `pnpm e2e:raw` does not perform scenario DB setup and can therefore run against the current app runtime env from `.env.local`, which explains why an E2E-created AuthJS user could appear in the dev DB while container-backed runs remained isolated.
- Follow-up scope accepted: harden the raw script to `--reporter=line`, update repo docs, and propagate the same rule into AI instruction and agent surfaces.
