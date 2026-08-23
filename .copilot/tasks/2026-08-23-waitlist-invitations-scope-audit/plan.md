# Task Plan — Waitlist & Invitations Tenant-Scope Audit (SEC-41)

## Status

**✅ REMEDIATION IMPLEMENTED. AUDIT COMPLETE.** All locally-runnable quality
gates green. Eleventh case in the multi-case security-audit remediation
series; commits land on the same branch as Cases 1–10,
`claude/security-audit-multi-tenant-idor-e1y3yr`.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–10** (no
`.env.leantime`/`LEANTIME_URL` in this sandbox; see Case 1's `plan.md` for
the full diagnostic trail). Not re-diagnosed here per the no-duplication
convention.

## Execution Mode

`straight-through`, single session. The architectural decision this case
required — is the waitlist platform-global or tenant-local, and what happens
to the duplicate invitation revoke route — was **not** taken unilaterally. It
was put to the repo owner via `AskUserQuestion` before any code changed. See
"Decision Record" below.

## Decision Record (repo owner, verbatim in substance)

| #   | Question                                                    | Decision                                                                                                                                                                                  |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Waitlist: platform-global (A) or tenant-local (B)?          | **A — platform-global.** Access limited to platform admin. "Bez migracji i bez przebudowy domeny w tym security fixie. To jest minimum safe change / low blast radius."                   |
| 2   | Invitations: platform-global (A) or organization-local (B)? | **B — organization-local.** "Nie utrzymywać hybrydy."                                                                                                                                     |
| 3   | The anonymous `organizationId` on a join request            | Remove it. The destination is set by the platform at approval. The nullable column is a separate, later cleanup — "nie mieszałbym migracji semantycznej do tego incydentu" (now `PE-14`). |
| 4   | The legacy flat `DELETE /api/admin/invitations/[id]`        | "Remove … Do not preserve a second mutation path only for legacy compatibility."                                                                                                          |
| 5   | The canonical nested revoke                                 | Harden it too: "the organization scope must be part of the same UPDATE predicate, not a SELECT(id + organizationId) followed by UPDATE(id)."                                              |
| 6   | `InvitationsClient.revokeEndpointBase` default              | Remove it "so future callers cannot silently fall back to /api/admin/invitations/:id."                                                                                                    |
| 7   | Scope for a platform admin                                  | `null`, "analogicznie jak obecny, poprawiony DrizzleAdminUsersService."                                                                                                                   |
| 8   | Scope of the follow-up audit                                | All of `/api/admin/**`. "To nie jest już 'może warto'. Po znalezieniu Users + Invitations + Waitlist jest to uzasadniony audit całej klasy błędów SEC-26."                                |

## Findings

Full write-up: **SEC-41** in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
Summarised:

1. **Waitlist admin routes accepted a tenant-scoped grant for an unscoped
   query.** `SECURITY_MANAGE_POLICIES` is evaluated against the caller's
   active tenant, so every tenant owner held it, while `listPending()` and
   the approve/reject mutations span the whole platform.
2. **`POST /api/auth/waitlist` persisted a client-supplied
   `organizationId`**, unauthenticated, which the approve path then read back
   as the invitation target.
3. **`DELETE /api/admin/invitations/[id]` (flat, legacy)** revoked by global
   invitation id with no organization anywhere in the request.
4. **The canonical nested revoke checked the organization in a `SELECT` and
   then wrote without it.** `markRevoked(id)` carried `WHERE id = ?` alone.
5. **`InvitationsClient.revokeEndpointBase` defaulted to the flat path**, so
   forgetting the prop silently used the unscoped route.

### Audit of the remaining `/api/admin/**` (item 8)

All 18 admin routes checked against one question: _does the caller's
authorized scope appear in the SQL that reads or writes the row?_

| Family                                             | Verdict                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `users/**`                                         | ✅ `AdminUserScope` in the predicate (SEC-26 fix, Case 1)                               |
| `feature-flags/**`                                 | ✅ `MutationScope` + `scopePredicate(id, scope)` — the reference shape                  |
| `audit-logs`, `audit-log-settings`                 | ✅ scope derived server-side; tenant is part of the natural key                         |
| `organizations/**` (9 routes)                      | ✅ `getDetailInActiveScope` + `organizationId` in every authoritative `UPDATE`/`DELETE` |
| `invitations` (flat GET/POST)                      | ✅ scope from `access.tenant.organizationId`, never the body                            |
| `waitlist/**`, `organizations/**/invitations/[id]` | ❌ → fixed in this case                                                                 |

**No further instances.** Worth naming as reference implementations:
`DrizzleFeatureFlagAdminService.scopePredicate` and
`DrizzleAdminRolesMutationService`, where a pre-check `SELECT` exists only for
a business rule (`isSystem`) while the authoritative statement still carries
`organizationId` itself.

## Enforcement

A clean audit decays (SEC-38's lesson), so
`src/security/core/platform-admin.guard.test.ts` walks every admin route and
asserts the two structural halves that went missing:

1. the route separates the platform-admin grant from the tenant-scoped ABAC
   grant (directly or via a shared `_lib` helper);
2. the route issues no inline `insert`/`update`/`delete` — writes go through a
   module service whose signature makes the scope mandatory.

Both halves were **verified to fail against the pre-fix code**, not merely to
pass against the current code. The classifier functions have their own unit
tests, per the SEC-23 precedent that a guard which cannot fail proves nothing.

The docstring on `isEnvBasedPlatformAdmin` was also corrected — it described
`SECURITY_MANAGE_POLICIES` as granting "platform admin", on the one function
at the centre of this defect class.

## Validation

`src/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository.db.test.ts`
proves against a real Postgres-compatible DB that a cross-organization revoke
matches no row **and leaves the row untouched** (a `SELECT`-then-`UPDATE`
shape passes the first assertion and fails the second), that a second revoke
of the same invitation matches nothing, that an accepted invitation is not
revocable, and that the `null` platform-admin scope still works. Verified to
fail when the scope is removed from the predicate.

Route-level tests cover both waitlist endpoints, the anonymous join (a
supplied `organizationId` is dropped), and the nested revoke (scope forwarded,
no preceding `SELECT`, indistinguishable 404). The previous waitlist test
asserting the ABAC grant _was accepted_ is inverted rather than deleted, so
the file records that the behaviour changed deliberately.

## Quality Gates (this session)

| Gate                      | Command                 | Result                                          |
| ------------------------- | ----------------------- | ----------------------------------------------- |
| Typecheck                 | `pnpm typecheck`        | ✅ pass                                         |
| Lint (with fix)           | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing unrelated warnings |
| Unit tests                | `pnpm test`             | ✅ 230 files / 1724 tests pass                  |
| DB integration tests      | `pnpm test:db`          | ✅ 21 files / 172 tests pass                    |
| Circular dependency check | `pnpm skott:check:only` | ✅ none                                         |
| Unused dependency check   | `pnpm depcheck`         | ✅ no issues                                    |
| Env consistency           | `pnpm env:check`        | ✅ in sync                                      |

**Not run in this session**: Playwright E2E. `e2e/admin.spec.ts` already
targets the canonical nested revoke path (it matches
`/api/admin/organizations/[^/]+/invitations/[^/]+`), so removing the flat
route does not invalidate it — but that is read from the spec, not observed
from a run.

## Residual Risk / Follow-Ups

- `PE-14` — drop the now-dead nullable `waitlist_entries.organization_id` /
  `tenant_id` columns (explicitly deferred by the owner).
- `PE-15` — four route tests still use the `vi.fn().mockImplementation()`
  constructor-mock pattern that fails once the file's first test constructs
  the mock.
- The waitlist is now reachable only by an env-based platform admin. If a
  deployment has no `ADMIN_USER_EMAILS` configured, **nobody can administer
  the waitlist**. That is the correct failure direction for this decision, but
  it is a behaviour change an operator must know about.

## Lesson

The one worth carrying forward, recorded in SEC-41: **a scope that is checked
is not a scope that is enforced.** Four of the five findings here passed a
reading of the route handler — the organization was right there in a `SELECT`,
or in a prop's default, or in a column on the row. What none of them had was
the scope in the statement that actually touched the data. When auditing this
class, read the `WHERE` of the write, not the guard above it.
