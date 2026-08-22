# Next.js Implementation Playbook

Practical, codebase-grounded guidance for building a new API route, a new
page/route segment, or a new test in this repository. Every example below
is pulled from real, current source — not idealized snippets — so this
document can drift out of date if the code it cites changes; if you find a
mismatch, trust the code (see `REPOSITORY_AI_CONTEXT.md`'s Source of Truth
rule) and fix this doc in the same change.

**This is a "how", not a "why" or "what's forbidden" document.** It
cross-links rather than duplicates:

- **Why** a pattern exists / what real incident produced it →
  `docs/ai/general/SECURITY_CODING_PATTERNS.md` (`SEC-XX` entries).
- **What never to do**, repository-wide → `IMPLEMENTATION_ANTI_PATTERNS.md`.
- **How much test coverage a change actually needs** →
  `.claude/skills/validation-strategy/SKILL.md` (or the tool-neutral
  `05 - Validation Strategy Agent.md`).

Read those when this doc points at them — don't skip the pointer and guess.

---

## 1. Building a New API Route

A route handler in this repository is not "an endpoint" in isolation — it's
the intersection of five concerns, roughly in the order a request actually
crosses them:

1. **Config** comes from `@/core/env`, never raw `process.env`.
2. **Auth** happens in the proxy pipeline (`src/proxy.ts`), before your
   handler ever runs, for any route not explicitly public.
3. **Authorization** (which action, on which resource, for this tenant) is
   the handler's/service's own job — auth alone does not imply it.
4. **Abuse prevention** (rate limiting) is required on any public,
   unauthenticated, write-or-email-triggering route.
5. **Outbound calls** to third-party hosts always go through
   `secureFetch()`, never raw `fetch()`.

### 1.1 Config: T3-Env, never raw `process.env`

Add new variables to `src/core/env.ts`'s `server`/`client` schema (with a
`z.enum`/`z.string`/etc. validator and a doc comment explaining what it
controls) and to `runtimeEnv`, then mirror them in `.env.example`. Run
`pnpm env:check` before committing — it fails if the two drift.

```typescript
// src/core/env.ts — real example, CSP_SCRIPT_MODE
CSP_SCRIPT_MODE: z
  .enum(['cache-compatible', 'nonce-dynamic'])
  .default('cache-compatible'),
```

The one documented exception is `next.config.ts`, which loads before the
T3-Env schema exists and reads `process.env` directly by necessity (see
`isNonceDynamicMode` in that file) — this is an established, narrow
exception, not a precedent for route/handler code.

### 1.2 Auth: enforced in the proxy, not the handler

Whether a route requires sign-in is decided by
`src/security/middleware/route-policy.ts`'s `PUBLIC_ROUTE_PREFIXES` /
`DEMO_ROUTE_PREFIXES` lists and the `withAuth` middleware wired in
`src/proxy.ts` — **not** by a per-handler check. A new route is private
(requires sign-in) by default simply by not being added to either list.

Only add a route to `PUBLIC_ROUTE_PREFIXES` when it must genuinely be
reachable by anyone, unauthenticated (see SEC-29 for why demo/showcase
routes specifically must **never** go here, and use `DEMO_ROUTE_PREFIXES` +
`DEMO_SHOWCASE_ENABLED` instead).

### 1.3 Authorization: the handler's own job, scoped to the resource

Passing `withAuth` only proves _someone_ is signed in — it says nothing
about whether _this_ signed-in user may perform _this_ action on _this_
tenant's resource. Admin/mutating routes must check both the action and the
resource scope explicitly (see SEC-26/SEC-27 in
`SECURITY_CODING_PATTERNS.md` for the real incidents this rule comes from).
Route param IDs bound into DB predicates must be schema-validated first —
never pass raw `params.id` into a Drizzle `eq()` for a `uuid` column (SEC-23):

```typescript
const idResult = z.object({ id: z.uuid() }).safeParse({ id: params.id });
if (!idResult.success) {
  return createValidationErrorResponse(getFieldErrors(idResult.error));
}
```

### 1.4 Abuse prevention: rate limit public write/email routes

Any unauthenticated route that accepts input, writes to the DB, or sends
email must call `checkRateLimit()` before body processing, **always**
passing `meta.path` (SEC-17 — omitting it silently reopens an edge-log
forwarding loop). Real example, `src/app/api/auth/waitlist/route.ts`:

```typescript
const WAITLIST_PATH = '/api/auth/waitlist';

export const POST = withErrorHandler(async (request) => {
  await connection();

  const ip = await getIP(new Headers(request.headers));
  const rateLimitResult = await checkRateLimit(`waitlist:${ip}`, {
    path: WAITLIST_PATH,
  });

  if (!rateLimitResult.success) {
    return createServerErrorResponse(
      'Too many requests. Please wait before trying again.',
      429,
      'RATE_LIMITED',
    );
  }

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return createServerErrorResponse(
      'Invalid request body',
      400,
      'VALIDATION_ERROR',
    );
  }
  // ...
});
```

Note the order: rate limit → business-rule gate (`REGISTRATION_MODE` check)
→ body validation. Cheapest, most abuse-relevant check first.

### 1.5 Response envelope: use the shared helpers

Don't hand-roll `NextResponse.json({...})` shapes. Use
`createSuccessResponse()` / `createServerErrorResponse()` /
`createValidationErrorResponse()` from `@/shared/lib/api/response-service`
— they produce the repository's one consistent envelope shape
(`{ status: 'ok', data }` / `{ status: 'form_errors', errors }` / etc.),
which every client-side consumer and error handler expects (see
`IMPLEMENTATION_ANTI_PATTERNS.md` §4.0, "Ad Hoc API Response Envelopes").

### 1.6 Outbound calls: always `secureFetch()`, never raw `fetch()`

Any call to a third-party host — even one that "feels" internal-only —
goes through `secureFetch()` from `@/security/outbound/secure-fetch`, not
the global `fetch()`. It enforces an allowlist
(`SECURITY_ALLOWED_OUTBOUND_HOSTS` + a small hardcoded core set), rejects
private/reserved/link-local addresses (including DNS-rebinding via
connection pinning), and validates every redirect hop the same way as the
original URL. Read SEC-28 in `SECURITY_CODING_PATTERNS.md` before touching
this file or writing a new outbound-fetch helper — it documents a real
TOCTOU this exact pattern once had and how the fix (connection pinning via
a per-request `undici.Agent`) actually closes it. Minimal usage:

```typescript
import { secureFetch } from '@/security/outbound/secure-fetch';

const response = await secureFetch(url); // url must resolve to an allowlisted, non-private host
```

If the target host isn't already in `SECURITY_ALLOWED_OUTBOUND_HOSTS` or
the hardcoded core list (Clerk, GitHub), add it to that env var — don't
special-case a new host inside `secure-fetch.ts` itself.

---

## 2. Building a New Page / Route Segment

### 2.1 CSP posture is decided once, deployment-wide — never per-route

`CSP_SCRIPT_MODE` (`cache-compatible` | `nonce-dynamic`) is a
per-**deployment** setting, not something a specific page/route segment
opts into individually. **Do not** build a page that expects a different
`Content-Security-Policy` than the rest of the app. This isn't a style
preference — it doesn't work: CSP is enforced against the _document_, and a
`<Link>` client-side navigation never fetches a new one, so a per-route
policy silently fails to protect exactly the traffic (in-app navigation)
it exists to guard. Read **SEC-31** before proposing anything that sounds
like "this route needs stricter CSP than the rest of the app" — it has the
full mechanism, a worked before/after example, and the correct fix (an
origin split, e.g. `app.example.com` vs `www.example.com`, each its own
deployment with its own `CSP_SCRIPT_MODE`).

### 2.2 Scoping a Dynamic API call (`headers()`/`cookies()`/`connection()`)

If a page/component genuinely needs a per-request value (the CSP nonce,
cookies, a header), don't call the Dynamic API from the top of a shared
layout or page component — that forces the entire subtree dynamic under
`cacheComponents: true`. Wrap a small, dedicated async Server Component
around just that call, and wrap **its call site** in `<Suspense>` (not just
its definition — this repo hit a hard `next build` failure over exactly
that distinction; see SEC-30's `NrBrowserScripts` incident for the full
story). Real pattern, `src/app/layout.tsx`:

```tsx
async function NrBrowserScripts({ cdnConfig, isNewRelicApmBrowserEnabled }: {...}) {
  const nonce = await getCspNonce(); // Dynamic API call, scoped to this component
  return <>{/* <Script nonce={nonce} .../> */}</>;
}

// ...in RootLayout's <head>:
<Suspense fallback={null}>
  <NrBrowserScripts cdnConfig={cdnConfig} isNewRelicApmBrowserEnabled={isNewRelicApmBrowserEnabled} />
</Suspense>
```

**A Suspense-scoped Dynamic API call does not make the _route_ dynamic** —
it only carves a small dynamic hole in an otherwise-static shell (confirmed
the hard way in SEC-30's "A.7.2" update: setting an env var alone did not
disable PPR; only an explicit `cacheComponents: false` in `next.config.ts`
did). After any change that adds a Dynamic API call to shared shell code,
run a real `pnpm build` (not just `pnpm typecheck`/`pnpm test`) and check
the route's build-output symbol — `◐` (Partial Prerender, static shell
intact) is what you want for a properly-scoped call; `ƒ` on every route
means something made the whole deployment dynamic, not just a hole in it.

### 2.3 Demo/showcase/diagnostic routes default to gated-off

Any new example, demo, showcase, or diagnostic route defaults to **not**
public — add it to `DEMO_ROUTE_PREFIXES` (gated by `DEMO_SHOWCASE_ENABLED`,
off by default in every environment) rather than
`PUBLIC_ROUTE_PREFIXES`. See SEC-29 for why: a demo route in
`PUBLIC_ROUTE_PREFIXES` is reachable by anyone on the internet with no way
to turn it off short of a code change, and the sharpest failure mode is a
demo route that itself takes attacker-controlled input (this repo's own
`/api/security-test/ssrf` did, before the fix). Real production
infrastructure that merely _looks_ demo-shaped by name (`/monitoring` is
Sentry's `tunnelRoute`) stays public — check what a route actually does,
never gate by name pattern alone.

---

## 3. Writing Tests

### 3.1 Co-location and naming

Unit tests live next to their source file: `src/core/env.ts` →
`src/core/env.test.ts`, `scripts/setup-env.mjs` →
`scripts/setup-env.test.ts`. `.test.ts`/`.test.tsx` suffix. The root
`tests/` directory is for global setup/polyfills/shared utilities only —
never a home for feature tests. DB-adapter code needs a co-located
`*.db.test.ts`. Playwright specs live in `e2e/**/*.spec.ts`.

### 3.2 Unit tests: mock via `@/testing`, not ad hoc

Use the shared infrastructure mocks in `@/testing` (`mockEnv`,
`mockChildLogger`, `resetAllInfrastructureMocks()`, etc.) instead of
hand-rolling `vi.mock()` calls per test file — they encode the correct
shape for env, logger, Clerk, rate-limit, and security-domain mocks in one
place, so a schema change to (say) `env.ts` only needs updating in one mock
file, not every test that touches env. Real example,
`secure-fetch.network.test.ts`:

```typescript
import { mockEnv, resetAllInfrastructureMocks } from '@/testing';

beforeEach(() => {
  resetAllInfrastructureMocks();
  mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = 'example.com, trusted.org';
});
```

Prefer typed mocks (`vi.Mocked<T>`) over untyped object literals for
service/repository mocks (SEC-24) — a typed mock catches an interface
drift at compile time instead of silently returning `undefined` at runtime.

### 3.3 Integration tests: MSW for real outbound-HTTP shape

`pnpm test:integration` runs `src/**/*.integration.test.{ts,tsx}` and
`src/testing/integration/**/*.test.{ts,tsx}` against MSW-mocked HTTP,
instead of mocking `global.fetch` directly — this exercises the real
`fetch()`/`secureFetch()` call shape (headers, method, retry/redirect
behavior) against a network-level mock, catching bugs a hand-mocked
`vi.fn()` fetch stub can't. Real example,
`src/testing/integration/outbound.test.ts`:

```typescript
import { http, HttpResponse } from 'msw';
import { server } from '@/shared/lib/mocks/server';

it('should allow requests to explicitly allowed hosts', async () => {
  mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = 'api.trusted-service.com';
  server.use(
    http.get('https://api.trusted-service.com/data', () =>
      HttpResponse.json({ success: true }),
    ),
  );

  const response = await secureFetch('https://api.trusted-service.com/data');
  expect((await response.json()).success).toBe(true);
});
```

DNS resolution is still mocked separately (`vi.mock('node:dns/promises', ...)`)
even in an MSW-backed test — MSW intercepts the `fetch()` itself, but
`secureFetch()`'s pre-flight `resolveAndValidateHost()` step calls
`dns/promises.lookup()` directly, which MSW does not intercept.

### 3.4 When a network-level (not just HTTP-mocked) test is warranted

Rare — reach for this only when the property under test is about _how_ the
connection is made, not what response comes back. The exemplar is
`secure-fetch.network.test.ts`: it doesn't test allow/deny logic (that's
`secure-fetch.test.ts`, with a mocked `global.fetch`) or realistic HTTP
shape (that's the MSW integration test above) — it proves the exact
address `resolveAndValidateHost()` validated is the exact address handed to
the real connector, by mocking `undici`'s `Agent` constructor and invoking
the captured `connect.lookup` function the way `net.connect` would. A true
end-to-end real-socket test was considered and rejected for this specific
case: this repo's sandbox can only bind a test server to loopback, which
the private-address check correctly refuses to connect to — testing that
would mean fighting the very check under test. Don't add this tier of test
by default; add it when mocking one layer down (HTTP response) can't see
the property that actually matters (which address a socket connects to).

### 3.5 Gated E2E scenarios: env-var-scoped, never in the default suite

A scenario that only makes sense under a non-default env configuration
(a feature flag on, a non-default `CSP_SCRIPT_MODE`, etc.) gets its own
`package.json` script that sets that env var explicitly, and its own spec
file — never folded into the default `pnpm e2e`/`pnpm e2e:smoke` suite.
Two real examples of the same pattern:

```jsonc
// package.json
"e2e:demo-showcase": "AUTH_PROVIDER=authjs DEMO_SHOWCASE_ENABLED=true E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/feature-flags-demo.spec.ts --project=chromium --reporter=line",
"e2e:csp-nonce-dynamic": "CSP_SCRIPT_MODE=nonce-dynamic playwright test e2e/csp-nonce-dynamic.spec.ts --project=chromium --reporter=line",
"e2e:csp-nonce-dynamic:ci": "CSP_SCRIPT_MODE=nonce-dynamic pnpm build && CSP_SCRIPT_MODE=nonce-dynamic playwright test e2e/csp-nonce-dynamic.spec.ts --project=chromium --reporter=line",
```

Most gated scenarios should route through `scripts/e2e/run-scenario.mjs`
(handles DB/fixture setup for the chosen tenancy scenario). The
`:ci`-suffixed variant exists specifically for scenarios like
`nonce-dynamic` where the env var must be set for the **build** step too
(PPR's static/dynamic split is decided once at build time, not at runtime
start) — a plain `playwright test` against an already-built app would
silently test against the wrong build. If a new gated scenario's spec
doesn't need `run-scenario.mjs`'s DB/fixture machinery (e.g. it never logs
in), it's fine to invoke `playwright test` directly instead, as
`e2e:csp-nonce-dynamic` does — but confirm first what Playwright's own
`globalSetup` actually requires (this repo's is `clerkSetup()` from
`@clerk/testing/playwright`, which only needs `CLERK_SECRET_KEY`) so the
scenario doesn't silently depend on fixtures the spec never uses.

### 3.6 `trackCspViolations()` for any CSP/script-adjacent E2E spec

A CSP-related E2E assertion that only checks the response _header_ string
proves less than it looks like — it doesn't prove the nonce in that header
actually matches every `<script>` tag, that zero
`securitypolicyviolation` events fired, or that the page actually
hydrated (exactly the gap that let a real nonce/PPR incompatibility bug
ship undetected — see SEC-30). Use the shared helpers in
`e2e/support/csp-violations.ts` for any new CSP-adjacent spec:

```typescript
import {
  trackCspViolations,
  describeScripts,
  isExecutableScript,
} from './support/csp-violations';

const tracker = await trackCspViolations(page); // BEFORE page.goto()
const response = await page.goto('/');
// ...extract headerNonce from response headers...

const scripts = (await describeScripts(page)).filter(isExecutableScript);
const mismatched = scripts.filter((s) => s.nonce !== headerNonce);
expect(mismatched, JSON.stringify(mismatched, null, 2)).toEqual([]);
expect(tracker.violations).toEqual([]);
```

Two details that matter and are easy to get wrong:

- **Read `.nonce` (the IDL property), never `getAttribute('nonce')`.**
  Browsers deliberately hide the `nonce` _content_ attribute from DOM
  reflection once a script element is inserted (anti-exfiltration) — the
  attribute-based read silently returns `''` for every script, so a broken
  implementation and a correct one look identical to that check.
  `readScriptNonces()`/`describeScripts()` already do this correctly.
- **Filter to executable scripts before asserting on nonces.**
  `application/json`, `application/ld+json`, `importmap`, and
  `speculationrules` script blocks are not subject to `script-src` and
  legitimately carry no nonce — `isExecutableScript()` excludes them so a
  page with a JSON-LD block doesn't fail a nonce-match assertion for a
  script that was never supposed to have one.

---

## Cross-References

- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — SEC-17 (rate-limit
  `meta.path`), SEC-21 (public write/email routes), SEC-23 (UUID param
  validation), SEC-24 (typed test mocks), SEC-26/SEC-27 (authorization
  scope), SEC-28 (SSRF/`secureFetch()`), SEC-29 (demo route gating),
  SEC-30 (nonce CSP mechanics + the PPR incompatibility incident), SEC-31
  (CSP is document-level — origin split, not route split).
- `docs/ai/general/IMPLEMENTATION_ANTI_PATTERNS.md` — repository-wide
  anti-patterns this playbook's "how" builds on top of (§4.0 response
  envelopes, §3.1 UI-only auth, §2.2 static-prerender assumptions in
  request-time code, among others).
- `.claude/skills/validation-strategy/SKILL.md` — how much test coverage a
  given change actually needs (this doc assumes that decision is already
  made and shows how to build the test once it's warranted).
- `.claude/skills/nextjs-runtime/SKILL.md` — App Router/caching/runtime
  review specifically; this playbook is the "how to build it" companion to
  that skill's "is this the right shape" review.

Per `AGENTS.md`'s Agent Infrastructure location map, this document's
location is registered in `AGENTS.md`, `CLAUDE.md`, and
`docs/ai/general/REPOSITORY_AI_CONTEXT.md`'s required-reading sequences —
update all three if this doc moves.
