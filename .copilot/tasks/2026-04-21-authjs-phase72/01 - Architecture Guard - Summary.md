# 01 - Architecture Guard - Summary

## Task Context

- **Task ID**: `2026-04-21-authjs-phase72`
- **Task Objective**: Design email verification flow, brute-force layering, and confirm module structure for Phase 7.2 auth hardening
- **Current Run Scope**: Architecture design for email verification, brute-force protection, session invalidation strategy
- **Status**: COMPLETED
- **Last Updated**: 2026-04-21
- **Related Control Artifacts**: `plan.md`, `intake.md`, `02 - Security & Auth - Summary.md`

---

## Scope Handled

- `email_verification_tokens` table design and module placement
- Email verification UX state machine and page/route structure
- Brute-force rate limit integration point in NextAuth route wrapper
- Session invalidation: JWT maxAge documentation
- Route-policy additions
- Dependency direction validation

---

## Inputs Reviewed

- `src/modules/auth/infrastructure/drizzle/schema.ts`
- `src/modules/auth/infrastructure/authjs/auth.ts`
- `src/modules/auth/infrastructure/authjs/auth.config.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/api/auth/forgot-password/route.ts`
- `src/app/api/auth/reset-password/route.ts`
- `src/app/auth/reset-password/page.tsx` (design reference)
- `src/app/auth/signup/page.tsx`
- `src/app/auth/signin/sign-in-client.tsx`
- `src/security/middleware/route-policy.ts`
- `02 - Security & Auth - Summary.md` (this task)
- Prior Phase 2 Architecture Guard Summary

---

## Current-State Assessment

### What is consistent and good

- Flat `src/app/api/auth/{action}/route.ts` pattern — straightforward, no nested module confusion
- `password_reset_tokens` pattern (schema, API route, page) is the correct reference for email verification
- `authConfig` (Edge-safe) vs `authOptions` (Node-only) split is correct; must be maintained

### What needs to change

- `email_verification_tokens` table: new
- `authorize()`: check `emailVerified` and throw `EmailNotVerified`
- Signup route: create account with `emailVerified=false` by default; generate verification token; no auto-sign-in after signup
- NextAuth route handler: add brute-force rate limit for credential callback
- Two new pages: `/auth/verify-email-pending`, `/auth/verify-email`
- One new API route: `POST /api/auth/verify-email`
- One new API route: `POST /api/auth/resend-verification`
- Sign-in client: add `EmailNotVerified` error handling
- Route-policy: add new auth page routes

---

## Architecture Decisions

### Decision A — `email_verification_tokens` Table Placement

**Owner**: `src/modules/auth/infrastructure/drizzle/schema.ts`

Consistent with `password_reset_tokens`. Auth module owns all credential-related data. FK references `usersReferenceTable` from `@/core/db/schema/references` (same pattern as existing schema).

Schema:

```typescript
export const emailVerificationTokensTable = pgTable(
  'email_verification_tokens',
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
    index('idx_email_verification_tokens_user').on(t.userId),
    index('idx_email_verification_tokens_hash').on(t.tokenHash),
  ],
);
```

Migration `when`: `1776860000000` (> `1776770000000` = migration 0010)
Migration tag: `0011_email_verification_tokens`

### Decision B — Verification UX State Machine

Four terminal states:

| State              | Trigger                            | Page shows                                                                      |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------- |
| `VALID`            | Token found, not expired, not used | Loading → sets `email_verified=true` → redirect to `/auth/signin?verified=true` |
| `ALREADY_VERIFIED` | `usedAt IS NOT NULL`               | "Your email is already verified. Sign in."                                      |
| `EXPIRED`          | `expiresAt <= now()`               | "This link has expired." + resend link                                          |
| `INVALID`          | Token hash not found in DB         | "This link is invalid." + resend link                                           |

**After successful verification**: Redirect to `/auth/signin?verified=true`. Do NOT auto-sign-in (avoids complexity; consistent with "verify → then explicitly sign in" UX convention).

**`/auth/verify-email-pending` page**: Separate route. Shows "Check your inbox" message + resend option. Reached via redirect after signup when `AUTH_DEV_AUTO_VERIFY=false`. Accepts optional `?email=...` query param for the resend form prefill.

### Decision C — New Routes and Pages

#### API routes (all covered by `/api/auth` in `PUBLIC_ROUTE_PREFIXES` — no route-policy change needed):

| Route                                | File                                            | Purpose                                   |
| ------------------------------------ | ----------------------------------------------- | ----------------------------------------- |
| `POST /api/auth/verify-email`        | `src/app/api/auth/verify-email/route.ts`        | Token validation + set emailVerified=true |
| `POST /api/auth/resend-verification` | `src/app/api/auth/resend-verification/route.ts` | Resend token (rate-limited)               |

Modify existing:

- `POST /api/auth/signup` (`src/app/api/auth/signup/route.ts`) — add verification token creation; support `AUTH_DEV_AUTO_VERIFY` and `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV`

#### Pages (add to `AUTH_ROUTE_PREFIXES` in `route-policy.ts`):

| Route                        | File                                         | Purpose                          |
| ---------------------------- | -------------------------------------------- | -------------------------------- |
| `/auth/verify-email`         | `src/app/auth/verify-email/page.tsx`         | Token validation + state display |
| `/auth/verify-email-pending` | `src/app/auth/verify-email-pending/page.tsx` | "Check your inbox" + resend form |

#### `src/security/middleware/route-policy.ts` changes:

```typescript
export const AUTH_ROUTE_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/auth/signin',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email', // new
  '/auth/verify-email-pending', // new
] as const;
```

### Decision D — Signup Flow After Phase 7.2

New signup flow:

1. User submits signup form → `POST /api/auth/signup`
2. Account created with `emailVerified: false` (unless `AUTH_DEV_AUTO_VERIFY=true`)
3. If `AUTH_DEV_AUTO_VERIFY=true` (dev only): `emailVerified: true`, return 201 with `devAutoVerified: true`
4. Otherwise: create `email_verification_tokens` row; return 201 with optional `devToken`/`devVerifyUrl`
5. Client redirects to:
   - If `AUTH_DEV_AUTO_VERIFY=true`: `/auth/signin` (can sign in immediately)
   - Otherwise: `/auth/verify-email-pending?email=<encoded>` (check your inbox)

**Signup API response shape (201)**:

```typescript
// Production / normal dev
{ message: 'Account created. Please verify your email.', emailVerified: false }

// Dev with AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV=true
{ message: '...', emailVerified: false, devToken: string, devVerifyUrl: string }

// Dev with AUTH_DEV_AUTO_VERIFY=true
{ message: 'Account created. You can now sign in.', emailVerified: true, devAutoVerified: true }
```

### Decision E — `authorize()` Changes

Add `EmailNotVerified` throw after successful password check:

```typescript
// After successful bcrypt compare and before returning user:
if (!credRecord.emailVerified) {
  // Dev bypass: AUTH_DEV_AUTO_VERIFY is only active during signup; after that,
  // the emailVerified column IS true. So no bypass check needed here.
  throw new Error('EmailNotVerified');
}
```

**Sign-in client `ERROR_MESSAGES` update**:

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: 'Incorrect email or password.',
  NoCredentials: 'Incorrect email or password.',
  EmailNotVerified: 'Please verify your email before signing in.',
  Default: 'Something went wrong. Please try again.',
};
```

For `EmailNotVerified`, also render a "Resend verification email →" link below the error message (to `/auth/verify-email-pending`).

**Note**: `NoCredentials` message is changed from the Phase 1 "This account was created with a different sign-in method" to the generic "Incorrect email or password." — addressing the medium enumeration risk identified in Phase 2 Security review. The "Forgot password?" link is already always visible, which provides the self-service path.

### Decision F — Brute-Force Rate Limit in NextAuth Route Handler

Modify `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> },
): Promise<Response> {
  await connection();

  const resolvedParams = await ctx.params;
  const isCredentialCallback =
    req.method === 'POST' &&
    resolvedParams.nextauth[0] === 'callback' &&
    resolvedParams.nextauth[1] === 'credentials';

  if (isCredentialCallback) {
    const ip = await getIP(req.headers);
    const rateLimitResult = await checkRateLimit(`signin:ip:${ip}`, {
      path: '/api/auth/callback/credentials',
    });
    if (!rateLimitResult.success) {
      return Response.json(
        {
          error: 'Too many sign-in attempts. Please wait before trying again.',
        },
        { status: 429 },
      );
    }
  }

  return NextAuth(req, ctx, authOptions) as unknown as Promise<Response>;
}
```

**Sign-in client must handle 429**: When `signIn()` returns with an HTTP error that the NextAuth client surfaces, the client should show "Too many sign-in attempts." The 429 from the wrapper is returned before NextAuth processes the request, so `result.error` will likely be `undefined` and `result.ok === false`. The sign-in client must handle `!result?.ok && !result?.error` cases.

**Note on `checkRateLimit` configuration**: The existing `checkRateLimit` uses `API_RATE_LIMIT_REQUESTS` and `API_RATE_LIMIT_WINDOW_SECONDS` from env. For sign-in, a more restrictive limit is needed. Architecture Guard recommends: use the new `AUTH_SIGN_IN_RATE_LIMIT_*` env vars to configure a dedicated limiter, OR use a dedicated prefix key with hardcoded defaults (simpler). Final decision deferred to Implementation Agent — either approach is acceptable.

### Decision G — Session Invalidation: JWT maxAge Documentation

Current `maxAge`: **30 days** (in `auth.config.ts`). This is very long for a production app. As interim mitigation for the "no session invalidation after password reset" deferred issue:

**Action in this PR**: Document the 30-day maxAge as a known risk in `constraints.md`. Do NOT change the default value (it's a behavioral breaking change for existing sessions). Recommend that production deployments configure a shorter value.

**Future task**: Implement `sessionVersion` tracking in `user_credentials` + JWT callback DB query.

---

## Boundary And Dependency Assessment

### `email_verification_tokens` table

- **Owner**: `src/modules/auth/infrastructure/drizzle/schema.ts` ✅
- **Direction**: auth module → core/db ✅
- **No cross-module coupling** ✅

### New API routes

- Owner: `src/app/api/auth/` (delivery layer) ✅
- Dependencies: auth module schema, core/db, core/env, core/logger, shared/rate-limit, shared/network ✅
- No new cross-module coupling introduced ✅

### New pages

- Owner: `src/app/auth/` (delivery layer) ✅
- Same pattern as `reset-password/page.tsx` ✅

### NextAuth route handler modification

- Owner: `src/app/api/auth/[...nextauth]/route.ts` ✅
- Imports: shared/rate-limit, shared/network ✅
- No module boundary violations ✅

### Dependency direction check

All changes follow: `app → modules/security/shared/core` ✅

---

## Complete File Change List

### New files

| File                                                                | Purpose                      |
| ------------------------------------------------------------------- | ---------------------------- |
| `src/app/api/auth/verify-email/route.ts`                            | Token validation endpoint    |
| `src/app/api/auth/resend-verification/route.ts`                     | Resend verification endpoint |
| `src/app/auth/verify-email/page.tsx`                                | Verification result page     |
| `src/app/auth/verify-email/verify-email-client.tsx`                 | Client component             |
| `src/app/auth/verify-email-pending/page.tsx`                        | "Check your inbox" page      |
| `src/app/auth/verify-email-pending/verify-email-pending-client.tsx` | Resend form client           |

### Modified files

| File                                                | Change                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/modules/auth/infrastructure/drizzle/schema.ts` | Add `emailVerificationTokensTable`                                                     |
| `src/modules/auth/infrastructure/authjs/auth.ts`    | Add `EmailNotVerified` throw in `authorize()`                                          |
| `src/app/api/auth/signup/route.ts`                  | Add verification token creation; `AUTH_DEV_AUTO_VERIFY` support; redirect after signup |
| `src/app/api/auth/[...nextauth]/route.ts`           | Add brute-force rate limit for credential callback                                     |
| `src/app/auth/signin/sign-in-client.tsx`            | Add `EmailNotVerified` message + resend link; update `NoCredentials` message           |
| `src/app/auth/signup/sign-up-client.tsx`            | Update redirect behavior after signup (to verify-email-pending)                        |
| `src/security/middleware/route-policy.ts`           | Add `/auth/verify-email` and `/auth/verify-email-pending` to `AUTH_ROUTE_PREFIXES`     |
| `src/core/env.ts`                                   | Add `AUTH_DEV_AUTO_VERIFY`, `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV`, rate limit vars   |
| `src/testing/infrastructure/env.ts`                 | Mirror new env vars with test defaults                                                 |

### New migration

| File                                                                  | Purpose                                  |
| --------------------------------------------------------------------- | ---------------------------------------- |
| `src/core/db/migrations/generated/0011_email_verification_tokens.sql` | Create `email_verification_tokens` table |
| `src/core/db/migrations/generated/meta/0011_snapshot.json`            | Drizzle migration snapshot               |
| `src/core/db/migrations/generated/meta/_journal.json`                 | Add entry with `when: 1776860000000`     |

---

## Risks And Constraints

1. **Signup flow change is a UX behavior change** — users will no longer be auto-signed-in after signup. Signup client must handle the redirect explicitly.
2. **Tests for signup route will need updating** — existing tests that expect immediate sign-in after signup are no longer correct.
3. **`AUTH_DEV_AUTO_VERIFY=true` in test env** — tests should set `AUTH_DEV_AUTO_VERIFY: true` to preserve test behavior for signup→signin scenarios that don't test the verification flow.
4. **429 from route handler wrapper before NextAuth** — `signIn()` client receives an unexpected shape; sign-in client must handle `!result?.ok` even when `result?.error` is falsy.
5. **Migration must run clean** — `when: 1776860000000` must be > migration 0010's `when: 1776770000000` ✅

---

## Open Questions for Next.js Runtime Agent

1. **`verify-email` page**: Reads `searchParams` token, computes hash, queries DB in RSC. Needs `await connection()` before `getAppContainer()`. Is `Suspense` wrapper required? (Yes — same as reset-password page.)
2. **`verify-email` page success path**: After marking token used, should it use `redirect()` directly from the server component? Or return a client component that navigates? (Server-side `redirect()` is fine — same pattern as other auth pages.)
3. **`verify-email-pending` page**: Static server component with client resend form. Reads `email` from searchParams. Does the resend form need Suspense? (Yes — same pattern.)
4. **Brute-force `await connection()` in route handler**: The existing handler already calls `await connection()` before NextAuth. The new rate-limit check happens after `await connection()` — this is correct.

---

## Handoff Notes

- **Next.js Runtime Agent must**: Confirm `await connection()` placement in new pages, Suspense boundary requirements, and that no `export const dynamic` / `export const runtime` are introduced
- **Do not re-decide**: Module placement, UX state machine, route structure, brute-force layer, session invalidation deferral
- **Next specialist**: Next.js Runtime Agent

---

## Update Log

### 2026-04-21 — Phase 7.2 Architecture Review

- Scope: email verification flow design; brute-force layering; session invalidation strategy
- Summary: All architectural decisions made; complete file change list produced
