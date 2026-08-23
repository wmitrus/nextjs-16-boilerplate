# Possible Enhancements Backlog

A holding pen for ideas that surface during work — especially the ongoing
multi-case security-audit remediation series — that are valuable but were
judged **not required** to close the specific issue at hand, or otherwise
out of scope for the task that surfaced them.

This is **not** a task list and nothing here is authorized work. Entries sit
here until a human (the repo owner) reviews the accumulated list and decides
what actually gets picked up, rejected, or merged into real task/case scope.

## Rules For Agents

- When a task (in this series or any other) surfaces a valuable-but-deferred
  idea, add one entry here. Do **not** also write the full rationale a
  second time in that task's own `plan.md`/summary artifacts — reference the
  entry by ID (e.g. "see `PE-01` in `POSSIBLE_ENHANCEMENTS.md`") instead of
  duplicating the same information in two places.
- Never silently implement an entry from this list on your own initiative —
  it is not a stop/go decision an agent gets to make; it's an "the user
  hasn't triaged this yet" holding pen.
- When the user (or a later session) triages an entry, update its `Status`
  and add a short resolution note — keep the entry rather than deleting it,
  so the backlog also serves as a decision log.
- Assign the next sequential `PE-XX` ID; never reuse or renumber an existing
  one.

## Entry Template

```markdown
## PE-XX — Short Title

- **Source**: task/case that surfaced this (path or name)
- **Date added**: YYYY-MM-DD
- **Status**: Open / Accepted / Rejected / Implemented (default: Open)

**Description**: what the enhancement is.

**Why deferred**: why it wasn't done as part of the task that surfaced it.
```

---

## PE-01 — Real-Browser (Playwright) Cross-Tenant Proof for Admin Users IDOR Fix

- **Source**: `.copilot/tasks/2026-08-22-admin-users-cross-tenant-idor/` (Case 1 of the security-audit series — cross-tenant IDOR/BOLA in `/api/admin/users`)
- **Date added**: 2026-08-22
- **Status**: Open

**Description**: Add a dedicated Playwright E2E spec that authenticates two
real sessions in two different `org-db` tenants (mirroring the
`acme`/`globex` DB-test fixtures) and proves, in a real browser against the
real backend, that a tenant-A admin cannot list/read/rename/deactivate a
tenant-B user via the UI or a direct API call from an authenticated session.
Would require new `org-db`-scenario AuthJS/Clerk fixture wiring for a second
stable tenant (see `docs/usage/05 - Playwright E2E Architecture.md` and the
Clerk E2E fixture contract in `AGENTS.md`).

**Why deferred**: The vulnerability lives entirely in the SQL predicate
layer; unit (route-handler) tests plus a real-DB integration test
(`DrizzleAdminUsersService.db.test.ts`, PGlite, real seeded two-tenant
fixtures) already prove the fix at the layer where the bug actually lived,
matching this repo's own established validation depth for the same defect
class (the original SEC-26 fix for feature flags used the same two-layer
proof, no dedicated cross-tenant E2E either). A real-browser two-session
spec is real additional confidence, but is a materially larger investment
(new stable fixture wiring) than this specific fix required — a reasonable
candidate for later hardening once several such ideas accumulate, not a
blocker for closing the reported vulnerability now.

## PE-02 — IdP-Side Session Revocation On User Deactivation (Clerk + AuthJS)

- **Source**: `.copilot/tasks/2026-08-22-deactivated-user-access-lifecycle/` (Case 2 of the security-audit series — `deactivatedAt` not enforced by the central access evaluator(s))
- **Date added**: 2026-08-22
- **Status**: Open

**Description**: When an admin deactivates a user, additionally call the
identity provider's own session-revocation API — Clerk's backend API
(`clerkClient.sessions.*`, requires resolving the internal user id to the
external Clerk user id first) and/or an equivalent mechanism for AuthJS —
so the provider-side session is killed immediately, not just made
functionally useless by this app's own checks. Record a
`user.deactivate.session_revocation` audit event with `outcome:
'success' | 'failure'` per provider attempted.

**Why deferred**: The actual access-control gap (a deactivated user
retaining access) is fully closed without this — both central access
evaluators (`evaluateNodeProvisioningAccess`, `createSecurityContext`) now
re-check `deactivatedAt` from the database on every request, which already
makes a still-valid session/JWT functionally useless the instant the check
runs. This repo's AuthJS integration uses the JWT strategy with no database
session adapter, so there is no server-side AuthJS session to revoke in the
first place — the per-request DB check _is_ the revocation mechanism there.
IdP-side revocation would still be valuable defense-in-depth (e.g. a
provider-hosted account widget would stop showing "signed in"), but is a
materially larger feature: resolving the external Clerk user id from the
internal id, calling Clerk's admin API with proper partial-failure
handling, and a dedicated audit trail for the revocation attempt itself —
not required to close the reported vulnerability.

## PE-03 — Edge-Level Proxy Gate (`with-auth.ts`) Fail-Fast For Deactivated Users

- **Source**: `.copilot/tasks/2026-08-22-deactivated-user-access-lifecycle/` (Case 2 of the security-audit series)
- **Date added**: 2026-08-22
- **Status**: Open

**Description**: `src/security/middleware/with-auth.ts` (run from
`src/proxy.ts`) is a third, edge-level gate that resolves identity and an
onboarding-complete signal before every protected route, independently of
the two node-level evaluators. It could also short-circuit a deactivated
user earlier (redirect/403 at the edge) instead of letting the request
reach the actual route/page before being denied there.

**Why deferred**: Not a security gap -- in Edge runtime this gate has no
database access for most of its checks (`onboardingComplete` there falls
back to a cookie heuristic), and by this repo's own architecture doctrine
this proxy layer is never the authoritative decision for sensitive access;
every real destination (API route via `withNodeProvisioning`, RSC layout,
Server Action via `createSecureAction`) always re-verifies through one of
the two node-level evaluators fixed in Case 2, and one of those two always
runs before any protected content is served or mutation performed. Adding
this would only save one redundant hop for a deactivated user's first
post-deactivation request -- a UX/latency polish, not a fix.

## PE-04 — Real-Browser Proof That Deactivation Kills An Active Session Immediately

- **Source**: `.copilot/tasks/2026-08-22-deactivated-user-access-lifecycle/` (Case 2 of the security-audit series)
- **Date added**: 2026-08-22
- **Status**: Open

**Description**: Add a Playwright E2E spec: sign in as a normal user and
capture the authenticated session/cookie, have an admin (second session)
deactivate that user, then reuse the first session's cookie against a
protected page, an API route, and a Server Action -- all three must deny
access. This is the exact scenario named in the reporting audit as the
most important E2E proof for this finding.

**Why deferred**: Same reasoning as PE-01 -- the fix lives entirely in two
pure evaluator functions, both now covered by direct unit tests proving the
deny decision (including the ordering guarantee against onboarding
incomplete), plus one consumer-layer unit test each (API route wrapper, one
RSC layout, the Server Action wrapper) proving the existing generic deny
path fires. A real-browser two-session proof adds genuine additional
confidence but requires session-capture/reuse fixture wiring beyond this
fix's minimum required validation; a good candidate to implement once
several PE-tracked E2E ideas from this audit series are triaged together
(see also PE-01).

## PE-05 — Verify The Real-Browser CAPTCHA E2E Spec Once Fixtures Are Available

- **Source**: `.copilot/tasks/2026-08-22-authjs-login-abuse-control/` (Case 3
  of the security-audit series), follow-up after the user provisioned a real
  Cloudflare Turnstile account
- **Date added**: 2026-08-22
- **Status**: Partially superseded -- a real-browser run against live
  Cloudflare was performed manually by the repo owner on a Vercel Preview
  deployment and found three genuine implementation defects that every unit
  test had passed (widget remount loop, single-use token replay, discarded
  error codes). All three are now fixed with regression coverage. What
  remains open here is only the _automated_ Playwright run.

**Description**: `e2e/authjs-login-abuse-control.spec.ts` (wired via
`pnpm e2e:authjs:login-abuse`) drives two wrong-password attempts against a
freshly provisioned AuthJS user, asserts the Turnstile widget appears once
`LOGIN_ABUSE_CAPTCHA_THRESHOLD` is hit, waits for Cloudflare's official
"always passes" test key (`1x00000000000000000000AA` /
`1x0000000000000000000000000000000AA`, see
https://developers.cloudflare.com/turnstile/troubleshooting/testing/) to
auto-solve, then completes sign-in with the resulting token. It needs a real
run against a live Cloudflare endpoint to be considered verified.

**Why deferred**: this agent session could not execute it to completion in
its own sandbox, for two independent reasons, neither of which is expected
to apply to the user's own machine or CI:

1. `scripts/check-e2e-auth-env.mjs` unconditionally requires real Clerk
   fixture credentials (`CLERK_SECRET_KEY`,
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, provisioned-user fixtures) for every
   scenario regardless of `AUTH_PROVIDER` -- this sandbox has none
   configured, so no E2E scenario (not just this one) can run here at all.
   This is a pre-existing repo/environment gap, not something introduced by
   this case.
2. `challenges.cloudflare.com` (both the Turnstile script and the
   `siteverify` endpoint) is blocked by this sandbox's outbound egress
   policy (confirmed via the proxy's status endpoint: a 403 policy denial on
   CONNECT), so even with (1) resolved, the real script-load/verify round
   trip cannot be observed from inside this session.

The spec itself was written, typechecked, and lint-clean, and its
supporting unit-level override (`E2E_LOGIN_ABUSE_CONTROL_ENABLED`, see
SEC-34) is covered by a passing unit test. What remains is simply _running_
it somewhere with real Clerk fixtures and open network access to Cloudflare
-- the user's own CI or local dev machine.

## PE-06 — Run The Password-Reset Concurrency Proof Against Real Postgres

- **Source**: `.copilot/tasks/2026-08-22-password-reset-token-race/` (Case 4)
- **Date added**: 2026-08-22
- **Status**: Open

**Description**: `src/app/api/auth/reset-password/route.db.test.ts` proves
the single-use guarantee by firing 10 concurrent claims at one token and
asserting exactly one wins. It runs on PGlite, which serialises operations,
so it proves the SQL guard rejects the second claim but never exercises two
genuinely simultaneous transactions. Run the same spec under
`E2E_BACKEND_MODE=container` (real Postgres, multiple connections) for a
stronger proof.

**Why deferred**: the property relied upon -- a single
`UPDATE ... WHERE ... RETURNING` matching at most one row -- is standard
Postgres behaviour under `READ COMMITTED` and above, and this repository's
DB suite already runs against real Postgres in container mode, so the
statement is exercised there. Docker is unavailable in the agent sandbox, so
this specific stronger run could not be performed at fix time.

## PE-07 — Invalidate A User's Other Outstanding Reset Tokens On Successful Reset

- **Source**: `.copilot/tasks/2026-08-22-password-reset-token-race/` (Case 4)
- **Date added**: 2026-08-22
- **Status**: Open

**Description**: After a password reset succeeds, mark every other unused
password-reset token for that user as used, so an older link that is still
within its expiry window cannot be redeemed afterwards. OWASP's
Forgot-Password cheat sheet recommends it.

**Why deferred**: it is a behaviour change beyond the race this case
closes, and it has a real UX edge (a user who requests two links in quick
succession and then clicks the older one gets a rejection that reads as a
bug). Worth doing deliberately, with the messaging thought through, rather
than bundled into a concurrency fix.

## PE-08 — User-Facing "Sign Out Everywhere" Control

- **Source**: `.copilot/tasks/2026-08-22-session-revocation-on-password-reset/` (Case 5)
- **Date added**: 2026-08-22
- **Status**: Open

**Description**: Expose a button in account settings that raises
`users.sessions_valid_from` to NOW(), invalidating every session the user
holds except the one performing the action. SEC-36 built the whole
mechanism; this is a route handler, a button, and the messaging around it.
OWASP recommends offering it alongside automatic revocation on password
reset.

**Why deferred**: it is a product feature with real UX questions (does the
current session survive? what does the confirmation say? is there an
audit-log entry the user can see?), not part of closing the reported
vulnerability. Worth doing deliberately rather than bundled in.

## PE-09 — Extend The SEC-23 Guard To Dynamic Page Routes

- **Source**: `.copilot/tasks/2026-08-22-sec23-route-param-regression/` (Case 6)
- **Date added**: 2026-08-22
- **Status**: Open

**Description**: `uuid-route-param.guard.test.ts` walks `src/app/api/**` and
fails on any dynamic segment whose raw value reaches a handler unvalidated.
Dynamic **page** routes (`src/app/**` outside `api`, e.g. a future
`/admin/organizations/[organizationId]/page.tsx` that queries by that id)
are not covered by the same sweep.

**Why deferred**: no current page route binds a UUID param to a DB predicate,
so there is nothing to fix today -- this is about the guard's blast radius,
not a live gap. Extending it means handling `page.tsx`/`layout.tsx` and their
different params shape, which is worth doing deliberately rather than
widening the glob and hoping the classifier still fits.

## PE-10 — Surface The Correlation Id In The Server-Action Error UI

- **Source**: `.copilot/tasks/2026-08-22-secure-action-error-exposure/` (Case 7)
- **Date added**: 2026-08-22
- **Status**: Open

**Description**: `createSecureAction` now returns a `correlationId` alongside
the generic production error message, and logs the full failure under that
id. No UI reads it yet. Showing it in the error state (copyable) would make
a user's report actionable in one step instead of a log hunt by timestamp.

**Why deferred**: it is a UI/UX change with its own questions (where it goes,
how it reads to a non-technical user, whether it belongs in a toast or an
error panel), and the security fix is complete without it.

## PE-11 — Converge The API Wrapper And Server Actions On One Exposure Mechanism

- **Source**: `.copilot/tasks/2026-08-22-secure-action-error-exposure/` (Case 7)
- **Date added**: 2026-08-22
- **Status**: Open

**Description**: `with-error-handler.ts` handles API-route error exposure
correctly but independently: it reads `process.env.NODE_ENV` directly
(which this repository forbids outside the T3-Env schema) and does not know
about `PublicError`, so an action and a route handler throwing the same
error produce different client output. Move it onto `env.NODE_ENV` and
`isPublicError`.

**Why deferred**: it is a refactor of a currently-correct path. Case 7 fixed
the boundary that was actually leaking; changing the one that was not, in the
same commit, would have mixed a fix with a cleanup and widened the blast
radius for no security gain.

## PE-12 — Decide Whether 4xx Should Stop Being `status: 'server_error'`

- **Source**: `.copilot/tasks/2026-08-22-api-response-discipline/` (Case 8)
- **Date added**: 2026-08-22
- **Status**: Open — needs an owner decision, deliberately not taken during Case 8

**Description**: The response envelope has one error status, `server_error`,
used for every non-2xx: 401, 403, 404, 409, 410, 429 and 500 all return
`status: 'server_error'`. For a boilerplate meant as a reference that reads
loosely — those are client errors.

**Why deferred**: it was considered during Case 8 and rejected on cost, not
overlooked. `status === 'server_error'` is read by 5 admin client components
and 10 test files, and introducing a second error status forces every future
client to branch twice. The client/server distinction is already carried by
the HTTP status code, so the gain is naming. Options if picked up: (a) leave
it; (b) add `client_error` and migrate all readers; (c) rename the single
channel to a neutral `error` — a breaking envelope change best done once,
alongside any other envelope revision.

## PE-13 — Guard That Outbound Calls Go Through `secureFetch`

- **Source**: `.copilot/tasks/2026-08-22-secure-fetch-https-only/` (Case 9)
- **Date added**: 2026-08-22
- **Status**: Open

**Description**: SEC-39's HTTPS-only gate, the host allowlist, DNS pinning
and address classification all live inside `secureFetch`. A module that calls
global `fetch` directly gets none of them. A guard test in the spirit of
SEC-23's and SEC-38's — walking `src/` and failing on bare `fetch(` outside
an allowlist of legitimate call sites (the secure-fetch implementation
itself, client components, test harnesses) — would make that boundary
enforced rather than assumed.

**Why deferred**: it widens no existing gap (a direct `fetch` already
bypassed every other control), and getting the exemption list right needs a
careful pass over client-side and third-party-SDK call sites, which is a
separate piece of work from closing the transport hole.

## PE-14 — Drop The Nullable `waitlist_entries.organization_id` / `tenant_id`

- **Source**: `.copilot/tasks/2026-08-23-waitlist-invitations-scope-audit/` (Case 11)
- **Date added**: 2026-08-23
- **Status**: Open

**Description**: SEC-41 removed `organizationId` from the anonymous join
input and stopped the approve path from reading it, so nothing writes or
trusts `waitlist_entries.organization_id` any more. `tenant_id` was never
written at all. Both columns are now dead weight that still invite a future
reader to treat them as scope. Dropping them (plus the corresponding fields
on the repository row type) would close the door structurally.

**Why deferred**: the repo owner's explicit call while scoping Case 11 —
_"nullable tenantId/organizationId w tabeli można osobno posprzątać po
zamknięciu luki — nie mieszałbym migracji semantycznej do tego incydentu"_.
A schema migration has a different blast radius and rollback story than a
security fix, and the hole is closed without it.

## PE-15 — Replace `vi.fn().mockImplementation()` Constructor Mocks In Route Tests

- **Source**: `.copilot/tasks/2026-08-23-waitlist-invitations-scope-audit/` (Case 11)
- **Date added**: 2026-08-23
- **Status**: Open

**Description**: Several route tests stub a Drizzle repository as
`SomeRepository: vi.fn().mockImplementation(() => ({}))` inside a `vi.mock`
factory. The factory is evaluated on first import — which happens _inside_ a
test, i.e. after `beforeEach`'s `vi.resetAllMocks()` has already run — so the
implementation is cleared before it is ever used, and `new SomeRepository()`
throws `"() => ({}) is not a constructor"`. It only passes today because the
first test in each of those files short-circuits (403) before constructing
anything. This bit Case 11 while adding a new test and cost a debugging
round. Four files still carry the pattern:
`src/app/api/admin/waitlist/[id]/route.test.ts`,
`src/app/api/admin/organizations/[organizationId]/invitations/[id]/route.test.ts`,
`src/app/api/admin/organizations/[organizationId]/invitations/route.test.ts`,
`src/app/api/admin/invitations/route.test.ts`. Replacing each with a plain
`class {}` (as the two new waitlist tests now do) removes the trap.

**Why deferred**: all four files pass today, and rewriting mocks in passing
tests is churn that does not belong in a security fix's diff. Worth doing as
a standalone test-hygiene pass.

## PE-16 — Strict Rate Limiting For The Edge Middleware

- **Source**: `.copilot/tasks/2026-08-23-strict-rate-limit-mode/` (Case 12)
- **Date added**: 2026-08-23
- **Status**: Open — explicitly deferred by the repo owner ("edge dodaj do
  kolejnego planu do analizy na później")

**Description**: SEC-42 gave the Node-side security-critical endpoints a
durable secondary and a fail-closed path. `withRateLimit` in `src/proxy.ts`
still runs the generic per-IP window in standard mode, so an Upstash outage
degrades it to a per-instance `Map` for every API route.

**Why deferred**: the repo's Postgres driver is `postgres` (postgres.js),
which is TCP-based and not Edge-compatible, and there is no
`@neondatabase/serverless`. Raising the Edge path therefore means a new
dependency plus a database round trip on _every_ API request, not just during
an outage — a much larger blast radius than the security fix that surfaced it.
Worth analysing on its own terms: options include an Edge-compatible HTTP
driver, moving the generic limit into the route handlers, or accepting that a
generic per-IP window is not a security-critical control.

## PE-17 — Global Purge For `rate_limit_counters`

- **Source**: `.copilot/tasks/2026-08-23-strict-rate-limit-mode/` (Case 12)
- **Date added**: 2026-08-23
- **Status**: Open

**Description**: `DrizzleRateLimitStore.purgeExpired()` is identifier-scoped
and called opportunistically after each increment, which bounds growth for
identifiers that keep returning. Rows for an identifier never seen again after
an outage stay until something removes them.

**Why deferred**: the table is written only while the primary rate-limit store
is unreachable, so it is normally empty and does not justify a scheduled job
yet. If outages become common enough for the table to matter, the existing
`scripts/audit-log/purge-expired.ts` is the pattern to copy.

## PE-18 — Durable Backing For The Login Account Bucket

- **Source**: `.copilot/tasks/2026-08-23-strict-rate-limit-mode/` (Case 12)
- **Date added**: 2026-08-23
- **Status**: Open

**Description**: SEC-42 made the login **IP** bucket strict. The **account**
bucket — `login-abuse-control.ts`'s progressive CAPTCHA/delay/lock counter
from SEC-34 — still degrades to a process-local `Map` on any Redis failure,
with the consequences documented in that module's own
`DEGRADED_FALLBACK_NOTE`.

**Why deferred**: it is not a fixed window but a rolling counter with a TTL
that is refreshed on every failure, so `DurableRateLimitStore` does not fit it
as-is; it needs its own durable shape (a count plus an expiry the store can
extend). That is a design piece rather than a call-site swap, and the strict
IP bucket now sits in front of it. Doing it badly — for instance failing
closed on the account bucket — would lock real users out of their own
accounts during a Redis outage, which is a materially worse trade than on the
IP bucket.

## PE-19 — Verify The Vercel Header Precedence Against Vercel's Own Guarantees

- **Source**: `.copilot/tasks/2026-08-23-client-ip-trust-model/` (Case 13)
- **Date added**: 2026-08-23
- **Status**: Open

**Description**: The `vercel` resolver (SEC-43) reads
`x-vercel-forwarded-for`, then `x-real-ip`. Both are set by Vercel's edge and
neither is client-supplied, so the order is not a security question — but it
_is_ a judgement made from general knowledge rather than checked against
Vercel's documented guarantees in that session. Worth confirming which header
Vercel documents as authoritative, whether both are always present, and
whether either can carry more than one address.

**Why deferred**: verifying it needs Vercel's live documentation, and the
current order is safe under either answer — both headers come from the
platform. A wrong _order_ here would at worst pick a different Vercel-set
value, not an attacker-set one.

## PE-20 — Anchor `trusted-proxy` At The Socket Peer

- **Source**: `.copilot/tasks/2026-08-23-client-ip-trust-model/` (Case 13)
- **Date added**: 2026-08-23
- **Status**: Open

**Description**: SEC-43's `trusted-proxy` mode walks `X-Forwarded-For` right
to left against `TRUSTED_PROXY_CIDRS`, which is the correct algorithm — but it
cannot verify that the request actually arrived through one of those proxies.
Express anchors the same walk at `remoteAddress`; **Next.js does not expose
the socket peer** (`NextRequest` has no `ip`, and `request.ip` was removed in
Next 15), so the chain is anchored by the operator's network topology instead.
The mode is therefore sound only where the app is unreachable except through
the declared proxy.

**Why deferred**: nothing in the current Next.js API makes the peer reachable.
Closing this properly would mean either a custom server (giving up
`next start`), an ingress that stamps a signed header the app can verify, or a
future Next.js API. Each is a deployment-shape decision, not a code fix. The
limitation is documented in the resolver, `.env.example` and SEC-43 so that an
operator choosing this mode can see it.

## PE-21 — Signed Internal Requests (HMAC + Replay Window), And Service Identity

- **Source**: `.copilot/tasks/2026-08-23-internal-api-key-hardening/` (Case 14)
- **Date added**: 2026-08-23
- **Status**: Open — **deferred with an explicit trigger**, not rejected

**Description**: SEC-44 hardened the shared-key model (dedicated failed-auth
counter, constant-time verification, current+previous rotation, entropy
floor) but kept the model itself. The stronger tiers proposed and declined:

1. **Request signing** — `HMAC(timestamp, method, path, SHA256(body), nonce)`
   with a replay window. Binds a credential to one request instead of letting
   a captured header be replayed against any endpoint.
2. **Service identity / mTLS** — removes the shared secret entirely.

**Why deferred**: the repository has three internal routes — `health`,
`env-check`, and an E2E-only user factory that already 404s unless
`E2E_ENABLED` — and their only callers are the Playwright suite. There is **no
production service-to-service consumer**. Building a signing protocol for zero
services means a nonce store, clock-skew tolerance, a signing client and a
second authentication path, none of which any caller exercises; unexercised
security code decays into a liability rather than a defence. mTLS is an
infrastructure capability, not an application one, and is unavailable to the
app layer on a managed platform.

**Trigger — build this when either becomes true**:

- the first real production service-to-service consumer of `/api/internal/**`
  appears, **or**
- an internal endpoint gains an impact that warrants per-request
  authentication and replay protection (anything mutating, anything returning
  data that is not already public to a signed-in user).

Until then the shared key plus SEC-44's controls is the proportionate answer.

---

## PE-22 — Security Middleware Response Consistency (`with-auth.ts`)

- **Source**: `.copilot/tasks/2026-08-23-proxy-error-boundary/` (Case 15, SEC-45)
- **Date added**: 2026-08-23
- **Status**: Open

**Description**: `src/security/middleware/with-auth.ts` builds four API error
responses by hand with `NextResponse.json()` — `401 UNAUTHORIZED`, `409
TENANT_CONTEXT_REQUIRED`, `403 TENANT_MEMBERSHIP_REQUIRED`, `403 FORBIDDEN` —
rather than through `createServerErrorResponse()`. Migrate them, keep the
redirects as `NextResponse.redirect()`, and verify the status/code contract is
unchanged. No behavioural change intended.

**Why deferred**: these four are **not** the SEC-45 defect and must not be
confused with it. They are returned from _inside_ the pipeline, so
`withSecurity()` receives them from `await handler(...)` and still runs the
common finalization — `withHeaders()`, `x-correlation-id`, `x-request-id`. They
carry the full CSP and security-header set today. This is convention debt
against SEC-38's direction, not a live gap. SEC-45 closed one specific failure
class (a throw escaping response finalization); folding a repo-wide consistency
cleanup into that fix would widen the diff, drag the auth/tenant/authorization
test suite into a security patch, and mix a vulnerability fix with tidying —
against the Architecture Guard's minimum-safe-change rule.

**Note on enforcement — do not extend the SEC-38 guard mechanically**: the
guard for this should forbid **hand-assembling the standard API error
envelope** (`{ status: 'server_error', error, code }`) in
`src/security/middleware/**`, not ban `NextResponse.json()` outright there. A
blanket ban assumes every future `NextResponse.json()` in security middleware
is an architectural mistake, which is not true — the envelope is the invariant,
the helper is just how it is produced.
