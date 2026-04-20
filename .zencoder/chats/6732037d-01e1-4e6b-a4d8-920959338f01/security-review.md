# Security Review — AuthJS Adapter Implementation

## Task

Implement a complete Auth.js (next-auth v5) adapter for the modular auth infrastructure. This touches authentication, session management, trust boundaries, provider isolation, and the provisioning bootstrap path.

## Security Surface Classification

- **authentication** — primary concern: Auth.js replaces Clerk as the authentication mechanism
- **session / token handling** — JWT strategy; AUTH_SECRET is the signing key
- **trust boundary** — session data read from JWT must be validated before trusting
- **provider isolation** — Auth.js SDK must not leak outside infrastructure boundaries
- **sensitive data handling** — AUTH_SECRET, OAuth client secrets must not be logged or exposed
- **email verification trust** — `emailVerified` claim is provider-dependent; incorrect mapping breaks cross-provider email linking policy

## Auth / Identity Surface

### How Identity Is Established

Auth.js establishes identity via:

1. A session cookie (encrypted, signed with `AUTH_SECRET`)
2. The cookie is decoded via `auth()` call which verifies the JWT signature

The JWT contains:

- `sub` — user ID (must be explicitly added via `jwt()` callback; not automatic)
- `email`
- `name`, `picture` (optional)
- Custom claims added via `jwt()` callback

**Critical gap**: Auth.js does not automatically include `id` in the session unless a `jwt()` callback adds `token.sub` to `token` and a `session()` callback exposes it as `session.user.id`. Without this, `AuthJsRequestIdentitySource` cannot populate `userId`.

### JWT Callback Requirements (Security-Critical)

The Auth.js `jwt()` and `session()` callbacks must be implemented to ensure:

```typescript
// In auth.config.ts callbacks
callbacks: {
  jwt({ token, account, profile }) {
    // token.sub is set by Auth.js on sign-in to the provider's user ID
    // No additional mapping needed for userId — sub IS the user ID
    // BUT: email verification must be explicitly mapped:
    if (account?.provider === 'github') {
      token.emailVerified = true; // GitHub always verifies emails
    } else if (account?.provider === 'google') {
      token.emailVerified = profile?.email_verified === true;
    } else if (account?.provider === 'credentials') {
      token.emailVerified = false; // Credentials cannot guarantee verification
    }
    return token;
  },
  session({ session, token }) {
    // Expose userId and emailVerified to session for RSC access
    session.user.id = token.sub ?? '';
    session.user.emailVerified = token.emailVerified as boolean | undefined;
    return session;
  },
}
```

If `token.sub` is not propagated to `session.user.id`, the `AuthJsRequestIdentitySource` will receive an undefined `userId` and provisioning will fail.

## Security Findings

### SEC-AUTH-01: AUTH_SECRET Must Be Cryptographically Strong (CRITICAL)

**Finding**: Auth.js requires `AUTH_SECRET` for JWT signing. If weak, all sessions can be forged.

**Requirement**:

- `AUTH_SECRET` must be at minimum 32 bytes of cryptographically random data
- Must be generated with `openssl rand -base64 32` or `pnpm auth secret` (Auth.js CLI)
- Must be stored in `.env.local` and Vercel environment variables (never committed)
- Must be added to `src/core/env.ts` as a server-only required variable when `AUTH_PROVIDER=authjs`

**Implementation rule**:

```typescript
// In src/core/env.ts — server schema
AUTHJS_SECRET: z.string().min(32).optional(), // required when AUTH_PROVIDER=authjs
```

Or use Auth.js's own `AUTH_SECRET` env var name which is auto-detected. Either approach is acceptable — consistency with existing `env.ts` pattern is preferred.

### SEC-AUTH-02: OAuth Client Secrets Must Not Be Logged (CRITICAL)

**Finding**: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (and any other OAuth secrets) must be treated as sensitive credentials.

**Requirements**:

- Never log these values (applies SEC-10 from `SECURITY_CODING_PATTERNS.md`)
- Never include in error messages
- Never expose in client bundles (must be server-only env vars)
- Add to `src/core/env.ts` server-only schema, NOT client schema

### SEC-AUTH-03: emailVerified Claim Mapping Is Security-Critical (HIGH)

**Finding**: The `CROSS_PROVIDER_EMAIL_LINKING=verified-only` policy in `ProvisioningService` relies on `emailVerified: true` to gate cross-provider account linking. If `emailVerified` is incorrectly set to `true` for providers that don't verify emails, a malicious actor could link accounts they don't own.

**Provider-specific rules**:

| Provider           | emailVerified Rule                                                     |
| ------------------ | ---------------------------------------------------------------------- |
| GitHub             | Always `true` — GitHub requires email verification                     |
| Google             | Read from `profile.email_verified` — set by Google                     |
| Discord            | Read from `profile.verified` — set by Discord                          |
| Credentials        | Always `false` — no external verification guarantee                    |
| Email (Magic Link) | `true` only if the provider verifies the email via the magic link flow |

**Required**: The `jwt()` callback in `auth.config.ts` MUST explicitly set `token.emailVerified` per provider. Do not leave it undefined or rely on provider defaults.

### SEC-AUTH-04: CSRF Protection (HIGH)

**Finding**: Auth.js v5 includes built-in CSRF protection for its route handlers via the `/api/auth/csrf` endpoint and the `csrfToken` in sign-in forms.

**Requirements**:

- The Credentials provider sign-in form MUST include the CSRF token from `getCsrfToken()`
- Do not implement custom CSRF logic — use Auth.js built-in mechanism
- Do not expose `/api/auth/*` endpoints to rate limiting that would block the CSRF token endpoint

**Rate limiting consideration**: The existing `withRateLimit` middleware in `src/proxy.ts` applies to all API routes. Ensure `/api/auth/csrf` and `/api/auth/session` are not rate-limited so aggressively that legitimate auth flows break. The existing rate limit config should be checked for this.

### SEC-AUTH-05: Session Cookie Security Configuration (HIGH)

**Finding**: Auth.js session cookies must be configured with proper security attributes.

**Requirements**:

- `secure: true` in production (HTTPS only)
- `httpOnly: true` (prevents XSS access to cookie)
- `sameSite: 'lax'` (prevents CSRF while allowing OAuth redirects)
- Auth.js sets these defaults in production — verify they are not overridden

**Note**: Auth.js automatically sets `secure: true` when `NODE_ENV=production`. In development, cookies are not marked secure. This is correct behavior.

### SEC-AUTH-06: OAuth Callback URL Validation (HIGH)

**Finding**: OAuth providers validate callback URLs against a whitelist. If `NEXTAUTH_URL` / `AUTH_URL` is not set correctly, OAuth flows will fail or be exploitable.

**Requirements**:

- `AUTH_URL` (or `NEXTAUTH_URL`) must be set to `NEXT_PUBLIC_APP_URL` value
- This must be a server-only env var
- In production, must match the exact Vercel deployment URL
- Add to `.env.example` with documentation

### SEC-AUTH-07: Redirect URL Sanitization for Auth Flows (HIGH)

**Finding**: Auth.js supports `callbackUrl` query parameter for post-sign-in redirects. If not sanitized, this could be used for open redirect attacks.

**Auth.js behavior**: Auth.js v5 validates `callbackUrl` against the configured origin. It rejects external URLs by default.

**Requirements**:

- Do not override Auth.js's built-in callback URL validation
- Do not add custom `callbackUrl` handling that bypasses Auth.js's validation
- If the app needs to preserve pre-auth deep links, use the same pattern as Clerk (`sanitizeRedirectUrl()` via SEC-03)
- The bootstrap flow (`/auth/bootstrap`) should be the forced post-auth target — same as Clerk

### SEC-AUTH-08: Credentials Provider Security Constraints (MEDIUM)

**Finding**: The Credentials provider is being added for dev/test convenience. It presents security risks in production if not constrained.

**Requirements**:

- Credentials provider should only be included when `NODE_ENV !== 'production'` OR documented clearly as requiring hardened implementation before production use
- Credentials provider password comparison MUST use timing-safe comparison (e.g., `crypto.timingSafeEqual` or bcrypt)
- Never store plaintext passwords — always hash with bcrypt/argon2
- For the boilerplate, Credentials provider can be minimal (demo-only) but must have a clear security warning comment

### SEC-AUTH-09: Auth.js Route Handler Must Not Expose Internal Errors (MEDIUM)

**Finding**: Auth.js route handler errors (e.g., DB connection failures, misconfiguration) must not expose internal details to clients.

**Auth.js behavior**: Auth.js catches errors internally and shows generic error pages. Custom error handling should follow this pattern.

**Requirements**:

- Do not add custom error handlers that log sensitive data
- Do not expose OAuth client secrets in error messages
- Follow SEC-10: extract `errorMessage: error.message` and `errorName: error.name` as separate fields if logging auth errors

### SEC-AUTH-10: Session Data Must Not Be Trusted for Authorization (MEDIUM)

**Finding**: `session.user.id` from Auth.js is the external provider ID (equivalent to Clerk's `userId`). It must go through the same `InternalIdentityLookup` path to resolve to an internal UUID.

**Requirements**:

- `AuthJsRequestIdentitySource.get()` returns `userId` as an external ID
- The `RequestScopedIdentityProvider` already handles the lookup via `DrizzleInternalIdentityLookup`
- Authorization must use internal UUIDs, not Auth.js session user IDs
- This is already handled by the existing infrastructure — verify it remains true after implementation

### SEC-AUTH-11: Provider Secrets Must Be Conditional on AUTH_PROVIDER (LOW)

**Finding**: `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` should only be required when `AUTH_PROVIDER=authjs` and GitHub is the configured provider. Making them always-required would fail env validation for Clerk-configured deployments.

**Requirements**:

- Make OAuth provider secrets optional in `src/core/env.ts`
- Add documentation in `.env.example` that they are only needed for `AUTH_PROVIDER=authjs`
- Consider a runtime validation that warns if `AUTH_PROVIDER=authjs` but no OAuth provider is configured

## Trust Boundary Assessment

### Edge Trust Boundary

In `src/proxy.ts`, the `nonClerkProxy` path uses Auth.js `auth()` from `auth.config.ts`. The JWT is verified by Auth.js using `AUTH_SECRET`. The result is trusted as the authenticated session.

**Trust model**: The edge proxy trusts Auth.js JWT verification. The JWT signature verification is done by Auth.js's internal `jose` library. This is acceptable.

**Constraint**: The edge proxy must import `auth` from `auth.config.ts`, NOT from `auth.ts`. Using `auth.ts` (which may have the Drizzle adapter) in the edge runtime will crash.

### Node Trust Boundary

In RSC pages and route handlers, Auth.js `auth()` from `auth.ts` verifies the session cookie and returns the session. The session `user.id` is the external provider ID. The `DrizzleInternalIdentityLookup` maps this to an internal UUID. Authorization runs only on internal UUIDs.

**Trust chain**: Cookie → Auth.js JWT verify → external userId → InternalIdentityLookup → internal UUID → authorization.

This is correct and mirrors the Clerk trust chain.

## Applicable Security Coding Patterns

| Rule   | Applicability                                                                                |
| ------ | -------------------------------------------------------------------------------------------- |
| SEC-03 | `sanitizeRedirectUrl()` must be applied to any `callbackUrl` forwarded from query params     |
| SEC-05 | N/A (no fs access in auth flows)                                                             |
| SEC-06 | `AUTH_SECRET` must use `openssl rand -base64 32`, not `Math.random()`                        |
| SEC-09 | Auth.js SDK instance must not be shared across requests in a mutable way                     |
| SEC-10 | Auth errors logged to pino must extract `errorMessage`/`errorName` as strings                |
| SEC-15 | Session claims read from JWT must not use `key in sessionObj` lookups without null prototype |
| SEC-17 | `/api/auth/*` endpoints need rate limit consideration (see SEC-AUTH-04)                      |

## Security Constraints for Implementation

### REQUIRED

1. `AUTH_SECRET` minimum 32 bytes, cryptographically random, server-only env var
2. `jwt()` callback must explicitly set `token.emailVerified` per-provider
3. `session()` callback must expose `session.user.id = token.sub`
4. OAuth secrets are server-only env vars, never in client schema
5. Credentials provider (if included) must use timing-safe password comparison
6. `callbackUrl` from query params must use `sanitizeRedirectUrl()` before forwarding
7. Auth.js cookie security attributes must not be weakened from defaults

### FORBIDDEN

1. Setting `emailVerified: true` for Credentials provider without actual verification
2. Logging `AUTH_SECRET`, `GITHUB_CLIENT_SECRET` or any OAuth secret
3. Importing `auth.ts` (with Drizzle adapter) in `src/proxy.ts` (Edge context)
4. Trusting `session.user.id` as an internal UUID without going through `InternalIdentityLookup`
5. Overriding Auth.js's built-in CSRF protection
6. Weakening cookie security attributes (`secure`, `httpOnly`, `sameSite`)

## Security Verdict

**Safe to implement with the constraints above.**

The risk profile is standard for any OAuth/session-based auth implementation. Auth.js is a mature library with good security defaults. The critical risks are:

1. `AUTH_SECRET` management (must be strong, must be secret)
2. `emailVerified` claim mapping (affects cross-provider account linking)
3. `auth.config.ts` / `auth.ts` edge split (prevents runtime crashes AND prevents token leakage)
4. The existing DI/provisioning infrastructure already handles the trust chain correctly — the AuthJS adapter just needs to plug in cleanly

No new security invariants need to be created. Existing invariants from `docs/feature-desings/01 - Final Auth, Authorization and Provisioning Design.md` apply unchanged.
