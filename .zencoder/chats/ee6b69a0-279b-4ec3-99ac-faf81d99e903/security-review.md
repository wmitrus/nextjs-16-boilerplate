# Security Review — Phase 7: AuthJS Adapter

**Agent**: 02 - Security & Auth
**Plan step**: Security Review
**Date**: 2026-04-20

---

## Auth Surface Assessment

Phase 7 introduces a credential-based auth path (email + password) via Auth.js. This is a significantly different trust model from Clerk (external provider handles credential storage and verification).

### New Trust Boundaries

| Boundary            | Analysis                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Password storage    | Must use bcrypt or argon2 — NEVER SHA256, MD5, or plain text                                       |
| Password comparison | Timing-safe comparison required (bcrypt/argon2 handle this)                                        |
| Session JWT         | Auth.js signs JWTs with `NEXTAUTH_SECRET`/`AUTH_SECRET` — must be in env and not exposed to client |
| CSRF protection     | Auth.js natively handles CSRF for its route handler                                                |
| Email verification  | `emailVerified` flag must default to `false` for credentials — only set `true` when confirmed      |

---

## Authorization Enforcement

- Same `withAuth` Edge middleware applies for both Clerk and AuthJS paths — no weakening
- `enforceResourceAuthorization: false` in proxy.ts remains correct (resource-level auth happens in server-side handlers)
- The provisioning service gates remain intact — `AuthJsRequestIdentitySource.get()` feeds into the same pipeline

---

## Security Coding Rules Applied

| Rule       | Application                                                                  |
| ---------- | ---------------------------------------------------------------------------- |
| **SEC-10** | No raw `error` objects in logger calls — extract `errorMessage`, `errorName` |
| **SEC-06** | `crypto.randomBytes` for token generation (not `Math.random`)                |
| **SEC-15** | No `key in plainObject` for session claims — use null-safe accessors         |
| **SEC-03** | Any `callbackUrl` in Auth.js must be sanitized before redirect               |

---

## Specific Security Requirements for Phase 7

### auth.config.ts (Edge-safe)

- No secrets in Edge config — `AUTH_SECRET` used only at runtime by Auth.js internals
- Authorized redirect callback MUST validate `callbackUrl` to prevent open redirects
- Use `sanitizeRedirectUrl()` from existing security utilities if a redirect param is extracted

### Credentials Provider (auth.ts)

- Password MUST be hashed with bcrypt (cost factor ≥ 10) or argon2
- `authorize()` must return `null` (not throw) when credentials are invalid — prevents timing oracle
- Never log password values — not even in debug mode

### Sign-in/Sign-up Pages

- CSRF token is handled by Auth.js form actions — do not bypass
- Sign-up must validate email format with Zod before DB insert
- Rate limiting already provided by `withRateLimit` in proxy.ts

### Session Claims → Identity

- `emailVerified` from credentials provider must be `false` by default
- `orgExternalId` will be absent for credentials sessions (no external org concept) — this is expected

### Secret Management

- `NEXTAUTH_SECRET` (or `AUTH_SECRET` for v5) must be added to `src/core/env.ts` as a server-only var
- Must NOT be `NEXT_PUBLIC_*`
- Generation: `openssl rand -base64 32`

---

## Tenant Isolation Assessment

- AuthJS sessions are user-scoped; no org/tenant claim in session by default
- Organization context must come from DB (cookie/header-based active tenant selection), not session claims
- `TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=db` is the expected path for AuthJS multi-tenant use
- `TENANCY_MODE=personal` also works — personal org resolved from DB by user ID

---

## Sensitive Data Handling

- Passwords never stored in session tokens
- Session tokens contain: `user.id`, `user.email`, `user.emailVerified` — acceptable
- DB-based org switcher exposes only organizations the user is a member of — must enforce via DB query with user ID

---

## Security Constraints for Implementation

1. bcrypt cost factor MUST be ≥ 10
2. `authorize()` in credentials provider must return `null` on failure (not throw)
3. `callbackUrl` validation in Auth.js `authorized` callback via `sanitizeRedirectUrl()`
4. `AUTH_SECRET` / `NEXTAUTH_SECRET` added to `src/core/env.ts` as server-only required var
5. `emailVerified: false` default for credentials provider sessions
6. Never log credentials, session tokens, or raw errors

---

## Status: APPROVED with CONSTRAINTS

Implementation may proceed. All constraints above must be enforced.
