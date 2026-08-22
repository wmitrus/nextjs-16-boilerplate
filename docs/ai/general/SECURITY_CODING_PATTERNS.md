# Security Coding Patterns

Living reference produced during structured security reviews.
Every entry describes a scanner finding, its real-world risk classification,
what code to avoid, and the correct pattern to use instead.

This document is injected into agent prompts and repository rules.
Update it after every security review group.

---

## Pattern Index

| #      | Category           | Vulnerability Class                                                                                      | Classification                                                                                                                               | Affected Contexts                                   |
| ------ | ------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| SEC-01 | Cryptography       | Timing attack — Symbol `===` in DI mocks                                                                 | False positive                                                                                                                               | Unit test files                                     |
| SEC-02 | Routes             | Open redirect — hardcoded path via `req.url` origin                                                      | False positive                                                                                                                               | Middleware                                          |
| SEC-03 | Routes             | Open redirect — forwarded `redirect_url` query param                                                     | Latent risk → fixed                                                                                                                          | Middleware                                          |
| SEC-04 | Command injection  | Dynamic logger dispatch `logger[level]()`                                                                | False positive → hardened                                                                                                                    | API route                                           |
| SEC-05 | File access        | Dynamic `fs.*` with static literal paths                                                                 | False positive                                                                                                                               | E2E helpers                                         |
| SEC-06 | Cryptography       | `Math.random()` for test email uniqueness                                                                | False positive                                                                                                                               | E2E specs                                           |
| SEC-11 | Caching            | SDK client cache key missing differentiating config                                                      | Real risk → fixed                                                                                                                            | Module-level SDK adapters                           |
| SEC-15 | Object access      | User-controlled key lookup via `key in object`                                                           | Fixed — verified 2026-08-22 (A.8 follow-up)                                                                                                  | Auth/bootstrap UI mapping                           |
| SEC-16 | File access        | Reusable helper fs paths lack sink confinement                                                           | Fixed — verified 2026-08-22 (A.8 follow-up)                                                                                                  | Runtime logger helpers                              |
| SEC-17 | Observability      | Rate-limit WARN missing `path` causes edge-log loop                                                      | Real risk → fixed                                                                                                                            | Rate-limit middleware                               |
| SEC-18 | Tooling env access | Dynamic `process.env[key]` in scripts/helpers                                                            | Local lint-backed workflow                                                                                                                   | Scripts, E2E helpers                                |
| SEC-19 | File access        | Shared sink-confined fs helpers for scripts/tooling                                                      | Local lint-backed workflow                                                                                                                   | Scripts, E2E helpers                                |
| SEC-20 | Object access      | Dynamic object transformation via `result[key] = ...`                                                    | AI-pattern backed workflow                                                                                                                   | `src/**` runtime helpers                            |
| SEC-21 | Abuse prevention   | Public email/write endpoints without rate limiting                                                       | Real risk → fixed                                                                                                                            | Public auth route handlers                          |
| SEC-22 | Observability      | Raw email/token/URL logging in no-op/provider bridges                                                    | Real risk → fixed                                                                                                                            | Email adapters, auth bridges                        |
| SEC-23 | Routes / DB input  | Raw route params bound to UUID columns                                                                   | Real risk → fixed                                                                                                                            | App Router route handlers                           |
| SEC-24 | Error-prone TS/JSX | Scanner HIGH error-prone patterns                                                                        | Not security by itself                                                                                                                       | UI state, JSX handlers, tests                       |
| SEC-25 | Deploy/runtime env | Build-only env fallback masks runtime config drift                                                       | Real risk → fixed                                                                                                                            | CI/CD, Vercel, AuthJS env                           |
| SEC-26 | Authorization      | ABAC action check without matching resource-scope check                                                  | Real risk → fixed                                                                                                                            | Admin CRUD route handlers/services                  |
| SEC-27 | Authorization      | Mutating admin route with no authorization check at all                                                  | Real risk → fixed                                                                                                                            | Admin API route handlers                            |
| SEC-28 | SSRF               | IPv4-only private-IP check + no DNS-rebinding defense                                                    | Real risk → fixed (Update 2026-08-21: first fix was a TOCTOU; Update 2026-08-22: A.8 hardened credential/timeout/size/IP-normalization gaps) | Outbound fetch helpers                              |
| SEC-29 | Attack surface     | Public unauthenticated demo/showcase routes                                                              | Real risk → fixed                                                                                                                            | Demo/showcase route policy                          |
| SEC-30 | CSP hardening      | script-src used unsafe-inline/unsafe-eval unconditionally                                                | Real risk → partially fixed, deferred (see Update 2026-08-21)                                                                                | with-headers.ts, layout.tsx                         |
| SEC-31 | CSP architecture   | Same-origin mixed CSP profiles don't survive client-side nav                                             | Architectural guidance, not a bug fix                                                                                                        | CSP profile decisions repo-wide                     |
| SEC-32 | CSP hardening      | `speculationrules` misclassified inert; `*_EXTRA` env accepted raw CSP syntax; DNS lookup had no timeout | Real risk → fixed (2026-08-22, A.8 follow-up)                                                                                                | with-headers.ts, csp-violations.ts, secure-fetch.ts |

---

## SEC-25 — Build-Only Env Fallbacks Must Not Mask Runtime Config Drift

### Incident Pattern

A production deploy failure was fixed by exporting a missing env var only for the
`vercel build --prod` process. That made the build capable of passing while the
deployed runtime would still lack the same env var in Vercel Production.

### Why This Is Banned

- It fixes the current pipeline stage while leaving the next lifecycle stage broken.
- It creates false confidence: CI can pass even though runtime behavior remains
  misconfigured.
- It is especially dangerous for auth, tenant, database, redirect, cookie, and
  provider-origin configuration where build-time and runtime both consume env.

### Banned Pattern

```bash
# BANNED when NEXTAUTH_URL is also required at runtime
export NEXTAUTH_URL="$NEXT_PUBLIC_APP_URL"
vercel build --prod
```

### Correct Pattern

- Identify whether the value is required at build time, runtime, or both.
- If runtime needs the value, require it in the deployment environment and fail
  before build when it is missing.
- Do not synthesize a build-only value unless the downstream runtime receives the
  same contract or the value is proven build-only.
- Document provider/environment scope explicitly, for example
  `AUTH_PROVIDER=authjs` + Vercel **Production** only.

Example:

```bash
if [ "${APP_ENV:-}" = "production" ] && \
  [ "${AUTH_PROVIDER:-}" = "authjs" ] && \
  [ -z "${NEXTAUTH_URL:-}" ]; then
  echo "AUTH_PROVIDER=authjs requires NEXTAUTH_URL in Vercel Production env."
  exit 1
fi
```

### Validation Rule

Validation must cover the full lifecycle boundary affected by the fix:

- CI/build stage
- deployed runtime env contract
- provider-specific scope
- environment scope, such as Preview vs Production

Do not sign off a deploy fix only because the failing command now passes.

---

## SEC-01 — Timing Attack: Symbol Comparisons in Test DI Mocks

### Scanner Finding

> String comparisons using `===`, `!==`, `!=` and `==` is vulnerable to timing attacks.

### Context

DI mock containers in unit tests that resolve services by Symbol token:

```typescript
resolve: (token: symbol) => {
  if (token === AUTH.IDENTITY_SOURCE) return identitySource; // flagged
  if (token === PROVISIONING.SERVICE) return provisioningService; // flagged
  if (token === AUTH.USER_REPOSITORY) return userRepository; // flagged
  return undefined;
};
```

### Why This Is a False Positive

- The scanner applies a generic "constant-time string comparison" rule to **any** `===`.
- These operands are JavaScript `Symbol` values — not strings, not secrets.
- Symbols are resolved by **pointer / reference identity** at the VM level.
- There is no byte-by-byte character comparison. Timing variance from secret content is impossible.
- This code only exists in **test files** — no production exposure.

### Correct Pattern

Replace if/else chains with a `Map<symbol, unknown>`. This eliminates the `===` comparisons entirely, removes the scanner signal at source, and produces cleaner setup code:

```typescript
const services = new Map<symbol, unknown>([
  [AUTH.IDENTITY_SOURCE, identitySource],
  [PROVISIONING.SERVICE, provisioningService],
  [AUTH.USER_REPOSITORY, userRepository],
]);

getAppContainerMock.mockReturnValue({
  resolve: (token: symbol) => services.get(token),
});
```

`Map.get()` uses [SameValueZero](https://tc39.es/ecma262/#sec-samevaluezero) internally — correct for Symbols, no `===` in user code, no scanner signal.

### Rule for Agents

**DO NOT** write if/else chains of `token === SYMBOL` in test DI mocks.
**DO** use `Map<symbol, unknown>` keyed by DI token symbols.

---

## SEC-02 — Open Redirect: Hardcoded Path with `req.url` as Base

### Scanner Finding

> Passing untrusted user input in `redirect()` can result in an open redirect vulnerability.

### Context

```typescript
return NextResponse.redirect(new URL('/sign-in', req.url));
// line 292, with-auth.ts

return NextResponse.redirect(new URL('/sign-in', req.url));
// bootstrap guard — line 292
```

### Why This Is a False Positive

- `new URL('/sign-in', req.url)` uses `req.url` only as the **base** to supply the origin.
- The path `/sign-in` is a **string literal** — no user input participates in the redirect destination.
- The resulting URL is always `https://<same-origin>/sign-in`.
- The scanner cannot statically distinguish `new URL(literal, base)` from `new URL(userInput, base)`.

### Correct Pattern

This pattern is correct and safe. When using `req.url` purely as an origin base with a literal path, it is always safe:

```typescript
return NextResponse.redirect(new URL('/sign-in', req.url));
return NextResponse.redirect(new URL('/onboarding', req.url));
return NextResponse.redirect(new URL('/', req.url));
```

### Rule for Agents

`new URL('/literal-path', req.url)` is **safe**. It is not an open redirect.
Do not introduce scanner suppression comments for this pattern — it is architecturally sound.

---

## SEC-21 — Public Email / Write Endpoints Must Be Rate Limited

### Scanner Finding

> Public unauthenticated endpoint accepts attacker-controlled input, writes to storage, or triggers outbound email without rate limiting.

### Context

Examples in this repository include public auth endpoints such as waitlist join, resend verification, and forgot password.

### Why This Is A Real Risk

- anonymous callers can spam mailbox targets controlled by third parties
- attackers can grow internal storage tables cheaply
- abuse can trigger outbound provider costs and noisy operational logs
- missing rate limiting on one public endpoint breaks the repository's otherwise consistent abuse boundary

### Correct Pattern

For any unauthenticated route handler that:

- accepts arbitrary caller input
- writes to the database, or
- sends email / external side effects

apply `checkRateLimit()` before body processing, keyed by IP (and optionally a normalized identifier), and always pass `meta.path`:

```typescript
const path = '/api/auth/waitlist';
const ip = await getIP(new Headers(request.headers));
const rateLimitResult = await checkRateLimit(`waitlist:${ip}`, {
  path,
});

if (!rateLimitResult.success) {
  return createServerErrorResponse(
    'Too many requests. Please wait before trying again.',
    429,
    'RATE_LIMITED',
  );
}
```

### Rule for Agents

**DO** add rate limiting to public write/email auth endpoints.
**DO** pass `meta.path` to `checkRateLimit()`.
**DO NOT** ship anonymous email-triggering endpoints without abuse throttling.

---

## SEC-22 — Never Log Raw Emails, Tokens, Or Full One-Time URLs

### Scanner Finding

> Logging code emits raw email addresses, single-use links, or token-bearing URLs to stdout or structured logs.

### Context

This risk appears most often in:

- `NoOpEmailService`
- provider bridges such as Clerk invitation or waitlist adapters
- auth verification / reset flows that generate single-use links

### Why This Is A Real Risk

- raw emails are PII
- one-time URLs and tokens are credential material
- stdout logs are often shipped to external providers and retained longer than intended
- no-op adapters used in development often leak the exact data that later appears in shared preview logs

### Correct Pattern

- use structured Pino logging, not `console.info`
- mask emails or log a deterministic email hash
- never log full invitation / verification / reset URLs
- if correlation is needed, log a short hash plus token length, not the token value

```typescript
logger.debug(
  {
    event: 'email:verification:noop',
    emailPreview: 'a***@example.com',
    verifyLink: {
      path: '/auth/verify-email',
      tokenHashPreview: '[hash-prefix]',
      tokenLength: 43,
    },
  },
  'Verification email suppressed by NoOpEmailService',
);
```

Documentation note: in committed markdown, never use credential-shaped example values such as fake API keys, token hashes, license keys, passwords, or long hex/base64 placeholders. Use neutral placeholders like `[REDACTED]`, `[hash-prefix]`, or `[example-value]` instead so secret scanners do not flag the example text.

### Rule for Agents

**DO** mask or hash emails in logs.
**DO NOT** log raw one-time URLs or tokens.
**DO** prefer structured logger fields over stdout dumping.

---

## SEC-03 — Open Redirect: Forwarded `redirect_url` Query Parameter

### Scanner Finding

> Passing untrusted user input in `redirect()` can result in an open redirect vulnerability.

### Context

```typescript
// with-auth.ts — redirectAuthenticatedFromAuthRoute()
const bootstrapUrl = new URL('/auth/bootstrap/start', req.url);
const existingRedirectUrl =
  req.nextUrl.searchParams.get('redirect_url') ?? '/users'; // user-controlled
bootstrapUrl.searchParams.set('redirect_url', existingRedirectUrl);

return NextResponse.redirect(bootstrapUrl); // flagged — line 128
```

### Risk Assessment

The **immediate** redirect target is always `/auth/bootstrap/start` on the same origin — safe.

However, `existingRedirectUrl` is **user-controlled** (from `?redirect_url=`). It is forwarded as a query param. If any downstream handler consumes this param and calls `redirect(param)` without validating it is a same-origin relative path, an open redirect exists in the chain.

**Classification: Latent risk — requires sanitisation before forwarding.**

### Dangerous Pattern (DO NOT use)

```typescript
const redirectUrl = req.nextUrl.searchParams.get('redirect_url') ?? '/users';
// Forwarding without validation — any absolute URL, //evil.com, etc. passes through
bootstrapUrl.searchParams.set('redirect_url', redirectUrl);
```

### Correct Pattern

Always validate that a `redirect_url` param is a relative path before forwarding it:

```typescript
import { sanitizeRedirectUrl } from '@/shared/lib/routing/safe-redirect';

const rawRedirectUrl = req.nextUrl.searchParams.get('redirect_url') ?? '/users';
const safeRedirectUrl = sanitizeRedirectUrl(rawRedirectUrl);
bootstrapUrl.searchParams.set('redirect_url', safeRedirectUrl);
```

The `sanitizeRedirectUrl` helper must:

1. Reject absolute URLs (must not start with `http://`, `https://`, `//`).
2. Accept only paths starting with `/` (single slash).
3. Fall back to a safe default (e.g. `/users`) when the input fails validation.

```typescript
export function sanitizeRedirectUrl(url: string, fallback = '/users'): string {
  if (!url.startsWith('/') || url.startsWith('//')) return fallback;
  return url;
}
```

### Rule for Agents

**NEVER** forward a `redirect_url` (or similar) query parameter without first calling
`sanitizeRedirectUrl()`. Even if the immediate redirect target is a safe literal path,
unvalidated params propagate the risk downstream.

All `?redirect_url=` parameters MUST be sanitized at the point they are read from the request.

---

## SEC-04 — Command Injection: Dynamic Logger Method Dispatch

### Scanner Finding

> Using non-static data to retrieve and run functions from the object is dangerous.

### Context

```typescript
const logger = resolveServerLogger().child(childBindings);
const level = validation.data.level;
logger[level]({ ...logContext, ip }, validation.data.message); // flagged
```

### Why This Is a False Positive (with hardening opportunity)

- `level` is validated by `z.enum(['fatal','error','warn','info','debug','trace'])` before reaching this line.
- Zod schema enforces the enum exhaustively — no other value can pass validation.
- The scanner cannot see past the Zod boundary; it flags any dynamic property access used to call a function.
- No injection is possible: the only reachable values are the 6 whitelisted log-level strings.

However, the pattern is still worth hardening: the Zod guard is invisible to static analysis
and to anyone reading only this line. An explicit dispatch map makes the safety self-evident
without relying on the reader tracing back to the schema.

### Dangerous Pattern (DO NOT use)

```typescript
logger[level]({ ...logContext, ip }, message);
```

Even when `level` is previously validated, bracket-dispatch on an object to call methods
creates a scanner signal and is less readable than an explicit map.

### Correct Pattern

Use an explicit `Record<LogLevel, fn>` dispatch map with every allowed value listed statically:

```typescript
type LogLevel = (typeof LOG_LEVELS)[number];

const logDispatch: Record<
  LogLevel,
  (ctx: Record<string, unknown>, msg: string) => void
> = {
  fatal: (ctx, msg) => logger.fatal(ctx, msg),
  error: (ctx, msg) => logger.error(ctx, msg),
  warn: (ctx, msg) => logger.warn(ctx, msg),
  info: (ctx, msg) => logger.info(ctx, msg),
  debug: (ctx, msg) => logger.debug(ctx, msg),
  trace: (ctx, msg) => logger.trace(ctx, msg),
};

logDispatch[level]({ ...logContext, ip }, validation.data.message);
```

Benefits:

- TypeScript enforces exhaustiveness via `Record<LogLevel, ...>` — missing a level is a compile error.
- No dynamic method dispatch on the logger object itself.
- Scanner-clean.
- Self-documenting: the full set of valid dispatch targets is visible at the call site.

### Rule for Agents

**DO NOT** use `obj[dynamicKey]()` to call methods even when `dynamicKey` is validated upstream.
**DO** use an explicit `Record<AllowedKeys, fn>` dispatch map.

### Local Lint Workflow

The repository now uses a narrow local ESLint warning for `obj[dynamicKey]()` bracket-dispatch.
The goal is not broad parity with Codacy's object-injection heuristics. The goal is to catch the highest-signal SEC-04 shape locally before review.

This applies to loggers, event handlers, strategy objects, and any pattern where a validated
string selects a method to call.

---

## SEC-05 — File Access: Dynamic `fs.*` with Static Literal Paths

### Scanner Finding

> The application dynamically constructs file or path information.

### Context

```typescript
// e2e/runtime-profile.ts
function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) { return {}; }       // flagged
  const content = fs.readFileSync(filePath, 'utf8'); // flagged
  ...
}

const envE2ELocal = readEnvFile(path.resolve(process.cwd(), '.env.e2e.local'));
```

### Why This Is a False Positive

- `filePath` is always `path.resolve(process.cwd(), '<string-literal>')` — the entire call chain
  traces back to a hard-coded file name, not user input.
- The scanner flags any `fs.*` call that receives a non-constant argument, regardless of where
  that argument originates.
- No path traversal is possible when the argument is a literal file name in the project root.
- This code runs only in E2E test setup — not in any production request path.

### Correct Pattern

The pattern is correct. Add a comment at the function explaining the argument origin:

```typescript
function readEnvFile(filePath: string): Record<string, string> {
  // filePath is always path.resolve(process.cwd(), '<static-literal>') — not user input.
  // fs.existsSync / readFileSync on a static config file path is not a path-traversal risk.
  if (!fs.existsSync(filePath)) { return {}; }
  const content = fs.readFileSync(filePath, 'utf8');
  ...
}
```

### When It IS a Real Risk

If `filePath` is ever derived from user input (request params, form data, headers):

```typescript
const filePath = path.join(baseDir, req.params.filename); // DANGEROUS — path traversal
```

In that case, validate and sanitize: allow only known filenames, use an allowlist, and ensure
`path.resolve()` result stays within the expected base directory.

### Rule for Agents

`fs.*` with static config file names is safe. `fs.*` with any user-controlled string is a
path traversal risk — sanitize with an allowlist or directory-containment check.

---

## SEC-06 — Cryptography: `Math.random()` for Non-Secret Test Uniqueness

### Scanner Finding

> This rule identifies use of cryptographically weak random number generators.

### Context

```typescript
// e2e/auth.spec.ts
function createUniqueClerkTestEmail(prefix: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; // flagged
  return `e2e+clerk_test-${prefix}-${suffix}@example.com`;
}
```

### Why This Is a False Positive

- `Math.random()` is used **only** to produce a collision-resistant suffix for test email addresses.
- The goal is uniqueness across concurrent E2E runs — not secrecy, not unpredictability for an adversary.
- No secret, token, key, or session value is generated here.
- This code exists only in E2E test specs — never in production.

### When `Math.random()` IS a Real Risk

Using `Math.random()` for anything security-sensitive is dangerous:

```typescript
const sessionToken = Math.random().toString(36); // DANGEROUS — predictable
const csrfToken = Math.random().toString(16); // DANGEROUS — not cryptographically secure
const apiKey = Math.random().toString(36); // DANGEROUS
```

### Correct Pattern for Secrets

For any value that must be unpredictable to an adversary, use the Web Crypto API:

```typescript
const array = new Uint8Array(32);
crypto.getRandomValues(array);
const token = Buffer.from(array).toString('hex');
```

Or in Node.js:

```typescript
import { randomBytes } from 'node:crypto';
const token = randomBytes(32).toString('hex');
```

### Rule for Agents

`Math.random()` is **only** acceptable for non-security purposes: test data uniqueness,
shuffling UI elements, non-critical sampling.

`Math.random()` must **never** be used for: tokens, secrets, API keys, CSRF values,
session identifiers, nonces, or any value an adversary must not be able to predict.

---

---

## Schema Type Discipline (DB Layer)

**ID**: SEC-07

**Rule**: `uuid` Drizzle column type must only be used for DB-generated PKs (`defaultRandom()`) and FK references to UUID-typed PKs. Never use `uuid` for application-level or externally-sourced string identifiers (Clerk org IDs, tenant slugs, string scope keys).

**Why**: Postgres validates UUID format at query parameter binding time. A non-UUID string passed to a `uuid`-typed column raises `22P02: invalid input syntax for type uuid` before any rows are evaluated — even if the query uses `OR col IS NULL`. Unit tests with mocked DBs cannot catch this; only `*.db.test.ts` integration tests will surface it.

**Correct alternative**: Use `text` column type for externally-sourced identifiers. Document the expected value format (e.g., "will always be a UUID-shaped string from `tenants.id` in production") in a code comment.

---

## SEC-23 — Validate Route Params Before Binding UUID Columns

**ID**: SEC-23
**Category**: Routes / DB input validation
**Classification**: Real risk
**Affected contexts**: App Router route handlers, server actions, Drizzle predicates, repository calls that bind UUID columns

### Risk

App Router `context.params` values are untrusted strings. Passing a malformed path
segment such as `not-a-uuid` into a Drizzle predicate for a Postgres `uuid` column
raises `22P02: invalid input syntax for type uuid` at query parameter binding time.
That bypasses intended application-level `400` or `404` handling and returns a server
error for caller-controlled input.

### Dangerous Pattern

```typescript
const params = await context.params;
const invitationId = params.id;

await db
  .select()
  .from(invitationsTable)
  .where(eq(invitationsTable.id, invitationId));
```

Presence checks such as `if (!params.id)` are not enough. They prove only that a
string exists, not that it is valid for a UUID-typed DB column.

### Correct Pattern

```typescript
const idResult = z.object({ id: z.uuid() }).safeParse({ id: params.id });

if (!idResult.success) {
  return createValidationErrorResponse(getFieldErrors(idResult.error));
}

await db
  .select()
  .from(invitationsTable)
  .where(eq(invitationsTable.id, idResult.data.id));
```

Use existing route-level schemas such as `organizationIdSchema` where available. After
validation, use only `parseResult.data.*` values in DB predicates and mutation inputs.

### Required Validation

Every route handler with a UUID path segment must include a negative route-handler test
using a malformed value such as `not-a-uuid`. The test must prove:

- response status is `400`
- repository/read-service/DB query mocks are not called for that malformed ID
- mutation side effects are not called

This check is required even when happy-path and not-found tests already exist, because
mocked DB tests do not surface Postgres UUID bind errors.

### Rule for Agents

**DO** parse every UUID path param with `z.uuid()` or an equivalent schema before DB use.
**DO** add malformed-ID tests for UUID path segments.
**DO NOT** alias raw `params.*` values as IDs or pass raw route params directly to
Drizzle `eq(...)` predicates for UUID columns.

---

## SEC-24 — Codacy HIGH Error-Prone Patterns Are Reliability Findings, Not Automatic Security Findings

**ID**: SEC-24
**Category**: TypeScript / React reliability
**Classification**: Not security by itself; fix when low-blast-radius because repeated
scanner churn hides real findings
**Affected contexts**: Client components, sparse UI state, JSX event handlers, unit-test
mocks, finite-option route schemas

### Risk Classification

Codacy `HIGH Error prone` findings such as unnecessary optional chaining, unnecessary
`??`, Promise-returning JSX handlers, unbound mock methods, and invalid template literal
types are not automatically security vulnerabilities. They usually do not create a data
leak, authorization bypass, or tenant exposure on their own.

They still deserve professional handling because:

- type declarations may be lying about runtime absence
- React does not await event handler promises
- broad strings can drift into domain-sensitive logic
- repeated scanner noise can hide security-significant findings

### Correct Patterns

For sparse maps keyed by dynamic IDs, do not use full `Record<string, T>`:

```typescript
const [rowState, setRowState] = useState<Partial<Record<string, RowState>>>({});
const state = rowState[row.id] ?? { status: 'idle' };
```

Use `Partial<Record<string, T>>` or `Map<string, T>` whenever a key may be absent. Do
not accept scanner quick fixes that remove `?.` or `??` from sparse dynamic state.

For async React handlers, mark the JSX boundary explicitly:

```tsx
<button onClick={() => void handleDelete(id)} />
<form onSubmit={(event) => void handleSubmit(event)} />
```

The async handler itself must still handle expected failures with `try/catch` and
user-facing error state. The `void` wrapper only prevents returning a Promise to a
void-returning JSX attribute.

For test object mocks, prefer typed mocks:

```typescript
const repository: vi.Mocked<InvitationRepository> = {
  findByToken: vi.fn(),
  // ...
};

repository.findByToken.mockResolvedValue(invitation);
```

For finite route/domain options, use schemas that narrow the type:

```typescript
const resourceOptions = Object.values(RESOURCES) as [Resource, ...Resource[]];
const bodySchema = z.object({
  resource: z.enum(resourceOptions),
});
```

Keep separate validation for cross-field relationships such as action values belonging
to the selected resource.

### Rule for Agents

**DO** classify these findings as reliability/type-safety unless a concrete security
path is found in the live code.
**DO** prefer low-blast-radius code fixes over suppressions.
**DO** update validation so the affected component, route, or test still proves the
behavior.
**DO NOT** remove optional chaining or nullish fallbacks from dynamic sparse state just
because a scanner says the type is non-nullish.
**DO NOT** leave Promise-returning JSX handlers unwrapped.

**ID**: SEC-08

**Rule**: Unique indexes on nullable columns using `uniqueIndex().on(col1, nullableCol)` do NOT enforce uniqueness when `nullableCol IS NULL` in Postgres. BTree indexes treat `NULL != NULL`, allowing multiple rows with the same key and NULL in the nullable column.

**Correct alternative**: Use the `unique()` constraint builder with `.nullsNotDistinct()`:

```typescript
unique('constraint_name').on(t.key, t.nullableCol).nullsNotDistinct();
```

This generates `UNIQUE NULLS NOT DISTINCT` (requires Postgres 15+).

**SQLint false positive**: SQLint reports `UNIQUE NULLS NOT DISTINCT(...)` as "non-ANSI SQL syntax". This is a false positive for this Postgres-only codebase. Drizzle ORM generates this exact SQL from `.nullsNotDistinct()`. Do not edit Drizzle-generated migration files to work around this warning. Configure SQLint to allow PostgreSQL dialect extensions, or suppress the warning with a per-file ignore.

---

## SEC-09 — Shared Mutable State in SDK Singleton Across Requests

**ID**: SEC-09

**Category**: Multi-tenancy / Request Isolation

**Vulnerability Class**: Cross-tenant attribute contamination via shared mutable SDK instance

**Classification**: Real risk — architecture-level

**Affected Contexts**: Any adapter that caches an SDK instance at module level and mutates it with per-request user/tenant context

---

### Pattern (DO NOT use)

```typescript
// DANGEROUS: module-level singleton + per-request mutation
const instanceCache = new Map<string, SdkInstance>();

async function isEnabled(
  flag: string,
  context: AuthorizationContext,
): Promise<boolean> {
  const instance = getOrCreate(clientKey);
  await instance.setAttributes({
    // ← mutates shared state with request context
    id: context.subject.id,
    company: context.tenant.tenantId,
  });
  return instance.isOn(flag); // ← reads from mutable shared state
}
```

### Why This Is Dangerous

Even in Node.js's single-threaded event loop, if `setAttributes()` is async (or becomes async in a future SDK version), the event loop can interleave:

1. Request A sets attributes `{ company: 'tenant-a' }` → awaits
2. Event loop processes Request B: sets `{ company: 'tenant-b' }` → overwrites
3. Request A calls `isOn(flag)` → evaluates with tenant-B's context

Cross-tenant flag evaluation is a tenant isolation violation. Feature flags gating sensitive features become unreliable.

### Correct Pattern

Separate the safe (feature definition cache) from the unsafe (mutable attribute state):

```typescript
// SAFE: cache only the feature definitions (HTTP response), not the mutable instance
let cachedFeatures: FeatureDefinitions | null = null;

async function isEnabled(
  flag: string,
  context: AuthorizationContext,
): Promise<boolean> {
  if (!cachedFeatures) {
    cachedFeatures = await fetchFeatureDefinitions(clientKey, apiHost);
  }
  // Create a stateless evaluator with per-request context — no shared mutable state
  const result = evaluateFeature(flag, cachedFeatures, {
    id: context.subject.id,
    company: context.tenant.tenantId,
  });
  return result;
}
```

Or with the GrowthBook SDK v2+ stateless evaluation API: pass attributes directly to `evalFeature()` without calling `setAttributes()` on a shared instance.

### Rule for Agents

**DO NOT** cache SDK instances that expose mutable attribute/context setters and call those setters per-request.

**DO** cache only the immutable result of remote data fetches (feature definitions, rule sets, etc.).

**DO** create stateless per-request evaluation contexts with the cached definitions and the current request's identity/tenant data.

This rule applies to: GrowthBook, LaunchDarkly, Unleash, or any feature-flag SDK that exposes per-instance attribute mutation.

---

## SEC-10 — Error Objects Must Be Sanitized Before Logging

**ID**: SEC-10

**Category**: Sensitive Data Exposure / Logging

**Vulnerability Class**: DB connection strings and internal host info in log payloads

**Classification**: Real risk

**Affected Contexts**: Any catch block that logs an `error` object from DB, HTTP, or infrastructure adapters

---

### Pattern (DO NOT use)

```typescript
// DANGEROUS: raw error object serialized into log payload
logger.warn({ event: 'evaluation-error', flag, error }, 'Failed');
```

### Why This Is Dangerous

Infrastructure errors from databases, HTTP clients, and SDKs commonly embed sensitive data in their `.message` property:

```
Error: connection to server at "db.internal" (10.0.0.5), port 5432 failed:
FATAL: password authentication failed for user "dbuser"
connection string: postgres://dbuser:PASSWORD@db.internal:5432/appdb
```

When serialized by Pino, the full `Error` object (including `message`, `stack`, and any custom properties) is written to the log payload. This exposes:

- Internal hostnames and IPs
- Database usernames and potentially passwords
- Connection string fragments

### Correct Pattern

Extract only the safe fields before logging:

```typescript
// SAFE: sanitize error before logging
logger.warn(
  {
    event: 'evaluation-error',
    flag,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorName: error instanceof Error ? error.name : 'UnknownError',
    // Do NOT include error.stack in production logs unless explicitly needed for debugging
  },
  'Failed; defaulting to safe fallback',
);
```

If stack traces are needed, log them only at `debug` level and only in non-production environments.

### Rule for Agents

**DO NOT** pass raw `error` objects as structured log fields in Pino or any logger.

**DO** extract `error.message` and `error.name` as separate string fields.

**DO NOT** log `error.stack` in production at `warn` or `error` level.

This rule applies to all catch blocks in infrastructure adapters, resilient wrappers, and route handlers.

---

## SEC-11 — SDK Client Cache Key Must Include All Differentiating Configuration

**ID**: SEC-11

**Category**: Caching / Multi-tenancy / Request Isolation

**Vulnerability Class**: Wrong backend silently queried due to incomplete cache key

**Classification**: Real risk

**Affected Contexts**: Any module-level SDK client cache keyed by a subset of the client's configuration

---

### Pattern (DO NOT use)

```typescript
// DANGEROUS: cache key uses only clientKey, ignoring apiHost
const clientCache = new Map<string, ClientEntry>();

function getOrCreateClient(clientKey: string, apiHost: string): ClientEntry {
  const existing = clientCache.get(clientKey); // ← ignores apiHost
  if (existing) return existing;

  const client = new SdkClient({ clientKey, apiHost });
  clientCache.set(clientKey, { client, ready: client.init() });
  return clientCache.get(clientKey)!;
}
```

### Why This Is Dangerous

If two `SdkClient` instances are constructed with the same `clientKey` but different `apiHost` values (e.g., self-hosted vs. CDN, staging vs. production, different regions), the second instance silently reuses the first cached client. All subsequent flag evaluations, feature fetches, or API calls go to the wrong backend.

This is **silent** — no error is thrown. Feature flags may be evaluated against stale or wrong definitions, potentially causing:

- Incorrectly enabled features for tenants or users
- Wrong rollout percentages applied
- Wrong experiments evaluated

### Correct Pattern

Include **all** configuration that differentiates client behavior in the cache key:

```typescript
// SAFE: cache key includes all differentiating config
const clientCache = new Map<string, ClientEntry>();

function getOrCreateClient(clientKey: string, apiHost: string): ClientEntry {
  const cacheKey = `${clientKey}|${apiHost}`; // ← all differentiating config
  const existing = clientCache.get(cacheKey);
  if (existing) return existing;

  const client = new SdkClient({ clientKey, apiHost });
  const ready = client.init({ timeout: 2000 }).then(() => undefined);
  const entry: ClientEntry = { client, ready };
  clientCache.set(cacheKey, entry);
  return entry;
}
```

**Separator choice**: Use `|` as the separator between key components. Ensure the separator character cannot appear in any of the key component values to avoid collisions. For SDK client keys and HTTPS URLs, `|` is safe.

### Rule for Agents

**DO NOT** key a module-level SDK client cache by a subset of the client's configuration.

**DO** include all configuration fields that distinguish one client instance from another in the cache key.

**DO** use a separator character that cannot appear in any of the key components.

This rule applies to: GrowthBook, LaunchDarkly, Unleash, OpenFeature providers, or any SDK with configurable backend host/endpoint + identifier pairs.

**Relationship to SEC-09**: SEC-09 addresses mutable attribute state shared across requests. SEC-11 addresses incomplete cache key selection when caching client instances themselves. Both are required for correct multi-tenant SDK isolation.

---

## SEC-12 — Script `fs.*` Paths Must Use `path.resolve`, Not `path.join`

**ID**: SEC-12
**Category**: File access / SEC-05 refinement
**Surface**: Scripts (`scripts/*.ts`), CLI helpers, any Node.js utility outside Next.js runtime

### Rule

All `fs.*` calls in scripts must construct their paths with `path.resolve(cwd, '<literal>')`, not `path.join(cwd, '<literal>')`.

Both produce the same result for non-traversal inputs, but `resolve` is the explicitly documented safe pattern in this repository (see SEC-05), and is what static analysis tools expect.

### Correct Pattern

```typescript
import { resolve } from 'node:path';

const ROOT = process.cwd();
applyEnvFile(resolve(ROOT, '.env'));
applyEnvFile(resolve(ROOT, '.env.local'));
```

### Incorrect Pattern

```typescript
import { join } from 'node:path';

const ROOT = process.cwd();
applyEnvFile(join(ROOT, '.env')); // violates SEC-05 convention — use resolve
```

### Rule for Agents

Never use `path.join` for `fs.*` paths in scripts. Always use `path.resolve`. This applies even when the second argument is a string literal with no traversal risk — the convention is `resolve`, not `join`.

---

## SEC-13 — `env:validate` Is a Deploy Gate, Not a PR Quality Gate

**ID**: SEC-13
**Category**: CI/CD configuration / env validation scope

### Rule

`pnpm env:validate` requires deployment secrets (`CLERK_SECRET_KEY`, `DEFAULT_TENANT_ID`, etc.) that are unavailable in PR workflows — particularly for forked PRs where GitHub Actions does not expose repository secrets.

**`env:validate` MUST run in**: `preview-deploy.yml`, `prod-deploy.yml` — after `vercel pull` has written the deployment env to `.vercel/.env.{env}.local`.

**`env:validate` MUST NOT run in**: `pr-validation.yml` — no deployment env context exists; validation would always fail.

### Correct Placement

```yaml
# preview-deploy.yml / prod-deploy.yml — CORRECT
- name: Environment Consistency
  run: pnpm env:check
- name: Environment Cross-Field Validation
  run: pnpm env:validate # runs AFTER vercel pull
  env:
    NODE_ENV: production
    APP_ENV: preview # or production
```

```yaml
# pr-validation.yml — CORRECT (env:validate is intentionally absent)
- name: Environment Consistency
  run: pnpm env:check
# env:validate omitted — it is a deploy gate, not a code quality gate
```

### Rule for Agents

Do not add `env:validate` to PR validation workflows. It belongs only in deploy-gating workflows where `vercel pull` has already populated the deployment environment.

---

## SEC-14 — UUID Test Fixtures Must Use Valid v4 Format

**ID**: SEC-14
**Category**: Test fixture correctness / schema alignment

### Rule

When a field is validated with `z.uuid()` (which enforces RFC 4122 v4 format), all test fixtures for that field must use a genuine v4 UUID.

A v4 UUID has the form `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` where:

- Position 3 (after the second `-`) starts with `4`
- The first character of position 4 is one of `8`, `9`, `a`, or `b`

### Correct Pattern

```typescript
const VALID_UUID =
  'f47ac10b-58cc-4372-a567-0e02b2c3d479'; /* RFC 4122 v4 UUID */
```

### Incorrect Pattern

```typescript
const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'; // NOT v4 — position 3 is '12d3', not '4xxx'
```

### Rule for Agents

Always use a valid v4 UUID in test fixtures for fields validated with `z.uuid()`. Non-v4 UUIDs pass Zod's `z.uuid()` check at runtime in some versions but misalign the test intent with the schema contract and can cause unexpected failures if schema enforcement tightens.

---

## SEC-15 — Never Guard User-Controlled Record Lookups With `key in plainObject`

**ID**: SEC-15
**Category**: Object access / prototype-chain trust boundary
**Classification**: Fixed — verified 2026-08-22, not left indeterminate as
"latent risk" (A.8 follow-up review explicitly asked for this entry to be
reclassified either FIXED-with-test or ACCEPTED/NOT-REACHABLE-with-evidence).
The repository's one concrete instance of this pattern,
`src/app/auth/bootstrap/page.tsx`'s `ERROR_BY_REASON` lookup, already uses
the correct `Object.hasOwn(ERROR_BY_REASON, reason)` guard, not `reason in
ERROR_BY_REASON` — confirmed by reading the current file, not assumed, and
by a repo-wide grep for `<identifier> in <PLAIN_OBJECT_LOOKUP_TABLE>` that
found no other user-controlled-key guard using the dangerous pattern
anywhere in `src/`. This entry stays in the document as the rule for any
_future_ lookup table indexed by request/query input — the dangerous
pattern below is a pattern to keep rejecting, not a currently-open finding.
**Surface**: Auth/bootstrap mappings, route-handler lookup tables, any plain-object record indexed by request or query input

### Scanner / Review Signal

This pattern often appears as `security/detect-object-injection`, but the deeper issue is not generic object injection. The real problem is trusting `key in plainObject` as a safe membership guard for a user-controlled string before reading `plainObject[key]`.

### Why This Is Risky

- The `in` operator walks the prototype chain.
- User-controlled keys like `toString`, `constructor`, or other inherited names satisfy `key in obj` even when they are not intended application keys.
- If the code then reads `obj[key]`, the guard has accepted inherited properties rather than only the repository's explicit allowlist.
- This is a trust-boundary bug even when the lookup is read-only.

### Dangerous Pattern (DO NOT use)

```typescript
const ERROR_BY_REASON: Record<string, BootstrapError> = {
  quota_exceeded: 'quota_exceeded',
  db_error: 'db_error',
};

if (reason && reason in ERROR_BY_REASON) {
  return ERROR_BY_REASON[reason];
}
```

### Correct Patterns

Use one of these instead:

```typescript
if (reason && Object.hasOwn(ERROR_BY_REASON, reason)) {
  return ERROR_BY_REASON[reason as keyof typeof ERROR_BY_REASON];
}
```

```typescript
const ERROR_BY_REASON = Object.assign(Object.create(null), {
  quota_exceeded: 'quota_exceeded',
  db_error: 'db_error',
}) as Record<string, BootstrapError>;
```

```typescript
const errorByReason = new Map<string, BootstrapError>([
  ['quota_exceeded', 'quota_exceeded'],
  ['db_error', 'db_error'],
]);

const resolved = reason ? errorByReason.get(reason) : undefined;
if (resolved) return resolved;
```

### Rule for Agents

**DO NOT** validate a user-controlled key with `key in plainObject` and then read `plainObject[key]`.

**DO** use `Object.hasOwn`, a null-prototype record, or a `Map` for user-controlled key lookups.

**Relationship to SEC-04**: SEC-04 covers dynamic method dispatch and explicit dispatch maps. SEC-15 covers read-only lookup tables where the key itself is untrusted and must not be accepted through the prototype chain.

---

## SEC-16 — Reusable `fs.*` Helpers Must Enforce Path Confinement At The Sink

**ID**: SEC-16
**Category**: File access / path confinement
**Classification**: Fixed — verified 2026-08-22, not left indeterminate as
"latent risk" (A.8 follow-up review explicitly asked for this entry to be
reclassified either FIXED-with-test or ACCEPTED/NOT-REACHABLE-with-evidence).
The repository's concrete instance, `src/core/logger/utils.ts`'s
`ensureLogDirectory()`/`createFileStream()`, already resolves and confines
every path argument at the sink via `assertPathWithinBase()` /
`resolvePathWithinBase()` — the exact "Correct Pattern" shape below, not
the dangerous unconfined shape — confirmed by reading the current file, not
assumed. `src/core/logger/utils.test.ts` has a dedicated regression test
("should reject paths that escape the workspace root", asserting
`ensureLogDirectory('../logs')` returns `false`) and a matching one for
`createFileStream('test.log', '../logs')` returning `null`. This entry
stays in the document as the rule for any _future_ reusable fs helper that
accepts a dynamic path argument — the dangerous pattern below is a pattern
to keep rejecting, not a currently-open finding.
**Surface**: Reusable helpers in runtime code or scripts that accept a path, directory, or filename argument and call `fs.*`

### Review Signal

Some `security/detect-non-literal-fs-filename` findings are true false positives because the path is a static literal. This rule is different: when a reusable helper accepts a path-like argument, caller assumptions are not enough. The helper itself must resolve and confine the path before `fs.*` access.

### Why This Is Risky

- Callers can drift from today's static inputs to tomorrow's env-driven or operator-provided values.
- If the helper performs `fs.existsSync`, `fs.mkdirSync`, `fs.readFileSync`, or similar on a joined path without confinement, the sink remains vulnerable to future misuse.
- Upstream validation is not a substitute for point-of-use guards.

### Dangerous Pattern (DO NOT use)

```typescript
function ensureLogDirectory(logDir: string): boolean {
  const logDirectory = path.join(process.cwd(), logDir);
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
  }
  return true;
}
```

### Correct Pattern

```typescript
function assertPathWithinBase(resolvedPath: string, baseDir: string) {
  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(resolvedPath);
  const expectedPrefix = normalizedBase.endsWith(path.sep)
    ? normalizedBase
    : normalizedBase + path.sep;

  if (
    normalizedPath !== normalizedBase &&
    !normalizedPath.startsWith(expectedPrefix)
  ) {
    throw new Error(`Path escapes allowed base: ${normalizedPath}`);
  }
}

function ensureLogDirectory(logDir: string): boolean {
  const baseDir = process.cwd();
  const resolvedPath = path.resolve(baseDir, logDir);
  assertPathWithinBase(resolvedPath, baseDir);

  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(resolvedPath, { recursive: true });
  }
  return true;
}
```

### Rule for Agents

**DO NOT** rely on caller-side assumptions that a helper path argument is static or already validated.

**DO** resolve and confine path-like arguments inside the helper immediately before the `fs.*` sink.

**Relationship to SEC-05 / SEC-12**: SEC-05 covers true false positives for static literal paths. SEC-12 sets the repository script convention to use `path.resolve`. SEC-16 adds the missing sink-level rule for reusable helpers that accept dynamic path arguments.

---

## SEC-17 — Rate-Limit WARN Must Propagate `path` for Edge-Log Loop Prevention

**ID**: SEC-17
**Category**: Observability / Rate Limiting
**Classification**: Real risk → fixed
**Affected area**: `src/shared/lib/rate-limit/rate-limit-helper.ts`, `src/security/middleware/with-rate-limit.ts`

### Problem

`checkRateLimit()` originally logged its Upstash timeout WARN without a `path` field in the context object. The edge-log forwarding guard in `src/core/logger/edge-utils.ts` suppresses forwarding when `payload.context.path === '/api/logs'`. Without `path`, this evaluates to `undefined === '/api/logs'` → **false** → the WARN is forwarded to `/api/logs` → which triggers another rate-limit check → another WARN → infinite recursive log flood.

During a sustained Upstash outage this cascade can exhaust BetterStack, New Relic, and Upstash request quotas in minutes.

### Incorrect Fix (Rejected)

Adding a `SELF_RATE_LIMITED_PATHS = ['/api/logs']` bypass that skips rate limiting entirely for `/api/logs`. This removes protection from a high-frequency endpoint and was reverted.

### Correct Pattern

`checkRateLimit()` accepts `meta?: { path?: string }` and includes `path` in the WARN context:

```typescript
export async function checkRateLimit(
  identifier: string,
  meta?: { path?: string },
): Promise<RateLimitResult> {
  // ...
  getLogger().warn(
    {
      provider: 'upstash',
      identifier,
      timeoutMs: UPSTASH_RATE_LIMIT_TIMEOUT_MS,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      ...(meta?.path !== undefined ? { path: meta.path } : {}),
    },
    'Rate limit provider unavailable, using local fallback',
  );
}
```

`withRateLimit` passes the request pathname unconditionally:

```typescript
const result = await checkRateLimit(ip, { path: pathname });
```

### Rule for Agents

**DO NOT** add a bypass list (`SELF_RATE_LIMITED_PATHS` or equivalent) for internal endpoints to work around log forwarding loops. The correct fix is propagating `path` in the log context so the existing loop-prevention guard can function correctly.

**DO** always pass `meta.path` when calling `checkRateLimit()` from a request-aware context. Omitting it silently re-opens the loop prevention gap.

**DO NOT** use raw `error` objects in WARN context — extract `errorMessage: error.message` and `errorName: error.name` as separate string fields (SEC-10).

**Relationship to SEC-10**: The WARN context fix also brings this call site into compliance with SEC-10 (no raw error objects in logger calls).

---

## SEC-18 — Tooling Env Access: Dynamic `process.env[key]` Must Be Shifted Left

**ID**: SEC-18
**Category**: Tooling / Environment Access
**Classification**: Local lint-backed workflow
**Affected area**: `scripts/**`, `e2e/**`

### Problem

Recurring Codacy `security/detect-object-injection` findings in `scripts/**` and `e2e/**` often come from dynamic environment lookups such as:

```typescript
const value = process.env[key];
const value = process.env[name];
```

These cases are usually not a direct exploit by themselves, but they hide which environment variables are intentionally allowed and repeatedly burn review time.

### Correct Pattern

Prefer a typed or allowlisted helper so the env contract stays visible in code review:

```typescript
const REQUIRED_ENV = {
  clerkSecretKey: 'CLERK_SECRET_KEY',
  clerkPublishableKey: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
} as const;

function readRequiredEnv(key: keyof typeof REQUIRED_ENV): string {
  const value = process.env[REQUIRED_ENV[key]];
  if (!value) throw new Error(`Missing env: ${REQUIRED_ENV[key]}`);
  return value;
}
```

Or, when dynamic access is still required, contain it behind a narrow typed resolver:

```typescript
type AllowedEnvName = 'LEANTIME_HOST' | 'LEANTIME_API_KEY';

function readEnv(name: AllowedEnvName): string | undefined {
  return process.env[name];
}
```

### Local Lint Workflow

The repository now uses a scoped local ESLint rule in `eslint.config.mjs` for `scripts/**` and `e2e/**` to surface dynamic `process.env[key]` access before PR review.

This rule is intentionally narrower than Codacy. The goal is not scanner parity. The goal is to catch recurring review churn locally when the AST signal is stable and low-noise.

### Gain Tracking

When this rule is involved, track these metrics in the active task artifact package:

- number of local ESLint warnings from the covered class
- number of Codacy findings from the same class on the PR
- number of new inline suppressions added for security rules

### Rule for Agents

**DO NOT** introduce raw `process.env[key]` or `process.env[name]` in `scripts/**` and `e2e/**` when a typed or allowlisted helper is practical.

**DO** prefer a narrow helper that makes the allowed env contract visible in local lint and code review.

---

## SEC-19 — File Access: Scripts And E2E Must Prefer Shared Sink-Confined Fs Helpers

**ID**: SEC-19

### Scanner Finding

> The application dynamically constructs file or path information.

### Why This Pattern Needs More Than Another ESLint Selector

The remaining `security/detect-non-literal-fs-filename` findings in this repository are not concentrated in one AST shape. They appear across:

- `existsSync(resolve(path))`
- `readFileSync(resolvedPath)`
- `writeFile(...)` / `mkdir(...)` in `node:fs/promises`
- `createReadStream(safePath)` after prior confinement

A broader local ESLint selector would be noisy and would still fail to distinguish:

- static repository-owned paths
- cwd-confined dynamic paths
- tempdir-confined artifacts
- test-only temp fixtures

The durable repository pattern is therefore:

1. keep the current narrow local lint for bare identifier fs sinks
2. move repeated direct fs access in `scripts/**` and `e2e/**` into shared helper wrappers
3. enforce sink-level `path.resolve()` + confinement inside those helpers
4. scope local ESLint exceptions only to the approved helper sink modules themselves

### Correct Pattern

Prefer small shared wrappers such as:

```typescript
const safePath = assertPathWithinBase(filePath, baseDir, 'artifact path');
return readFileSync(safePath, 'utf8');
```

and call them from scripts instead of repeating raw `fs.*` access at each call site.

This keeps path validation at the sink and collapses scanner noise into a small number of reviewed helper locations.

Approved helper sink modules may disable the local broad fs-sink warnings for themselves, but only when they are the centralized reviewed wrapper layer. Call sites should continue to be linted.

### Rule for Agents

In `scripts/**` and `e2e/**`:

- **DO** prefer shared fs helper wrappers with sink confinement for repeated file access patterns
- **DO** keep the path guard at the helper sink, not only at CLI intake
- **DO NOT** add a broader local ESLint selector for all non-literal fs arguments unless a future finding set shows one high-signal repeated AST shape
- **DO NOT** scatter new raw `fs.*` calls with ad hoc safety comments when an existing helper shape already fits
  **Category**: File Access / Tooling
  **Classification**: Local lint-backed workflow
  **Affected area**: `scripts/**`, `e2e/**`

### Problem

Recurring Codacy `security/detect-non-literal-fs-filename` findings in `scripts/**` and `e2e/**` collapse many different situations into one noisy bucket. The repository needs a narrower local signal that highlights the sink shape reviewers repeatedly inspect:

```typescript
fs.readFileSync(filePath, 'utf8');
fs.existsSync(resolved);
readFileSync(filePath, 'utf8');
```

This pattern alone does not prove path traversal. In this repository it is frequently safe because the path is already confined.

### Correct Pattern

Before any dynamic `fs.*Sync(...)` sink in scripts or E2E helpers:

1. resolve the path from a controlled base
2. confine it at the sink or immediately before the sink
3. keep the confinement helper visible in the same code path

```typescript
const resolved = path.resolve(ROOT_DIR, relativePath);
assertPathWithinBase(resolved, ROOT_DIR);

if (!fs.existsSync(resolved)) {
  return null;
}

const content = fs.readFileSync(resolved, 'utf8');
```

### Local Lint Workflow

The repository now uses a scoped local ESLint rule in `eslint.config.mjs` for `scripts/**` and `e2e/**` to flag bare identifier arguments at `fs.*Sync(...)` sinks.

This is intentionally narrower than Codacy. It exists to surface review-heavy path provenance cases locally, not to replace sink-level confinement rules such as SEC-16.

### Gain Tracking

When this rule is involved, track these metrics in the active task artifact package:

- number of local ESLint warnings from the covered fs-sink class
- number of Codacy `security/detect-non-literal-fs-filename` findings still left after the local warning is introduced
- number of new helper-level suppressions versus actual path-hardening edits

### Rule for Agents

**DO NOT** treat a local fs-sink warning as automatic proof of vulnerability.

**DO** make path provenance and sink confinement explicit before suppressing or ignoring the warning.

---

## SEC-20 — Dynamic Object Transformation In `src/**` Should Favor Entries, Maps, Or Explicit Switches

**ID**: SEC-20
**Category**: Object Access / Runtime Helper Design
**Classification**: AI-pattern backed workflow
**Affected area**: `src/**` runtime helpers, sanitizers, adapters, wrappers

### Problem

The heaviest Phase 2 Codacy noise in `src/**` came from repeated patterns like:

```typescript
result[key] = value;
errors[path].push(message);
const label = LEVEL_VALUES[level];
```

Many of these are not direct vulnerabilities by themselves. The real problem is that repeated bracket reads and writes on plain objects produce high scanner noise and force repeated manual review of the same safe shapes.

### Correct Pattern

When transforming objects with dynamic or derived keys in runtime helpers:

1. prefer `Object.entries(...)` plus `Object.fromEntries(...)` for shape-preserving transforms
2. prefer `Map` for keyed accumulation such as grouped validation errors
3. prefer explicit `switch` helpers for finite unions when selecting values or behavior

Examples:

```typescript
const sanitizedEntries: Array<[string, unknown]> = [];

for (const [key, value] of Object.entries(source)) {
  if (isBlocked(key)) continue;
  sanitizedEntries.push([key, transform(value)]);
}

return Object.fromEntries(sanitizedEntries);
```

```typescript
const errorMap = new Map<string, string[]>();

for (const issue of error.issues) {
  const path = issue.path.join('.');
  const existing = errorMap.get(path);
  if (existing) existing.push(issue.message);
  else errorMap.set(path, [issue.message]);
}

return Object.fromEntries(errorMap);
```

```typescript
function getLevelValue(level: Level): number {
  switch (level) {
    case 'trace':
      return 10;
    case 'debug':
      return 20;
    case 'info':
      return 30;
    case 'warn':
      return 40;
    case 'error':
      return 50;
    case 'fatal':
      return 60;
  }
}
```

### Do Not Overreach

Do **not** add a broad local ESLint ban on every `obj[key]` read or write in `src/**`.
That would recreate Codacy noise locally. This pattern is enforced primarily through AI instructions and review discipline, not a generic AST ban.

### Rule for Agents

**DO NOT** default to repeated `result[key] = ...` or `plainObject[key]` mutation chains in `src/**` runtime helpers when an entries-based transform, `Map`, or explicit `switch` would express the same behavior more clearly.

**DO** use entries-based transforms, `Map`, or explicit `switch` helpers to keep Phase 2 object-access churn out of future Codacy runs.

---

## SEC-26 — ABAC Action Checks Must Also Constrain Resource Scope, Not Just Action Type

**ID**: SEC-26
**Category**: Authorization / tenancy
**Classification**: Real risk — shipped to `main` in the Admin Feature Flags GUI PR (#70), caught post-merge by automated review, fixed as a follow-up
**Affected contexts**: any admin/tenant-scoped route handler or service where authorization is granted via an ABAC/RBAC policy check (`AuthorizationService.can()` or equivalent) rather than exclusively via a platform-wide admin override

### Risk

`checkAdminAccess()`-style helpers in this repository correctly branch on two distinct
grants: an environment-based platform admin override (`isEnvBasedPlatformAdmin(email)`,
which is intentionally unscoped — full access by design) and an ABAC policy check
(`authzService.can({ tenant: { tenantId: access.tenant.tenantId }, ... })`, which is
scoped to the caller's own tenant by construction). Both paths return the same boolean.

That boolean answers **"is this action type allowed for this subject"** — it does not
answer **"is this specific record, tenant, or scope allowed for this subject."** When
the mutation itself accepts a client-supplied scope identifier (a `tenantId` in the
request body, an `id` path param naming a row that may belong to another tenant or be
global) and passes it straight into the DB write without cross-checking it against the
verified `access.tenant.tenantId`, an ABAC-authorized tenant owner inherits the same
practical reach as a platform admin — silently, for any resource type the pattern is
copied to.

This is not the SEC-23 "raw route param into a UUID predicate" defect (SEC-23 is about
input _validity_; SEC-26 is about input _authority_, even when the ID is a syntactically
valid, real row). Both can be present in the same route handler.

### Dangerous Pattern

```typescript
// POST /api/admin/feature-flags
const isAdmin = await checkAdminAccess(
  access.identity.email,
  access.user.id,
  access.tenant.tenantId,
  container,
  ACTIONS.FEATURE_FLAG_MANAGE,
);
if (!isAdmin) return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');

// isAdmin only proves "can this subject manage feature flags", not "for which tenant".
// A tenant-owner (ABAC path, not platform admin) can still request tenantId: null
// (global) or another tenant's ID here — the check above never looked at it.
const flag = await service.create({
  key: parseResult.data.key,
  tenantId: parseResult.data.tenantId ?? null, // client-supplied, unconstrained
  enabled: parseResult.data.enabled,
  description: parseResult.data.description ?? null,
});
```

```typescript
// PATCH/DELETE /api/admin/feature-flags/[id]
// Same isAdmin gate as above, then:
await service.update(idResult.data.id, input); // predicate matches `id` alone —
// any row's ID reachable via GET can be mutated once *any* MANAGE grant exists,
// regardless of which tenant that grant was scoped to.
```

### Correct Pattern

Distinguish the two grant shapes explicitly and constrain the mutation's scope to what
was actually verified. Platform admins keep full cross-tenant/global reach (that is the
intended, audited exception); ABAC-authorized callers do not.

```typescript
const isPlatformAdmin = isEnvBasedPlatformAdmin(access.identity.email);
const isTenantAuthorized =
  isPlatformAdmin ||
  (await authzService.can({
    tenant: { tenantId: access.tenant.tenantId },
    subject: { id: access.user.id },
    resource: { type: RESOURCES.FEATURE_FLAG, id: 'admin-panel' },
    action: ACTIONS.FEATURE_FLAG_MANAGE,
  }));

if (!isTenantAuthorized) {
  return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
}

const requestedTenantId = parseResult.data.tenantId ?? null;
if (!isPlatformAdmin && requestedTenantId !== access.tenant.tenantId) {
  // ABAC-authorized callers may only act within their own verified tenant —
  // never a global (null) row and never another tenant's row.
  return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
}

const flag = await service.create({
  key: parseResult.data.key,
  tenantId: requestedTenantId,
  enabled: parseResult.data.enabled,
  description: parseResult.data.description ?? null,
});
```

For `[id]`-keyed mutations, load the row first (or add the tenant predicate directly to
the `update`/`delete` `where` clause) and compare its `tenantId` against
`access.tenant.tenantId` before mutating, unless the caller is a platform admin.

### Required Validation

Every ABAC-gated admin mutation that accepts a scope identifier (a body `tenantId`, an
org/tenant field, or an `id` naming a row that carries tenant ownership) must have a
regression test proving: an ABAC-authorized-but-not-platform-admin caller who supplies
a foreign or global scope is rejected (`403`), not merely that an unauthorized caller
with no grant at all is rejected. A test that only exercises "no grant → 403" and
"platform admin → 200" leaves this exact gap uncovered.

### Rule for Agents

**DO** derive the mutation's tenant/resource scope from the server-verified access
context (`access.tenant.tenantId` or an equivalent verified claim), not from a
client-supplied identifier, whenever the grant came from an ABAC/RBAC policy check
rather than an unscoped platform-admin override.

**DO** write both grant paths (unscoped platform-admin vs. scoped ABAC) as explicitly
different code paths with different reach, when a route/service supports both.

**DO NOT** treat "the ABAC action check returned true" as sufficient authorization for
an arbitrary client-supplied scope or record ID. An action-type grant is not a
resource-scope grant.

**DO NOT** assume this is covered by existing "authorization must be enforced
server-side" review — that catches missing checks, not checks that are present but too
coarse. Ask explicitly: "authorized to do X in general, or authorized to do X to
_this_ tenant/record?"

---

## SEC-27 — Mutating Admin Routes Must Not Skip Authorization Just Because a Sibling Route Has It

**ID**: SEC-27
**Category**: Authorization
**Classification**: Real risk — found while wiring audit-logging instrumentation (2026-08-20), fixed same day
**Affected contexts**: `/api/admin/**` route handlers, especially a `POST`/`PATCH`/`DELETE` handler that lives in the same file or directory as a `GET` handler which does have an authorization check

### Risk

`src/app/api/admin/waitlist/[id]/route.ts`'s `POST` handler (approve/reject a
waitlist entry) had **no admin authorization check of any kind**. Its sibling
`GET /api/admin/waitlist` (`src/app/api/admin/waitlist/route.ts`) calls
`checkAdminAccess()` — the standard `isEnvBasedPlatformAdmin(email)` OR
`authzService.can({ action: ACTIONS.SECURITY_MANAGE_POLICIES, ... })` gate used
across every other `/api/admin/**` route. `POST` only passed through
`withNodeProvisioning`, which verifies the caller is authenticated and
provisioned (onboarded, has tenant context) — **not** that they hold any admin
grant. This is a different defect shape from SEC-26: SEC-26 is about an
authorization check that exists but is scoped too coarsely; this is about a
mutating endpoint with **no** authorization check at all, sitting right next to
a sibling handler that has the correct one — the kind of gap that's easy to miss
precisely because "this resource is admin-gated" reads as true at a glance
(the directory is under `/api/admin/`, the neighboring `GET` is gated, the page
that links to it is behind the `/admin` layout guard) when in fact one specific
handler was never wired.

Concretely, before the fix: any authenticated, provisioned, non-admin user
could call `POST /api/admin/waitlist/[id]?action=approve` directly (this route
is not protected by the `/admin` page layout's guard — that guard wraps page
rendering only, not this API route) and create a real invitation email to
whichever organization/role the approval resolved to, or call `?action=reject`
to send a rejection email on the product's behalf for an arbitrary entry.

### Dangerous Pattern

```typescript
// GET has the check:
export const GET = withErrorHandler(
  withNodeProvisioning(async (_request, _context, access) => {
    const isAdmin = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
    );
    if (!isAdmin)
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    // ...
  }),
);

// POST in the sibling [id]/route.ts — no isAdmin check, no `access` even used:
export const POST = withErrorHandler(
  withNodeProvisioning(async (_request, context) => {
    // straight into business logic — withNodeProvisioning only proves
    // "authenticated + provisioned", never "admin"
    const entry = await waitlistService.approveEntry(id);
    // ...
  }),
);
```

### Correct Pattern

Every mutating `/api/admin/**` handler must call the same admin-authorization
gate its sibling handlers use, even if that means duplicating (not sharing
mutable state with) the check into a file that doesn't otherwise import it:

```typescript
export const POST = withErrorHandler(
  withNodeProvisioning(async (_request, context, access) => {
    await connection();

    const container = getAppContainer();
    const isAdmin = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
    );
    if (!isAdmin) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    // ... business logic, now behind a real admin gate
  }),
);
```

`checkAdminAccess` itself is duplicated per route file across this codebase
(see `feature-flags/route.ts` and `feature-flags/[id]/route.ts`, which each
have their own local copy) rather than shared via an import — matching that
existing convention is correct here, not a shortcut.

### Required Validation

Every `/api/admin/**` route file must have at least one test asserting a
non-admin, authenticated-and-provisioned caller gets `403` from **every**
exported HTTP method in that file, not just the ones that already had a test.
A file with a tested `GET` and an untested `POST`/`PATCH`/`DELETE` is exactly
the blind spot this incident came from — the existing test suite's green
result said nothing about the untested handler.

### Rule for Agents

**DO** check, for every exported HTTP method handler in an `/api/admin/**`
route file, whether it calls an admin-authorization gate — do not assume
"this directory is admin-gated" or "the sibling handler checks it" extends
protection to a handler that never calls the check itself.

**DO** treat a missing authorization check as a `security-incident-workflow`
finding, distinct from whatever task you were doing when you found it (in this
case, audit-log instrumentation) — report it and let the change ship as its
own reviewable diff, not folded into an unrelated commit.

**DO NOT** assume a route is safe because it lives under `/api/admin/` or
because the corresponding UI page is behind `src/app/admin/layout.tsx`'s
guard — that guard protects page rendering only, never the underlying API
route, which remains directly callable by anyone who can reach it.

---

## SEC-28 — SSRF Guard Must Cover IPv6/Link-Local Ranges and Resolve-Before-Fetch

**ID**: SEC-28
**Category**: SSRF
**Classification**: Real risk — found during a repository-wide security audit
(2026-08-21); the same-day fix below was itself incomplete (a TOCTOU plus an
unrelated redirect bypass — see "Update 2026-08-21"), corrected same day;
a second review (2026-08-22, "Update 2026-08-22 (A.8)") found the
private-address check's IP-literal normalization was itself broken
(bracketed IPv6 literals silently bypassed it), plus missing cross-origin
credential stripping, timeout, and response-size bounds — all corrected
**Affected contexts**: `src/security/outbound/secure-fetch.ts` and any future
outbound-fetch helper that accepts a URL derived, even indirectly, from
request input

### Risk

`secureFetch()`'s private-address check was an IPv4-only regex covering
RFC1918 + the literal string `localhost`. It missed IPv6 loopback (`::1`),
IPv6 link-local (`fe80::/10`), IPv4 link-local (`169.254.0.0/16` — notably
the cloud-metadata address range), `0.0.0.0`, and IPv4-mapped IPv6
(`::ffff:10.0.0.1`). It also only checked the **literal hostname**, never
what that hostname actually **resolves to** — an allowlisted-looking domain
name is not evidence the address it resolves to at fetch time is safe
(classic DNS-rebinding: attacker controls the DNS record for a domain that
passes the allowlist check, points it at an internal address).

This is a live risk, not theoretical, in this repository:
`src/app/api/security-test/ssrf/route.ts` is a public, unauthenticated route
(see `PUBLIC_ROUTE_PREFIXES` in `route-policy.ts`) that takes a raw `?url=`
query parameter and passes it straight into `secureFetch()` — anyone on the
internet could probe it (see SEC-29 for how that route is now gated).

### Correct Pattern

Two additions, both required — hardening the literal-address predicate alone
does not close the DNS-rebinding gap:

```typescript
function isPrivateOrReservedAddress(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  const ipv4Mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  const ipv4Candidate = ipv4Mapped ? ipv4Mapped[1] : normalized;

  const isPrivateIPv4 =
    /^(?:10|127|0|169\.254|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168)\./.test(
      ipv4Candidate,
    );
  const isPrivateIPv6 =
    normalized === '::1' ||
    normalized === '::' ||
    /^fe[89ab][0-9a-f]:/.test(normalized) ||
    /^f[cd][0-9a-f]{2}:/.test(normalized);

  return isPrivateIPv4 || isPrivateIPv6 || normalized === 'localhost';
}

// Resolve-then-check: re-run the same predicate against what the hostname
// actually resolves to, not just its literal text. Fail closed on a
// resolution error.
async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  if (isIpLiteral(hostname)) return false;
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.some((r) => isPrivateOrReservedAddress(r.address));
  } catch {
    return true; // fail closed — cannot confirm safety
  }
}
```

> ⚠️ The `resolvesToPrivateAddress()` shape above resolves-and-checks but
> then discards the result, handing the bare hostname back to `fetch()` —
> which resolves it again independently. That gap (plus an unrelated
> redirect bypass) is corrected in "Update 2026-08-21" below; this block is
> kept for the private/reserved-address predicate, which is still correct,
> not as a template for the resolve step.

### False-Positive Scanner Note

The bounded-quantifier regexes above (`{1,3}`, fixed `{3}` repetition, no
nested unbounded groups) trip `security/detect-unsafe-regex` as a false
positive — this is linear-time matching against a length-bounded hostname
string, not catastrophic backtracking. Suppress with a scoped
`eslint-disable-next-line security/detect-unsafe-regex` and a comment
pointing back to this entry, same convention as SEC-01/SEC-05. Do not rewrite
the regex into something more "scanner-friendly" that's harder to read —
the pattern itself is correct.

### Rule for Agents

**DO** treat "hostname is on the allowlist" and "hostname is not a private
IP literal" as two separate, both-required checks from "the address this
request will actually reach is safe." Any new outbound-fetch helper that
takes a URL touched by request input needs the resolve-then-check step, not
just the literal-string check. **DO NOT** silently drop the DNS-resolution
step to fix a slow test or a sandbox without network access — mock
`node:dns/promises`'s `lookup`, don't skip the check it backs.

### Update 2026-08-21 — "Resolve-Then-Check" Above Did Not Actually Close The Gap; Plus An Unrelated Redirect Bypass

An external security review of this branch caught two real problems in the
fix shipped earlier the same day above — both confirmed by reproducing them
locally before fixing, not taken on faith:

**1. The resolve-then-check pattern was a TOCTOU, not a fix.**
`resolvesToPrivateAddress()` resolved the hostname, checked the result, and
then threw the result away — the actual request still went out as
`fetch(targetUrl, init)`, i.e. by hostname, not by the validated address.
Node's `fetch` resolves DNS again, independently, deep inside its own HTTP
client, at connect time. Between those two lookups there is a window: an
attacker who controls the DNS record for an allowlisted-looking hostname can
serve a public address to the check and a private one to the actual
connect. "Resolve, check, then fetch the same hostname" only proves the
hostname resolved safely _once_ — it proves nothing about what it resolves
to a moment later. This is exactly what "DNS rebinding" means, and the
original fix's own name for itself ("resolve-then-check... closes the
DNS-rebinding gap") over-promised what it actually did.

**2. A validated host could redirect anywhere, unchecked.**
`fetch(targetUrl, init)` used the default redirect mode
(`follow`) with no override. A 302 from an allowlisted, correctly-validated
host straight to `http://169.254.169.254/...` (or any other private/
disallowed target) was followed automatically, with zero re-validation —
the entire allowlist + private-address guard applied only to the URL the
caller originally passed in, never to where a redirect actually sent the
request.

**The fix — pin the connection, don't just check a discarded resolution;
validate every redirect hop the same way as the original URL:**

```typescript
// resolveAndValidateHost() now RETURNS the validated address instead of
// throwing it away — the only way the caller actually knows what to pin to.
async function resolveAndValidateHost(
  hostname,
  urlForLogging,
): Promise<PinnedAddress> {
  // ...allowlist + literal-IP checks unchanged...
  const records = await lookup(hostname, { all: true, verbatim: true });
  // ...private-address check over `records` unchanged...
  const [chosen] = records;
  return { address: chosen.address, family: chosen.family === 6 ? 6 : 4 };
}

// A dns.lookup-shaped resolver that always returns the one address already
// validated, regardless of what hostname is asked. Handed to a per-request
// undici Agent as connect.lookup — net.connect's own DNS step is
// short-circuited to that exact address, so there is no second query left
// to race. The hostname itself is untouched everywhere else (URL, Host
// header, TLS SNI/servername), so certificate validation keeps working.
function buildPinnedLookup(pinned: PinnedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all)
      callback(null, [{ address: pinned.address, family: pinned.family }]);
    else callback(null, pinned.address, pinned.family);
  };
}

// secureFetch(): redirect: 'manual' + a bounded loop that re-runs
// resolveAndValidateHost() on every hop's target before following it.
for (;;) {
  const pinned = await resolveAndValidateHost(
    currentUrl.hostname,
    currentUrl.toString(),
  );
  const agent = new Agent({ connect: { lookup: buildPinnedLookup(pinned) } });
  try {
    const raw = await fetch(currentUrl, {
      ...currentInit,
      redirect: 'manual',
      dispatcher: agent,
    });
    if (!REDIRECT_STATUSES.has(raw.status)) {
      /* buffer + return */
    }
    // else: validate hopsRemaining, resolve Location against currentUrl,
    // loop back to the top — the new currentUrl.hostname goes through the
    // exact same resolveAndValidateHost() before anything connects to it.
  } finally {
    await agent.close();
  }
}
```

Verified two ways, not just by reasoning about the code: a unit suite
(`secure-fetch.test.ts`) covering redirect-follow, redirect-to-disallowed-
host rejection, redirect-to-rebound-address rejection, missing-Location
rejection, the `MAX_REDIRECTS` bound, and 303/301/302 method downgrading —
plus a dedicated wiring test (`secure-fetch.network.test.ts`) that mocks
`undici`'s `Agent` to capture the exact `connect.lookup` function built for
each hop and asserts it resolves to precisely the address that hop's
`resolveAndValidateHost()` call validated, never an earlier hop's address.
A true end-to-end real-socket test was considered and rejected: the only
address this sandbox can bind a test server to is loopback, which the
private-address check correctly refuses to connect to — fighting that check
for test convenience would be testing something other than what ships.

`undici` moved from `devDependencies` to `dependencies` in `package.json`
as part of this fix — it's now used in production runtime code
(`secure-fetch.ts`'s `Agent`), not just tooling.

### Rule for Agents (extended)

**DO** treat "validated" and "used for the connection" as the same address,
not two related-but-separate values — if a check resolves or validates an
address and the code that follows doesn't hand that exact value to whatever
performs the connection, the check is decorative. **DO** treat every
redirect hop from an outbound-fetch helper as a brand-new URL that needs
the full validation pipeline, not an extension of trust already granted to
the original URL — a validated host is not a validated destination if it
can redirect. **DO NOT** call a generic `fetch()`/HTTP client against a
security-sensitive target without either disabling automatic redirects and
validating each hop yourself, or being certain nothing reachable from that
target can 30x to somewhere unvalidated.

### Update 2026-08-22 (A.8) — `secureFetch()` Hardened Into a Real Central SSRF Primitive

A second external review of this PR gave qualified praise for the
direction above (DNS pinning, demo-route gating, the CSP nonce/hydration
E2E test) but a **HOLD** on `secureFetch()` specifically: not yet solid
enough to be the shared boilerplate's central SSRF primitive. Three
mandatory gaps, each verified empirically against the running code before
fixing — not taken on the review's word alone:

**1. IP-literal normalization was a real, confirmed bug, not a
theoretical concern.** `new URL('http://[::1]/').hostname` returns
`"[::1]"` **with brackets** (Node 22, WHATWG-spec-correct — `.host` and
`.hostname` both serialize a literal IPv6 address bracketed). A stale doc
comment on `isIpLiteral()` claimed the opposite ("unbracketed"). Traced
through the actual code: every regex in the old `isPrivateOrReservedAddress()`
(`normalized === '::1'`, `/^fe[89ab].../`, etc.) matched against a
hostname string starting with `[`, so **none of them ever matched a
literal IPv6 address**. The existing test "blocks IPv6 loopback... even
if allowlisted" (`secure-fetch.test.ts`) was passing for the wrong
reason: it configured the allowlist with the _unbracketed_ form, so the
request was rejected at the **allowlist** check
(`"[::1]" !== "::1"`), never reaching the private-address check the test
claimed to exercise. Had a bracketed IPv6 literal ever been allowlisted
(or reached this predicate via any other path), it would have sailed
through as "not private."

Fixed by stripping brackets once, up front (`stripBrackets()`), applied
consistently before every IP-literal check, and by replacing the whole
hand-maintained regex/CIDR list with `ipaddr.js`'s `.range()` classifier
under a **default-deny** posture: block anything that isn't exactly
`'unicast'`, instead of enumerating known-bad ranges that can (and did)
drift out of date. This closes CGNAT (100.64.0.0/10), the TEST-NET
ranges, 198.18.0.0/15 (benchmarking), multicast, reserved, broadcast,
NAT64 (`64:ff9b::/96`), and 6to4 (`2002::/16`) — none of which the old
list covered — by construction rather than by remembering to add each
one. `ipaddr.js` added as a real (not dev) dependency.

**2. Cross-origin redirects carried credentials forward verbatim.**
`requestInitForRedirect()` only adjusted `method`/`body` for 301/302/303
semantics — never touched `init.headers`. A caller-supplied
`Authorization` (or any credential-bearing header) was replayed on every
redirect hop, including a hop landing on a _different, but still
allowlisted_, origin — unlike a spec-compliant browser fetch, which
strips `Authorization` on a cross-origin redirect automatically. Because
`secureFetch()` uses `redirect: 'manual'` and manually replays the
request init, this repo — not the platform — owns reproducing that
behavior. Fixed: strip `Authorization`, `Cookie`, `Proxy-Authorization`,
and anything matching the token/secret/password/credential/session/
api-key pattern already established in `src/security/actions/redact.ts`
(exported and reused, not duplicated) whenever a redirect hop's origin
differs from the current one.

**3. No timeout, no response-size cap, and every log call leaked the
full URL.** `fetch()` was called with no `signal`; the final response was
always fully buffered via `arrayBuffer()` with no size check; every
`logger.error(...)` call in `resolveAndValidateHost()` logged the full
`currentUrl.toString()`, including query string — contradicting **SEC-22**'s
already-established "never log full one-time URLs or tokens" rule, just
never applied to this file. Fixed: an overall `AbortSignal.timeout()`
budget (`SECURITY_OUTBOUND_FETCH_TIMEOUT_MS`, default 10s) spanning every
redirect hop combined (not reset per hop), composed with a
caller-supplied signal via `AbortSignal.any()` when present; a bounded
stream reader (`SECURITY_OUTBOUND_FETCH_MAX_BYTES`, default 10MB)
replacing the unconditional full-buffer read; and a
`redactUrlForLogging()` helper (origin+pathname only) used at every log
call site.

**Follow-up, once the above landed**: a fourth-round Codacy pass flagged
3 medium-complexity findings on the resulting diff (`resolveAndValidateHost`
and `secureFetch` both over Codacy's method-length limit;
`ClerkProviderWithNonce` in `src/app/layout.tsx` over its parameter-count
limit, from earlier CSP work). Addressed by extracting `resolveViaDns()`,
`buildOverallSignal()`, `fetchHop()`, `prepareNextHop()`, and
`buildFinalResponse()` out of the two oversized functions, and by
grouping `ClerkProviderWithNonce`'s four redirect-URL props into one
object param — no behavior change, confirmed by the full test suite
staying green throughout (same pass count before and after). This
extraction is also what moved the SAST-flagged `fetch()` call into its
own `fetchHop()` function — see the "SAST Finding" note below for why the
false-positive verdict still holds after that move.

Verified: `pnpm test` (1558 passed) and `pnpm test:integration` (72
passed) green repo-wide at every step, not just the touched files; new
regression tests reproduce the bracket bug directly (allowlisting the
bracketed form that actually matches `URL.hostname`'s real output) and
cover the newly-classified ranges, cross-origin header stripping
(same-origin preserved, cross-origin stripped, non-sensitive headers
untouched), the timeout path, and the size cap (asserting the stream
reader never drains past it).

### SAST Finding — Reviewed and Accepted (2026-08-21, re-verified 2026-08-22 after A.8.1-4)

Codacy (via its `opengrep`/Semgrep-based analysis) flags a **critical
security** finding on this file: "This application allows user-controlled
URLs to be passed directly to HTTP client libraries," pointing at the
`fetch(currentUrl, {...})` call — originally inside `secureFetch()`'s
redirect loop directly; after A.8.1-4's complexity-driven extraction
(splitting `secureFetch()` to stay under Codacy's own method-length
limit), that same call now lives inside a small dedicated helper,
`fetchHop()`, called from the loop rather than inlined in it. **The
finding re-fired at the call's new location after that refactor** — worth
noting explicitly, because the finding is now flagging a call whose
validating caller is a different function, not a few lines up in the same
one, which is a meaningfully different (and to a naive scanner,
more-suspicious-looking) shape than before, even though the underlying
safety property is identical.

**Reviewed and accepted as a false positive both times, for a specific,
checkable reason** — not dismissed on assumption:

- Every single value `currentUrl` can hold when `fetchHop()`'s `fetch()`
  call executes — the original URL on the first iteration of
  `secureFetch()`'s loop, or a redirect target on every subsequent one —
  has, on that exact same loop iteration, immediately before `fetchHop()`
  is called, already gone through `resolveAndValidateHost()`: the
  allowlist check, the private/reserved-address check, and
  DNS-rebinding-safe resolution. A rejection there throws before the loop
  body ever reaches `fetchHop()` at all — `fetchHop()` never receives an
  unvalidated URL as its `currentUrl` parameter, confirmed by reading the
  control flow across both functions, not assumed, and covered by
  `secure-fetch.test.ts`'s redirect-to-disallowed-host and
  redirect-to-rebound-address tests, which assert the fetch mock is never
  even called for those cases.
- This is close to an inherent property of any correct SSRF-guard
  implementation: the guard has to call the underlying HTTP client
  _somewhere_, after its checks — a rule that pattern-matches "URL reaches
  fetch()" without tracing what validated it (and, now, without tracing
  across a function boundary to find that validation) will flag that call
  site in any correctly-written guard, this one included, regardless of
  whether the validation and the call live in one function or two. The
  pre-fix version of this same function had the identical shape (`return
fetch(targetUrl, init)` after equivalent checks, inline).

**What NOT to do in response to this class of finding**: don't restructure
or obscure the call to dodge the pattern-matcher — that trades real
clarity for a scanner appeasement with zero actual security benefit (same
philosophy as the regex false-positive notes above: fix the finding if
it's real, document why not if it's a false positive, never make working
code worse to satisfy a scanner that can't see the fix). If this
specific line's validation is ever weakened or reordered, re-evaluate
this note — it holds only as long as the control-flow property above still
holds.

**Follow-up outside this session's reach**: dashboard access (marking the
finding as a false positive / won't-fix in Codacy's UI) requires
Codacy-side credentials this session doesn't have — the repository owner
should do that in the dashboard if they agree with this assessment, per
the same access limitation noted for engine verification generally
(see the readiness-audit A4 item).

---

## SEC-29 — Demo/Showcase Routes Must Not Be Public By Default

**ID**: SEC-29
**Category**: Attack surface
**Classification**: Real risk — found during a repository-wide security audit
(2026-08-21), fixed same day
**Affected contexts**: `PUBLIC_ROUTE_PREFIXES` in
`src/security/middleware/route-policy.ts`, any future demo/showcase/example
route

### Risk

`PUBLIC_ROUTE_PREFIXES` included `/security-showcase`, `/sentry-example-page`,
`/feature-flags-demo`, `/env-summary`, and `/api/security-test/ssrf` —
teaching/demo routes meant to showcase the security architecture, not
application features. Being in `PUBLIC_ROUTE_PREFIXES` meant they were
reachable by anyone on the internet, unauthenticated, with no way to turn
that off short of a code change. `/api/security-test/ssrf` is the sharpest
case: it takes a raw `?url=` query parameter and passes it straight into
`secureFetch()` (see SEC-28) — a public, unauthenticated SSRF-guard oracle.
`/env-summary` discloses which integrations/config are present, which is
recon value even with secrets redacted.

### Correct Pattern

Demo routes get their own prefix list, gated by an env flag (default off in
every environment including production) plus normal authentication, instead
of living in `PUBLIC_ROUTE_PREFIXES`:

```typescript
// route-policy.ts
export const DEMO_ROUTE_PREFIXES = [
  '/env-summary',
  '/security-showcase',
  '/sentry-example-page',
  '/feature-flags-demo',
  '/api/security-test/ssrf',
] as const;
// NOT in PUBLIC_ROUTE_PREFIXES — they still require sign-in when the flag
// enables them, same as any other private route.
```

```typescript
// with-demo-guard.ts — runs BEFORE withAuth in the proxy pipeline
export function withDemoGuard(handler: ProxyHandler): ProxyHandler {
  return async (req, ctx) => {
    if (ctx.isDemoRoute && !env.DEMO_SHOWCASE_ENABLED) {
      return demoNotFound(req, ctx); // 404, not 403 — never confirm existence
    }
    return handler(req, ctx);
  };
}
```

The flag-off case runs pre-auth so an unauthenticated caller gets a plain
404 (route doesn't exist), never a sign-in redirect (route exists, requires
auth) — the latter still leaks that something is there. An optional
`DEMO_SHOWCASE_ALLOWED_EMAIL` check runs in a second guard positioned AFTER
`withAuth`, since it needs the resolved identity.

### Real Infrastructure Is Not A Demo Route

`/monitoring` looks like it belongs in this category by name but is
Sentry's `tunnelRoute` (`next.config.ts`) — real production error-reporting
infrastructure. It stays in `PUBLIC_ROUTE_PREFIXES` unconditionally. Gating
it the same way as the demo routes would silently break Sentry in
production. Always check what a route actually does before assuming a name
pattern implies "demo."

### Rule for Agents

**DO** default any new example/demo/showcase/diagnostic route to gated-off,
not public — public-by-default is the wrong starting assumption for
anything that exists to demonstrate the system rather than serve the
product. **DO NOT** gate a route just because its name sounds like a demo
(`/monitoring`) without first checking what it actually does.

---

## SEC-30 — Nonce-Based CSP script-src, Not Unconditional unsafe-inline/unsafe-eval

> **Renamed 2026-08-21 (A.7.1)**: `CSP_SCRIPT_STRICT_MODE` (boolean) is now
> `CSP_SCRIPT_MODE` (`'cache-compatible' | 'nonce-dynamic'`, default
> `'cache-compatible'`). Same behavior as the old `false` default — just a
> clearer contract (see SEC-31 for why). Everything below was written under
> the old name; read `CSP_SCRIPT_STRICT_MODE=true`/`false` as
> `CSP_SCRIPT_MODE='nonce-dynamic'`/`'cache-compatible'` respectively — kept
> as-written since it's an accurate historical record of the incident, not
> rewritten in place.

**ID**: SEC-30
**Category**: CSP hardening
**Classification**: Real risk → partially fixed, deferred (2026-08-21) — the
mechanics below are implemented and correct, but the flag (`CSP_SCRIPT_MODE`,
see rename note above) now defaults to `'cache-compatible'` because
`'nonce-dynamic'` is incompatible with this app's `cacheComponents`/PPR setup
(see "Update 2026-08-21" below). The originally-planned follow-up
("route-class CSP profiles" — different CSP per route on one origin) was
itself found unsound by external review and replaced by SEC-31's
origin-split guidance — see SEC-31 for the corrected plan.
**Affected contexts**: `src/security/middleware/with-headers.ts`,
`src/security/middleware/route-classification.ts`, `src/proxy.ts`,
`src/app/layout.tsx`, `src/security/rsc/csp-nonce.ts`

### Risk

`script-src` carried `'unsafe-inline' 'unsafe-eval'` unconditionally. With
either present, a nonce or hash-based CSP provides no real XSS backstop —
`unsafe-inline` alone lets any injected `<script>` tag execute regardless of
origin allowlisting.

### Correct Pattern — a per-request nonce, not a per-build one

A CSP nonce must be regenerated every request (a fixed nonce is equivalent
to no nonce — an attacker who ever observes one can reuse it indefinitely).
That has to flow through: proxy → response header → the RSC render that
emits `<script nonce=...>` tags — a nonce baked in at build time or read
from an env var is **not** a correct implementation, however tempting it
looks.

1. `route-classification.ts` generates the nonce once per request
   (`RouteContext.nonce`), gated on `CSP_SCRIPT_STRICT_MODE`.
2. `proxy.ts`'s `terminalHandler` — the only "continue to render" exit
   point — carries it forward as a **request** header
   (`NextResponse.next({ request: { headers } })`). A response header set
   by middleware never reaches the RSC render; only forwarded request
   headers do.
3. `with-headers.ts` builds `script-src 'self' 'nonce-<x>' 'strict-dynamic'
<host-allowlist-as-CSP2-fallback>` instead of `'unsafe-inline'
'unsafe-eval'` — but only when BOTH `CSP_SCRIPT_STRICT_MODE` is on AND a
   nonce was actually supplied; a missing nonce always falls back to the
   legacy CSP rather than emitting `'nonce-undefined'` or similar.
4. `src/security/rsc/csp-nonce.ts`'s `getCspNonce()` reads the nonce back
   via `headers()` for RSC consumers (inline `<Script nonce={...}>` tags,
   `<ClerkProvider nonce={...} dynamic>`).

### Clerk Requires Both `nonce` AND `dynamic`

Verified in the installed `@clerk/clerk-react` types (not assumed from
memory): `ClerkProviderProps.nonce` "will be passed through to the
`@clerk/clerk-js` script tag... Requires the `dynamic` prop to also be
set." Passing `nonce` without `dynamic` is silently incomplete — Clerk's
own script tag won't actually pick it up.

```tsx
<ClerkProvider nonce={nonce} dynamic={Boolean(nonce)} {...otherProps}>
```

Only pass `dynamic` when a nonce actually exists — passing it unconditionally
forces Clerk into per-request dynamic rendering even when
`CSP_SCRIPT_STRICT_MODE` is off, defeating that flag's purpose as a
zero-cost rollback.

### `headers()` Forces Dynamic Rendering — Scope the Blast Radius

`getCspNonce()` deliberately checks `env.CSP_SCRIPT_STRICT_MODE` **before**
calling `headers()` — `headers()` is a Dynamic API that opts the calling
Server Component into per-request rendering the instant it's called,
regardless of whether a nonce is actually found. Call it from small,
dedicated async Server Components (`NrBrowserScripts`,
`ClerkProviderWithNonce` in `layout.tsx`) rather than from the top of
`RootLayout` itself, so the dynamic-rendering cost stays scoped to what
actually needs the nonce instead of forcing the entire app dynamic.

**A scoped component is necessary but not sufficient — it must also be
wrapped in `<Suspense>` at its call site, or the build fails hard.**
`ClerkProviderWithNonce` already sits inside the layout's existing
`<Suspense fallback={<RootLayoutShell />}>`, but `NrBrowserScripts` in
`<head>` initially did not — every route shares that `<head>`, so every
single prerendered page failed the production build with:

```text
Error: Route "/some-route": Uncached data was accessed outside of
<Suspense>. This delays the entire page from rendering, resulting in a
slow user experience. Learn more:
https://nextjs.org/docs/messages/blocking-route
    at head (<anonymous>)
    at html (<anonymous>)
```

This is a hard `next build` failure under `cacheComponents: true`, not a
soft dynamic-rendering fallback — it doesn't surface in `pnpm typecheck` or
`pnpm test`, only in an actual `pnpm build` (or the Vercel deploy build).
Fix: wrap the call site, not the component definition —

```tsx
<head>
  <Suspense fallback={null}>
    <NrBrowserScripts cdnConfig={cdnConfig} ... />
  </Suspense>
</head>
```

After the fix, `next build`'s route table shows every route as `◐` (Partial
Prerender — static shell + dynamic server-streamed content), not `ƒ` (fully
dynamic) — confirming the Suspense boundary is doing its job of keeping the
static shell intact around the nonce-dependent hole, not just silently
making the whole route dynamic.

### Scope Boundary — script-src Only, Not style-src

`style-src` keeps `'unsafe-inline'` unconditionally. Inline `style=""`
attributes (as opposed to `<style>` blocks) cannot be nonce'd under CSP2/3 —
only allow-listed via `unsafe-inline` or per-value hashes. Auditing every
inline `style` prop across the app for a much lower-severity vector (CSS
injection, not code execution) was ruled out of scope for this pass — this
is a deliberate boundary, not an oversight.

### Rollback Path

`CSP_SCRIPT_MODE=cache-compatible` in Vercel + redeploy reverts to the
legacy CSP with zero code change, if a third-party script is ever found
that doesn't tolerate strict-dynamic. This is why the flag exists — verify
it still works (i.e., don't remove the legacy branch) before ever proposing
to delete it as "dead code."

### Update 2026-08-21 — Nonce CSP Is Incompatible With cacheComponents/PPR; Default Flipped Off

Everything above (the Suspense-wrapping mechanics, the request-header
forwarding, Clerk's `nonce`+`dynamic` requirement) is correct and still how
strict mode works when it's on. What it doesn't mention, because it wasn't
known yet: **`CSP_SCRIPT_STRICT_MODE=true` does not actually work in this
app while `cacheComponents: true` is set**, and shipping it as the default
broke the app for real users.

**How this was found**: not from a test — from a live bug report. A real
Android Chrome device hitting the deployed preview got stuck showing only
`RootLayoutShell`'s loading skeleton, forever. Reproduced deterministically
via a Playwright run using a mobile device emulation profile (`devices['Pixel
7']`) against the same deployed URL, capturing `console` and
`securitypolicyviolation` events. The console showed **every single script
on the page blocked by CSP** — every Next.js chunk-loader `<script src>`,
and the framework's own inline bootstrap scripts — with page errors like
`$RC is not defined` confirming hydration never started at all.

**Root cause**: per Next.js's own docs (`content-security-policy.mdx`,
fetched directly from `vercel/next.js` — WebFetch to `nextjs.org` itself is
blocked in some sandboxed environments, `raw.githubusercontent.com` is not):

> Partial Prerendering (PPR) is incompatible with nonce-based CSP since
> static shell scripts won't have access to the nonce.

Scoping `getCspNonce()`/`headers()` to small `<Suspense>`-wrapped
components (`NrBrowserScripts`, `ClerkProviderWithNonce`) satisfies
`cacheComponents`' _build-time_ rule ("Dynamic API must be inside
Suspense"), but does **not** solve the real problem: Next's own framework
bootstrap/chunk-loader scripts are injected into the **static shell**
(built once, before any request exists, so no nonce is available) —
they're not part of this app's component tree at all, so no Suspense
boundary we add can reach them. Under `'strict-dynamic'` with no
`unsafe-inline` fallback, a browser then blocks literally everything the
shell shipped, and the page never progresses past the loading skeleton.
`x-vercel-cache: PRERENDER` / `x-nextjs-prerender: 1` on the response is
the visible symptom of exactly this: the static shell (containing those
scripts) being served from cache, with no per-request nonce ever
reachable inside it.

This is a known, currently-unresolved upstream limitation, not a defect
in this app's proxy/header wiring:

- `vercel/next.js#89754` — nonce-based CSP vs. `cacheComponents` tracked as
  open.
- `vercel/next.js#95354` — the more precise gap: even Turbopack's SRI
  (Subresource Integrity, added in Next 16.2 for **external** script
  assets) doesn't cover React Flight's own **inline**
  `<script>self.__next_f.push(...)</script>` bootstrap payload — SRI
  secures externally-loaded chunks, not this inline payload, so it isn't a
  full substitute for nonce/unsafe-inline either.
- `vercel/next.js#96665` — a Next.js maintainer (`icyJoseph`), responding
  on an issue filed against **Next 16.3.0** in August 2026 (i.e. current,
  not stale-docs), confirmed `unsafe-inline` remains "the only way for the
  time being" while the real fix requires upstream React work.

**Attempted fix that made it worse, for the record**: forcing the entire
`RootLayout` dynamic via an unconditional `await connection()` at its top
(the pattern Next's docs show for opting a _page_ out of PPR) does not
work at the _layout_ level under `cacheComponents: true` in this Next
version — it produces a hard `next build` failure on `/_not-found`
("Uncached data was accessed outside of `<Suspense>`"), because
`connection()` is itself a traced Dynamic API subject to the same
Suspense-wrapping rule, and `/_not-found` can't reasonably be wrapped.
Don't reach for this as a quick fix.

**Resolution shipped now**: `CSP_SCRIPT_MODE` defaults to `'cache-compatible'`.
Every other part of this hardening pass (baseline CSP directives, COOP/
CORP/etc., `unsafe-eval` scoped to dev-only, SSRF hardening, demo-route
gating) is unaffected and stays in place. This is a deliberate, documented
tradeoff — not a silent regression — matching the maintainer's own
current guidance.

**Originally-planned follow-up, superseded 2026-08-21 (A.7)**: this section
used to describe a route-class CSP profile split — `public-cacheable`
routes keeping PPR + legacy CSP, `dynamic-strict` routes (dashboard, admin)
opting out of PPR per-segment for full nonce CSP, all on one origin. An
external review correctly identified this as unsound: CSP is a
**document-level** policy, and a `<Link>` soft-navigation from a
`public-cacheable` page into a `dynamic-strict` route does not fetch a new
document — the browser keeps enforcing the CSP of whatever document it
actually loaded, so the "strict" route would silently run under the
relaxed policy for anyone who arrived via client-side navigation. This plan
is dropped, not revised. See **SEC-31** for the corrected guidance: a
deployment/origin genuinely needing both profiles at once should split by
origin (subdomain), not by route on one origin — never re-propose a
same-origin per-route CSP split.

Until an upstream `hash-ppr`-style fix lands (see `CSP_SCRIPT_MODE`'s doc
comment in `src/core/env.ts`), `'nonce-dynamic'` mode only works for a
deployment that gives up `cacheComponents`/PPR entirely — see "Update
2026-08-21 (A.7.2)" below for how that's now enforced automatically, not
left as a manual precondition.

### Update 2026-08-21 (A.7.2) — `nonce-dynamic` Didn't Actually Disable PPR; Fixed in `next.config.ts`

A.7.1 renamed the flag and set `CSP_SCRIPT_MODE=nonce-dynamic` for the
_build_ step (not just runtime start) in the new `e2e:csp-nonce-dynamic:ci`
script, reasoning that PPR's static/dynamic split is decided once at build
time. That reasoning was correct but incomplete: setting the env var
before `pnpm build` changed nothing on its own, because `cacheComponents`
in `next.config.ts` was still unconditionally `true`. `getCspNonce()`'s
Suspense-scoped `headers()` calls (`NrBrowserScripts`,
`ClerkProviderWithNonce`) only carve out small dynamic _holes_ in an
otherwise-static shell — they don't, and structurally can't, make the
_route_ dynamic. Confirmed empirically, not just re-derived from docs: the
first real run of `e2e/csp-nonce-dynamic.spec.ts` against a live browser
(this app's actual first-ever E2E execution of `nonce-dynamic` mode) built
with `CSP_SCRIPT_MODE=nonce-dynamic` and found `/` still `◐` (Partial
Prerender) in the build output, with **every single Next.js chunk-loader
`<script src="/_next/static/chunks/...">` tag carrying `nonce: null`** —
the header nonce was real and fresh, but not one framework script picked
it up, because they're all still part of a static shell built once with no
request in scope.

**Fix**: `next.config.ts` now sets
`cacheComponents: process.env.CSP_SCRIPT_MODE !== 'nonce-dynamic'` — a
`nonce-dynamic` build disables `cacheComponents` for the entire
deployment automatically, not as a precondition agents have to remember to
uphold by hand. Verified: with the flag set, every route in the build
output moved from `◐` to `ƒ` (fully dynamic), including `/`. The default
(`cache-compatible`) build is unaffected — confirmed the condition only
evaluates true for `nonce-dynamic`, and a `pnpm build` without the env var
still produces the same `◐` PPR output as before this change.

This is why "harden the E2E test until it passes" would have been the
wrong response to the original failure — the test was correct; the
_implementation_ of `nonce-dynamic` mode was incomplete. Confirming this
required the empirical test failure itself, not a re-read of the docs —
the takeaway for future agents in the **Rule for Agents** section below.

### Rule for Agents

**DO** treat "a nonce was generated" and "`CSP_SCRIPT_MODE` is
`'nonce-dynamic'`" as two independently-necessary conditions before
emitting strict CSP — a
missing nonce with the flag on must fall back to legacy, never emit a
broken directive. **DO NOT** call a Next.js Dynamic API (`headers()`,
`cookies()`, `connection()`) from the top of a layout/page component when a
small child component can call it instead — the dynamic-rendering cost
follows the component that calls the API, and scoping it matters under
`cacheComponents: true`. **DO NOT** add `nonce` to a third-party provider
without checking whether it has its own additional required prop (like
Clerk's `dynamic`) — verify against the installed package's actual types,
not documentation memory. **DO** run an actual `pnpm build` (not just
`pnpm typecheck` + `pnpm test`) before treating any change that adds a
Dynamic API call to `layout.tsx` or another shared-shell component as
verified — the "Uncached data accessed outside Suspense" failure above
only surfaces during real prerendering and passed typecheck and the full
test suite cleanly first. **DO NOT** assume a Suspense-scoped `headers()`/
`cookies()` call makes its _route_ dynamic under `cacheComponents: true`
— it only opts that specific subtree out of the static shell; the route's
build-output symbol (`◐` vs `ƒ`) is the real signal, and Next's own
chunk-loader scripts are part of the shell, not the app's component tree,
so no Suspense boundary placed in application code can ever reach them.

---

## SEC-31 — CSP Is a Document-Level Policy: Same-Origin Mixed Profiles Don't Work

**ID**: SEC-31
**Category**: CSP architecture
**Classification**: Architectural guidance — corrects a plan from this
repo's own history (A.7, 2026-08-21), not a code-level bug fix
**Affected contexts**: any future decision to give a route or route group a
different CSP than the rest of the app; `next.config.ts` (`cacheComponents`

- `CSP_SCRIPT_MODE`); `src/security/middleware/with-headers.ts`

### The Plan This Corrects

An earlier version of this repo's Phase 2 CSP plan proposed a **route-class
CSP profile split** on one origin: `/` and other marketing/public routes
would keep `cacheComponents`/PPR and the legacy `unsafe-inline` script-src
(`public-cacheable`), while `/dashboard` and other authenticated routes
would opt out of PPR **on their own layout/page segments** and get the
full nonce + `strict-dynamic` CSP with zero `unsafe-inline`
(`dynamic-strict`) — different `Content-Security-Policy` header values
per route, computed per-request in `with-headers.ts` based on which route
matched.

An external review of this plan caught the flaw before it was built:
**this doesn't actually protect the "strict" routes for a real user.**

### Why It Doesn't Work

CSP is enforced against **the document**, not against each individual
response. A browser tab has exactly one active CSP at a time: whatever
`Content-Security-Policy` header came back on the response that created
the currently-loaded document (a full/hard navigation). Every subsequent
same-document interaction — including a Next.js App Router `<Link>`
client-side ("soft") navigation, which fetches an RSC payload and patches
the DOM in place without a new top-level navigation — does **not** replace
that policy. The RSC response for `/dashboard` can carry a
`dynamic-strict` `Content-Security-Policy` header in its own HTTP
response, and the browser will simply never look at it, because no new
document was created.

Concretely:

```text
1. User opens https://example.com/ directly (hard nav).
   Document CSP = public-cacheable (unsafe-inline, no nonce).

2. User clicks <Link href="/dashboard"> inside the app.
   Next.js does a soft navigation: fetches the RSC payload for
   /dashboard, patches the DOM. No new document. No new CSP.

3. /dashboard's scripts now execute under the ORIGINAL /'s
   unsafe-inline CSP, not the dynamic-strict CSP that route's own
   response headers claimed to have.
```

Anyone who reaches `/dashboard` by clicking through the app (the normal
path for a logged-in user navigating your own product) never gets the
strict policy at all. Only a user who directly hard-navigates or reloads
on `/dashboard` would. The security boundary this profile split exists to
draw is real for some traffic and silently absent for the rest — worse
than a single consistent policy, because it looks like defense in depth
in code review and in a curl check, and isn't one in a browser.

### The Correct Pattern: Split By Origin, Not By Route

A deployment that genuinely needs both a cache-compatible public zone
(marketing, docs, a future blog) and a nonce-dynamic private zone
(account, admin, billing) at the same time should run them as **separate
origins** — e.g. `www.example.com` for the public zone,
`app.example.com` for the private one:

```text
www.example.com                        app.example.com
────────────────                       ─────────────────
public-cacheable CSP                   nonce-dynamic CSP
cacheComponents: true                  cacheComponents: false
(CSP_SCRIPT_MODE=cache-compatible)     (CSP_SCRIPT_MODE=nonce-dynamic)
marketing, docs, blog                  account, admin, billing
```

This isn't a workaround for the soft-navigation problem above — it makes
the problem structurally impossible. `<Link>` (and every other browser
navigation primitive) only ever performs a soft navigation within the
**same origin**; crossing from `www.example.com` to `app.example.com` is
inherently a hard navigation, a new document, a new CSP, every time,
whether the app author remembers to force it or not. Each origin also
gets its own independent `next.config.ts`/`CSP_SCRIPT_MODE` — the exact
mechanism SEC-30 already documents — so this requires no new CSP
machinery, only a deployment-topology decision: two Next.js deployments
(or two apps sharing this boilerplate) instead of one, fronted by two
subdomains.

This repo is single-origin today and isn't taking on that split
speculatively — this section exists so a future feature that seems to
want route-level CSP variance reaches for the origin split instead of
re-proposing the same-origin version this section corrects. Building a
live second origin as a "demo" was explicitly considered and rejected for
this boilerplate: it's real infrastructure (DNS, hosting config,
cross-subdomain session cookies for whichever auth provider is in use)
that's specific to a consuming app's actual domain, not something a
generic boilerplate can meaningfully fake. The worked example is this
section itself, plus SEC-30's existing `CSP_SCRIPT_MODE` mechanism —
wiring a second origin, when one is actually needed, is applying that
same mechanism to a second deployment, not inventing anything new.

### Rule for Agents

**DO NOT** give different routes on the same origin different
`Content-Security-Policy` header values as a security boundary — a
client-side navigation between them will not pick up the new policy, so
the boundary silently fails for exactly the traffic pattern (in-app
navigation) that matters most. **DO** treat `CSP_SCRIPT_MODE` as a
per-deployment, not per-route, setting — see SEC-30. **DO** reach for an
origin split (subdomain), not a route split, the moment a real requirement
for two different CSP postures at once appears — and treat "two
deployments" as a legitimate, expected shape for this boilerplate to grow
into, not a sign something went wrong.

---

## SEC-32 — CSP Correctness Follow-Up: `speculationrules`, `*_EXTRA` Injection, DNS Timeout

**ID**: SEC-32
**Category**: CSP hardening / outbound-fetch hardening
**Classification**: Real risk → fixed (2026-08-22). Found by a second
external re-review of the A.8 diff (commit `5fc9fb4`), each item verified
empirically against the actual running code before fixing — never taken on
the reviewer's word alone, same discipline as SEC-28.
**Affected contexts**: `e2e/support/csp-violations.ts`,
`src/security/middleware/with-headers.ts`, `src/security/outbound/secure-fetch.ts`

This is a follow-up to SEC-28 (SSRF/`secureFetch()` hardening) and SEC-30
(nonce CSP). Three independent findings, grouped here because they came
from the same review pass and the same "verify empirically, then fix"
discipline, not because they share a root cause.

### 1. `<script type="speculationrules">` is NOT a non-executable script type

`e2e/support/csp-violations.ts`'s `NON_EXECUTABLE_SCRIPT_TYPES` treated
`speculationrules` the same as genuinely inert block types
(`application/json`, `application/ld+json`, `importmap`) — script blocks a
browser never executes as code, so CSP's `script-src` doesn't govern them
and a nonce check on them is a false-fail waiting to happen. Confirmed via
WebSearch against MDN/the WICG spec (direct `developer.mozilla.org` access
is blocked by this environment's egress proxy; the MDN markdown source
mirrored on `github.com/mdn/content` was used instead) that
`speculationrules` is the opposite case: it **is** governed by
`script-src`, and isn't even covered by `'unsafe-inline'` — it requires an
explicit `'inline-speculation-rules'` source expression, a nonce, or a
hash. Treating it as non-executable meant the E2E nonce-matching helper
(`isExecutableScript`) would have silently stopped checking its nonce the
moment React/Next ever emitted one (prefetch/prerender resource hints can
generate exactly this block type) — the `securitypolicyviolation` listener
elsewhere in the same test harness remained a backstop, so this was a test
correctness bug more than a live exploit, but the test was asserting a
false rule about what CSP actually does.

**Fix**: removed `speculationrules` from `NON_EXECUTABLE_SCRIPT_TYPES`.
`e2e/support/csp-violations.test.ts` (new, unit-level — previously this
logic was only exercised indirectly via the opt-in Playwright spec) proves
a `speculationrules` descriptor is classified executable, alongside the
genuinely-inert types staying excluded, and a case-insensitivity check.

### 2. `NEXT_PUBLIC_CSP_*_EXTRA` env vars accepted arbitrary CSP syntax, including directive injection

`with-headers.ts`'s `parseExtra()` split an `*_EXTRA` env value on
whitespace/commas and passed each token through with only quote-stripping
— no validation that a token was a legitimate CSP source expression. A
value like `"https://cdn.example.com; object-src *"` would inject a
literal `;` into the built header, adding a whole extra `object-src *`
directive. Reproduced through the exact old logic before fixing, not
assumed: CSP honors only the **first** occurrence of a duplicate directive
in one header, and the app's own `object-src 'none'` baseline hardening
directive is emitted later in the same `buildContentSecurityPolicy()`
array — so the injected value would have WON, silently disarming
`object-src 'none'` entirely. Not a remote-input vuln (`*_EXTRA` vars are
operator-set, not request-derived), but unacceptable for a reusable
security boilerplate whose whole premise is "the baseline directives hold
regardless of what an integrator adds."

**Fix**: added `classifyCspSourceToken()`, which validates every token as
one of: the two safe quoted keyword sources (`'self'`, `'none'`); a
scheme-qualified source (`CSP_SCHEME_SOURCE_PATTERN`); or a bare/wildcard
hostname (`CSP_HOST_SOURCE_PATTERN`) — rejecting (and logging, not
silently dropping) anything containing `;`, `\r`, `\n`, `<`, `>`, a
backtick, or internal whitespace, and rejecting keyword-_shaped_ tokens
(`unsafe-*`, `nonce-*`, `sha256-*`/`sha384-*`/`sha512-*`,
`strict-dynamic`, `wasm-unsafe-eval`, `unsafe-hashes`, `report-sample`,
`inline-speculation-rules`) even though they'd otherwise pass as
syntactically-valid single-label hostnames. Both new regexes were
empirically verified ReDoS-safe (sub-millisecond against 50,000–100,000
character adversarial inputs) before suppressing the scanner's
`security/detect-unsafe-regex` finding on each — same discipline as
SEC-28's regex false-positive notes. `with-headers.test.ts` has four new
regression tests: the glued-semicolon injection payload is fully rejected
and `object-src 'none'` is unaffected; the same payload with a
space-separated `;` token still rejects the injected directive while
keeping the legitimate host (proving this isn't an overbroad
reject-everything fix); dangerous keyword-shaped tokens are rejected
whether quoted or bare; `'self'`/`'none'` are still accepted.

### 3. DNS resolution had no timeout — the "overall" fetch timeout didn't actually cover it

A.8.3 added `SECURITY_OUTBOUND_FETCH_TIMEOUT_MS`, an `AbortSignal`-based
overall budget — but that signal was only ever passed to `fetchHop()`'s
`fetch()` call. `resolveViaDns()`'s `dns.promises.lookup()` call, which
runs _before_ any `fetch()` on every hop, had no deadline of its own.
Confirmed empirically before fixing: `dns.promises.lookup()` has no
`AbortSignal` support at all — passing a `signal` option (even an
already-aborted one) is silently ignored, and Node's c-ares-backed DNS
resolution has no cancellation mechanism to hook into. Not an SSRF bypass
(the address is still validated once resolution completes), but a
resource-exhaustion/availability gap: a slow or non-responding DNS server
could hang a `secureFetch()` call indefinitely, contradicting the
timeout's own documented "spans every hop" guarantee.

**Fix**: added `raceWithSignal()`, which races the `lookup()` promise
against the same call-wide `overallSignal` `secureFetch()` already builds
(one absolute deadline covering DNS resolution _and_ every hop's connect
and body read — not a fresh per-phase budget) and rejects the moment the
signal fires, regardless of whether the underlying DNS call itself ever
settles. `resolveViaDns()` distinguishes a deadline-triggered rejection
(`overallSignal.aborted`) from a genuine DNS failure (`ENOTFOUND`, etc.)
so the timeout case gets its own clearly-labeled error, matching
`fetchHop()`'s existing timeout-labeling pattern rather than folding into
the generic "DNS resolution failed" message. `secure-fetch.test.ts` has a
new regression test: a `lookup()` mock that never resolves on its own
still causes `secureFetch()` to reject with a DNS-timeout-labeled error
within the configured budget, and `fetch()` is never reached — proving the
deadline fires during DNS resolution, not just during the eventual
`fetch()` call.

### Also added while in this code (free hardening, not a fix for a live bug)

`script-src-attr 'none'` was added to `buildContentSecurityPolicy()` —
overrides `script-src` specifically for inline event-handler attributes
(`onclick=`, `onerror=`, etc., per MDN). This repo/React never emits those,
so it's free additional hardening on top of whatever `script-src` allows,
independent of `CSP_SCRIPT_MODE` — even in `cache-compatible` mode, where
`script-src` still needs `'unsafe-inline'` for Next's own bootstrap
scripts, an inline event-handler attribute injected via some other vector
stays blocked.

### Rule for Agents

**DO NOT** classify a `<script type="...">` block as CSP-inert without
checking the actual CSP spec/MDN for that exact type — `script-src`'s
governed-type list is not "anything that isn't `text/javascript`."

**DO NOT** let an env-configured CSP "extra" value pass through as raw CSP
syntax — validate each source-expression token, don't just
split/trim/quote-strip.

**DO NOT** assume an `AbortSignal` passed to a Node API actually cancels
it — `dns.promises.lookup()` is a concrete counterexample; verify
cancellation support per-API before relying on it, and race-with-signal
(reject on abort, let the underlying call run to completion unobserved)
when the API itself can't be cancelled.

**DO** treat "one overall deadline for a multi-phase operation" as
covering every phase (DNS → connect → every redirect hop → body read) by
construction — a signal only threaded through the _last_ phase isn't an
overall deadline, it's a per-phase one with a misleading name.
