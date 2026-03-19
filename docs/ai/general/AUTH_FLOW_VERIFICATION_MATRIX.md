# AUTH_FLOW_VERIFICATION_MATRIX

## Read This First

Read `AUTH_FLOW_ANTI_PATTERNS.md` first.

Use this matrix as the mandatory verification checklist for any auth/bootstrap/onboarding change.

How to use this checklist in practice: [AUTH_FLOW_MATRIX_HOW_TO_USE.md](./AUTH_FLOW_MATRIX_HOW_TO_USE.md)

## Purpose

This matrix is the operational verification checklist for the auth, bootstrap, and onboarding flow.

Use it after any change touching:

- Clerk configuration
- post-auth redirect targets
- bootstrap/start/bootstrap recovery routes
- onboarding route or onboarding actions
- middleware / `with-auth.ts` / `proxy.ts`
- root layout auth/provider boundaries
- `UsersLayout` auth routing behavior
- onboarding cookie hint logic
- DB-backed provisioning logic
- auth-related environment defaults

Read `AUTH_FLOW_ANTI_PATTERNS.md` first.

---

## Verification Status Legend

- `PASS` — verified and working as expected
- `FAIL` — verified and broken
- `DEFERRED` — not checked yet
- `BLOCKED` — cannot currently verify
- `N/A` — not applicable for this change

---

## Scenario Matrix

| ID    | Scenario                                                  | Expected Result                                                                                                              | Status   | Notes |
| ----- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| AF-01 | New user sign-up                                          | User completes Clerk auth and lands in the app-owned bootstrap/start path, not directly in unstable hot-path `/users` render | DEFERRED |       |
| AF-02 | New user requiring onboarding                             | Bootstrap/provisioning completes and user is routed to `/onboarding` without route-commit hang                               | DEFERRED |       |
| AF-03 | New user onboarding submit                                | Form submission succeeds, onboarding state is updated in DB, and user is redirected to `/users`                              | DEFERRED |       |
| AF-04 | Post-onboarding landing                                   | After onboarding completion, `/users` loads successfully and stays allowed                                                   | DEFERRED |       |
| AF-05 | Returning onboarded user sign-in                          | User signs in and reaches `/users` directly without onboarding redirect                                                      | DEFERRED |       |
| AF-06 | Returning not-yet-onboarded user sign-in                  | User signs in and is routed to `/onboarding` before unstable `/users` hot-path redirect race occurs                          | DEFERRED |       |
| AF-07 | Direct visit to `/users` before onboarding completion     | User is not allowed to remain on `/users`; onboarding-required routing takes effect                                          | DEFERRED |       |
| AF-08 | Direct visit to `/users` after onboarding completion      | User remains on `/users` with `ALLOWED` decision                                                                             | DEFERRED |       |
| AF-09 | Direct visit to `/onboarding` after onboarding completion | User is redirected away from onboarding to the correct ready route                                                           | DEFERRED |       |
| AF-10 | Bootstrap recovery page access                            | `/auth/bootstrap` acts only as UI/recovery/status and is not the hot-path provisioning route                                 | DEFERRED |       |
| AF-11 | Provisioning path                                         | Provisioning creates or resolves user, tenant, and membership correctly without duplication or race side effects             | DEFERRED |       |
| AF-12 | Middleware onboarding signal read                         | Middleware correctly reads the edge-readable routing signal and uses it only as a routing hint                               | DEFERRED |       |
| AF-13 | Cookie set legality                                       | Any onboarding-pending cookie is set only in a Route Handler or Server Action, never in page/layout render                   | DEFERRED |       |
| AF-14 | Cookie clear legality                                     | Onboarding completion clears the cookie in a legal boundary                                                                  | DEFERRED |       |
| AF-15 | Cookie does not become source of truth                    | DB remains authoritative even if cookie is stale or absent                                                                   | DEFERRED |       |
| AF-16 | Users layout safety net                                   | `UsersLayout` still protects `/users` as DB-backed fallback, but is no longer the hot-path onboarding redirect orchestrator  | DEFERRED |       |
| AF-17 | Root layout stability                                     | Root layout does not reintroduce `blocking-route`, null Suspense traps, or unstable provider-shell behavior                  | DEFERRED |       |
| AF-18 | Clerk provider branch stability                           | Clerk branch remains wrapped in a valid Suspense shape under Next.js 16 + cache components                                   | DEFERRED |       |
| AF-19 | Shared client route probe                                 | Route probe confirms client route commit on affected transitions                                                             | DEFERRED |       |
| AF-20 | Onboarding client subtree mount                           | Onboarding client probe confirms mount/hydration when onboarding should render                                               | DEFERRED |       |
| AF-21 | `/users -> /onboarding` race regression                   | No client route-commit race remains on the post-auth path                                                                    | DEFERRED |       |
| AF-22 | Sign-out then sign-in again                               | Re-authenticated flow remains stable and respects completed onboarding state                                                 | DEFERRED |       |
| AF-23 | Refresh on `/users`                                       | Manual refresh does not regress into onboarding or bootstrap unexpectedly for completed users                                | DEFERRED |       |
| AF-24 | Refresh on `/onboarding`                                  | Incomplete user can refresh onboarding route without route hang or broken state                                              | DEFERRED |       |
| AF-25 | Hostile redirect_url sanitization                         | Unsafe redirect targets are sanitized server-side                                                                            | DEFERRED |       |
| AF-26 | Unauthenticated access to private route                   | User is redirected to sign-in and does not enter protected app flow                                                          | DEFERRED |       |
| AF-27 | Auth route access while already signed in                 | Signed-in user is redirected away from sign-in/sign-up routes appropriately                                                  | DEFERRED |       |
| AF-28 | Log observability                                         | Logs are sufficient to classify route decision, route commit, subtree mount, submit success, and return path                 | DEFERRED |       |

---

## Minimum Required Scenarios for Any Auth-Flow Change

At minimum, after any auth/bootstrap/onboarding change, verify:

- AF-01
- AF-02
- AF-03
- AF-04
- AF-05
- AF-06
- AF-07
- AF-08
- AF-12
- AF-13
- AF-14
- AF-16
- AF-17
- AF-18
- AF-21

If these are not checked, the auth-flow change is not considered fully verified.

---

## Suggested Manual Recording Template

For each run, record:

- Date:
- Branch / commit:
- Environment:
- DB driver:
- Clerk redirect targets:
- Scenario ID:
- Result:
- Browser notes:
- Server log notes:
- Sentry notes:
- Regression risk:

---

## Suggested Use in AI Instructions

Recommended snippet:

> For any change touching Clerk auth, bootstrap routing, onboarding redirects, auth middleware, root auth layout boundaries, or `/users` access control, read `AUTH_FLOW_ANTI_PATTERNS.md` first. Use `AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist. Do not mark the task complete until the affected matrix scenarios are explicitly checked or clearly marked as deferred/blocked.

---

## Final Rule

If the auth flow changes, this matrix must be revisited.

No exceptions.
