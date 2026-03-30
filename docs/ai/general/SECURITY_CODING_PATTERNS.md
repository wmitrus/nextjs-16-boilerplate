# Security Coding Patterns

Living reference produced during structured security reviews.
Every entry describes a scanner finding, its real-world risk classification,
what code to avoid, and the correct pattern to use instead.

This document is injected into agent prompts and repository rules.
Update it after every security review group.

---

## Pattern Index

| #      | Category          | Vulnerability Class                                  | Classification            | Affected Contexts |
| ------ | ----------------- | ---------------------------------------------------- | ------------------------- | ----------------- |
| SEC-01 | Cryptography      | Timing attack — Symbol `===` in DI mocks             | False positive            | Unit test files   |
| SEC-02 | Routes            | Open redirect — hardcoded path via `req.url` origin  | False positive            | Middleware        |
| SEC-03 | Routes            | Open redirect — forwarded `redirect_url` query param | Latent risk → fixed       | Middleware        |
| SEC-04 | Command injection | Dynamic logger dispatch `logger[level]()`            | False positive → hardened | API route         |
| SEC-05 | File access       | Dynamic `fs.*` with static literal paths             | False positive            | E2E helpers       |
| SEC-06 | Cryptography      | `Math.random()` for test email uniqueness            | False positive            | E2E specs         |

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
