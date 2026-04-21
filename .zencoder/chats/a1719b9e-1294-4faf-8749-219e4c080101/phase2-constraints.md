# Phase 2 — Constraints

**Task ID**: `a1719b9e-1294-4faf-8749-219e4c080101`
**Date**: 2026-04-21
**Sources**: Security & Auth Summary (Phase 2), Architecture Guard Summary (Phase 2), Next.js Runtime Summary (Phase 2)

---

## Security Constraints (Hard — Non-Negotiable)

| #     | Constraint                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-A | `/api/auth/set-password` MUST be deleted — it is a CRITICAL account takeover vulnerability. No version of unauthenticated credential mutation is acceptable.        |
| SEC-B | Forgot-password API MUST return `200` with identical body regardless of whether the email exists — prevents account enumeration (CWE-200).                          |
| SEC-C | Token generation: `crypto.randomBytes(32)` → base64url-encode. NEVER `Math.random()` (SEC-06).                                                                      |
| SEC-D | Token storage: SHA-256 hash of the raw token only. Raw token is NEVER persisted.                                                                                    |
| SEC-E | Token expiry: 15 minutes from generation. Enforced on read, not just write.                                                                                         |
| SEC-F | Token is single-use: `usedAt` column set atomically on first valid use. Reuse must be rejected with the same error as an expired token (no information difference). |
| SEC-G | Raw token MUST NOT appear in any server-side log. Log `tokenId` (the DB row ID) only.                                                                               |
| SEC-H | Raw token in response body is ONLY allowed when `NODE_ENV === 'development'`. Production response MUST NOT include the token.                                       |
| SEC-I | The reset-password API endpoint MUST check token hash, expiry, AND usedAt in a single atomic read before allowing password update.                                  |
| SEC-J | Rate limiting on `/api/auth/forgot-password`: max 3 requests per IP per 15 minutes (use existing `checkRateLimit()` infrastructure).                                |

---

## Architecture Constraints

| #      | Constraint                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ARCH-A | `password_reset_tokens` table belongs in `src/modules/auth/infrastructure/drizzle/schema.ts` — same file as `userCredentialsTable`.                          |
| ARCH-B | New migration required: `pnpm db:generate` after schema changes.                                                                                             |
| ARCH-C | API routes: `src/app/api/auth/forgot-password/route.ts` and `src/app/api/auth/reset-password/route.ts`.                                                      |
| ARCH-D | Pages: `src/app/auth/forgot-password/` (modify to add form), `src/app/auth/reset-password/` (new).                                                           |
| ARCH-E | Files to DELETE: `src/app/api/auth/set-password/route.ts`, `src/app/auth/set-password/page.tsx`, `src/app/auth/set-password/set-password-client.tsx`.        |
| ARCH-F | Route-policy: Remove `/auth/set-password` from `AUTH_ROUTE_PREFIXES`. Add `/auth/reset-password`.                                                            |
| ARCH-G | `NoCredentials` error message on sign-in: change to NOT disclose provider type. Remove the `errorCode === 'NoCredentials'` conditional link to set-password. |
| ARCH-H | Sign-in form: add always-visible "Forgot password?" link positioned below the password field label.                                                          |
| ARCH-I | Email sending is out of scope for Phase 2 — implement the full token flow; dev-mode returns token in response.                                               |

---

## Runtime Constraints

| #    | Constraint                                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RT-A | All new route handlers: `await connection()` as first statement (opts into dynamic rendering, satisfies Next.js 16 + cacheComponents).                           |
| RT-B | All new pages: inner async function calls `await connection()` before accessing `searchParams` or `getServerSession`.                                            |
| RT-C | All new pages: wrapped in a `<Suspense fallback={null}>` boundary (consistent with all existing auth pages).                                                     |
| RT-D | `searchParams` typed as `Promise<{ token?: string }>` in reset-password page — awaited inside the inner async component.                                         |
| RT-E | `export const runtime` and `export const dynamic` are BANNED — hard error with `cacheComponents: true`.                                                          |
| RT-F | Token from URL searchParam is passed to client component as a prop, not extracted on the client. The client form POSTs the token to the API in the request body. |

---

## Explicitly Allowed Changes

- Add `password_reset_tokens` table to auth module schema
- Generate new Drizzle migration
- Create `POST /api/auth/forgot-password` route handler
- Create `POST /api/auth/reset-password` route handler
- Modify `/auth/forgot-password` page to include email form (replaces placeholder)
- Create `/auth/reset-password` page + client component
- Modify `sign-in-client.tsx`: add always-visible "Forgot password?" link, update `NoCredentials` message, remove conditional set-password link
- Delete all set-password files
- Modify `route-policy.ts`: remove `/auth/set-password`, add `/auth/reset-password`

---

## Explicitly Forbidden Changes

- Any unauthenticated credential mutation endpoint (even with rate limiting)
- Returning raw token in any non-development response
- Logging raw tokens or email+token combinations
- Using `Math.random()` for token generation
- Using `export const runtime` or `export const dynamic` in any App Router segment
- Adding email-sending infrastructure in Phase 2 (out of scope)

---

## Protected Invariants

- All auth pages follow the `Suspense > inner async component > await connection()` pattern
- All auth API routes use `getAppContainer().resolve(INFRASTRUCTURE.DB)` for DB access
- No cross-module coupling: token table lives in auth module, accessed only by auth routes
- `REGISTRATION_MODE` gate on `/api/auth/signup` — not applicable to password reset (reset is not registration)

---

## DB Schema — `password_reset_tokens`

```typescript
export const passwordResetTokensTable = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersReferenceTable.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_password_reset_tokens_user').on(t.userId),
    index('idx_password_reset_tokens_hash').on(t.tokenHash),
  ],
);
```

---

## API Contract

### `POST /api/auth/forgot-password`

**Request**: `{ email: string }`
**Response (always 200)**: `{ message: 'If an account with this email exists, a reset link has been sent.' }`
**Response (dev only, additional field)**: `{ message: '...', devToken: '<raw-token>' }`
**Errors**: 400 (invalid body), 422 (validation), 429 (rate limited), 404 (AUTH_PROVIDER !== 'authjs')

### `POST /api/auth/reset-password`

**Request**: `{ token: string, password: string }`
**Response (success)**: `{ success: true }` — 200
**Errors**: 400 (invalid body), 422 (validation), 410 (token expired/used/invalid — always same message: 'This password reset link is invalid or has expired. Please request a new one.'), 404 (AUTH_PROVIDER !== 'authjs')
