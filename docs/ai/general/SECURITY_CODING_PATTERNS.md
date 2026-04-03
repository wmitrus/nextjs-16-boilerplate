# Security Coding Patterns

Living reference produced during structured security reviews.
Every entry describes a scanner finding, its real-world risk classification,
what code to avoid, and the correct pattern to use instead.

This document is injected into agent prompts and repository rules.
Update it after every security review group.

---

## Pattern Index

| #      | Category          | Vulnerability Class                                  | Classification            | Affected Contexts         |
| ------ | ----------------- | ---------------------------------------------------- | ------------------------- | ------------------------- |
| SEC-01 | Cryptography      | Timing attack — Symbol `===` in DI mocks             | False positive            | Unit test files           |
| SEC-02 | Routes            | Open redirect — hardcoded path via `req.url` origin  | False positive            | Middleware                |
| SEC-03 | Routes            | Open redirect — forwarded `redirect_url` query param | Latent risk → fixed       | Middleware                |
| SEC-04 | Command injection | Dynamic logger dispatch `logger[level]()`            | False positive → hardened | API route                 |
| SEC-05 | File access       | Dynamic `fs.*` with static literal paths             | False positive            | E2E helpers               |
| SEC-06 | Cryptography      | `Math.random()` for test email uniqueness            | False positive            | E2E specs                 |
| SEC-11 | Caching           | SDK client cache key missing differentiating config  | Real risk → fixed         | Module-level SDK adapters |
| SEC-15 | Object access     | User-controlled key lookup via `key in object`       | Latent risk               | Auth/bootstrap UI mapping |
| SEC-16 | File access       | Reusable helper fs paths lack sink confinement       | Latent risk               | Runtime logger helpers    |

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
