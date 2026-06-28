# Implementation Plan — Phase 7.2: Email Verification + Brute Force + E2E

**Task workspace**: `.copilot/tasks/2026-04-21-authjs-phase72/`
**Constraints reference**: `constraints.md`
**Status**: ✅ FULLY APPROVED — ready for implementation
**Date**: 2026-04-21

---

## Correction History

| Round | #   | Correction                                                                                | Applied |
| ----- | --- | ----------------------------------------------------------------------------------------- | ------- |
| 1     | 1   | No email in query string                                                                  | ✅      |
| 1     | 2   | Dual-key brute force                                                                      | ✅      |
| 1     | 3   | No `POST /api/auth/verify-email` contradiction                                            | ✅      |
| 1     | 4   | DB transaction for token consume + verified                                               | ✅      |
| 1     | +   | Runtime guard for dev token exposure                                                      | ✅      |
| 2     | 1   | Atomic consume: UPDATE WHERE used_at IS NULL RETURNING                                    | ✅      |
| 2     | 2   | Email delivery Variant B explicit                                                         | ✅      |
| 2     | 3   | Dead `AUTH_SIGN_IN_RATE_LIMIT_*` env vars removed                                         | ✅      |
| 2     | 4   | Dev bypass = auto-verify-on-signup, not auto-login                                        | ✅      |
| 3     | 1   | **Capability-aware copy — no "sent email" / "check your inbox" without mailer**           | ✅      |
| 3     | 2   | **Hard config invariant: REGISTRATION_MODE=open blocked without delivery path**           | ✅      |
| 3     | 3   | **Signup: token insert joins the existing transaction (user + creds + identity + token)** | ✅      |
| 3     | 4   | **Scope narrowed: development/test only — "staging" removed**                             | ✅      |
| 4     | 1   | **Resend token replacement wrapped in DB transaction (delete + insert atomic)**           | ✅      |

---

## Email Delivery — Explicit State

**Current state**: Only `NoOpEmailService` exists. No email is sent. This is a production deployment blocker for `REGISTRATION_MODE=open`.

**What this plan does NOT implement**: email delivery adapter (Resend / SMTP / SendGrid). That is a future task.

**Environments where this feature is usable today**:

| Environment                                                          | Signup path                                                                          | Verification delivery                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Production                                                           | **BLOCKED** — `REGISTRATION_MODE=closed` required (startup validation enforces this) | N/A                                                       |
| Development / test with `AUTH_DEV_AUTO_VERIFY=true`                  | Signup → `emailVerified=true` immediately                                            | No token; user signs in explicitly after signup           |
| Development / test with `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV=true` | Signup → `emailVerified=false`                                                       | Raw token + URL in API response + WARN log; no email sent |

**"Staging"** is deliberately excluded. Preview deployments, shared staging, and publicly accessible non-prod environments must not expose raw verification tokens. `AUTH_DEV_AUTO_VERIFY` and `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV` are **development/test only**.

---

## Pre-Implementation Checklist

- [x] Security & Auth review complete
- [x] Architecture Guard design complete
- [x] Next.js Runtime review complete
- [x] `constraints.md` finalized
- [x] Rounds 1–3 corrections applied
- [x] Round 4 hardening: resend transaction atomic

---

## Phase A — Database Migration

- [ ] A-1: Add `emailVerificationTokensTable` to `src/modules/auth/infrastructure/drizzle/schema.ts`:

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

- [ ] A-2: `pnpm db:generate` → verify journal entry `when: 1776860000000`, tag `0011_email_verification_tokens` → `pnpm db:dev:migrate`

---

## Phase B — Environment Variables

**Not added**: `AUTH_SIGN_IN_RATE_LIMIT_*` — `checkRateLimit()` does not support per-call overrides; adding them would be dead configuration.

- [ ] B-1: Add to `src/core/env.ts` server schema:

  ```typescript
  AUTH_DEV_AUTO_VERIFY: z.coerce.boolean().optional().default(false),
  AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV: z.coerce.boolean().optional().default(false),
  ```

  And to `runtimeEnv`:

  ```typescript
  AUTH_DEV_AUTO_VERIFY: process.env.AUTH_DEV_AUTO_VERIFY,
  AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV: process.env.AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV,
  ```

- [ ] B-2: Add startup validation (scoped to `AUTH_PROVIDER === 'authjs'`). Add to or alongside `validateAuthProviderConfigValues()`:

  ```typescript
  export function validateVerificationConfig(values: {
    authProvider: string | undefined;
    registrationMode: string | undefined;
    nodeEnv: string | undefined;
    devAutoVerify: boolean;
    exposeTokenInDev: boolean;
  }): void {
    if (values.authProvider !== 'authjs') return;

    // Rule 1: Both bypass flags simultaneously is forbidden (config clarity)
    if (values.devAutoVerify && values.exposeTokenInDev) {
      throw new Error(
        '[env] AUTH_DEV_AUTO_VERIFY and AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV cannot both be true. ' +
          'Choose one: auto-verify removes the verification step entirely; expose-token keeps the step but surfaces the token for dev use.',
      );
    }

    // Rule 2: Production with REGISTRATION_MODE=open has no email delivery
    if (values.nodeEnv === 'production' && values.registrationMode === 'open') {
      throw new Error(
        '[env] REGISTRATION_MODE=open with AUTH_PROVIDER=authjs requires email delivery, ' +
          'which is not yet implemented. Set REGISTRATION_MODE=closed until an email adapter is configured.',
      );
    }

    // Rule 3: dev/test with REGISTRATION_MODE=open must have at least one bypass path
    // (otherwise users can sign up but can never verify — dead-end state)
    if (
      values.nodeEnv !== 'production' &&
      values.registrationMode === 'open' &&
      !values.devAutoVerify &&
      !values.exposeTokenInDev
    ) {
      throw new Error(
        '[env] REGISTRATION_MODE=open with AUTH_PROVIDER=authjs in development/test requires ' +
          'AUTH_DEV_AUTO_VERIFY=true or AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV=true. ' +
          'Without one of these, users can sign up but cannot verify their email (no email delivery configured).',
      );
    }

    // Rule 4: Bypass flags must not be enabled in production
    if (values.nodeEnv === 'production' && values.devAutoVerify) {
      throw new Error(
        '[env] AUTH_DEV_AUTO_VERIFY cannot be true in production.',
      );
    }
    if (values.nodeEnv === 'production' && values.exposeTokenInDev) {
      throw new Error(
        '[env] AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV cannot be true in production.',
      );
    }
  }
  ```

  Call `validateVerificationConfig()` from `env.ts` after `validateAuthProviderConfigValues()`.

- [ ] B-3: Mirror in `src/testing/infrastructure/env.ts`:

  ```typescript
  AUTH_DEV_AUTO_VERIFY: true,               // dev/test: auto-verify-on-signup so existing flows work
  AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV: false,
  ```

- [ ] B-4: Add to `.env.example`:
  ```bash
  AUTH_DEV_AUTO_VERIFY=false
  AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV=false
  ```

---

## Phase C — `authorize()` — EmailNotVerified Enforcement

- [ ] C-1: `src/modules/auth/infrastructure/authjs/auth.ts` — after successful `bcrypt.compare()`:

  ```typescript
  if (!credRecord.emailVerified) {
    logger.debug(
      { event: 'auth:email_not_verified', userId: credRecord.userId },
      'Sign-in blocked: email not verified',
    );
    throw new Error('EmailNotVerified');
  }
  ```

  Extend catch block re-throw:

  ```typescript
  if (
    error.message === 'NoCredentials' ||
    error.message === 'EmailNotVerified'
  ) {
    throw error;
  }
  ```

---

## Phase D — Signup Route Modification

- [ ] D-1: `src/app/api/auth/signup/route.ts`

  The existing route already wraps user + credentials + identity inserts in `db.transaction()`. Extend both paths:

  **Path 1 — `AUTH_DEV_AUTO_VERIFY=true`** (development/test only; startup validation blocks production):

  ```typescript
  logger.warn(
    { event: 'auth:signup_dev_auto_verify', provider: 'authjs' },
    '[DEV ONLY] AUTH_DEV_AUTO_VERIFY active — emailVerified set to true at signup without verification step',
  );
  await db.transaction(async (tx) => {
    await tx
      .insert(usersTable)
      .values({ id: userId, email, onboardingComplete: false });
    await tx
      .insert(userCredentialsTable)
      .values({ userId, email, hashedPassword, emailVerified: true });
    await tx
      .insert(authUserIdentitiesTable)
      .values({ provider: 'authjs', externalUserId: email, userId });
    // No token — verification bypassed
  });
  return Response.json(
    {
      message: 'Account created. You can sign in now.',
      emailVerified: true,
      devAutoVerified: true,
    },
    { status: 201 },
  );
  ```

  **Path 2 — normal path** (`AUTH_DEV_AUTO_VERIFY=false`):

  ```typescript
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await db.transaction(async (tx) => {
    await tx
      .insert(usersTable)
      .values({ id: userId, email, onboardingComplete: false });
    await tx
      .insert(userCredentialsTable)
      .values({ userId, email, hashedPassword, emailVerified: false });
    await tx
      .insert(authUserIdentitiesTable)
      .values({ provider: 'authjs', externalUserId: email, userId });
    await tx
      .insert(emailVerificationTokensTable)
      .values({ userId, tokenHash, expiresAt });
    // All four inserts atomic — no partial state possible
  });

  const exposeDevToken =
    env.NODE_ENV !== 'production' &&
    env.AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV === true;

  if (exposeDevToken) {
    const devVerifyUrl = `${env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/verify-email?token=${rawToken}`;
    logger.warn(
      { event: 'auth:signup_dev_token_exposed', devVerifyUrl },
      '[DEV ONLY] Verification token exposed — never enable AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV in production',
    );
    return Response.json(
      {
        message:
          'Account created. Email verification is required before sign-in.',
        emailVerified: false,
        devToken: rawToken,
        devVerifyUrl,
      },
      { status: 201 },
    );
  }

  return Response.json(
    {
      message:
        'Account created. Email verification is required before sign-in.',
      emailVerified: false,
    },
    { status: 201 },
  );
  ```

  **Copy note**: `"Account created. Email verification is required before sign-in."` — does not claim email was sent. Capability-aware.

- [ ] D-2: `src/app/auth/signup/sign-up-client.tsx`

  After 201 response:
  - If `data.emailVerified === true`: redirect to `/auth/signin`
  - Else: redirect to `/auth/verify-email-pending` — **no query parameters**

---

## Phase E — Resend Verification Route

- [ ] E-1: Create `src/app/api/auth/resend-verification/route.ts`

  **Copy**: `SAFE_RESPONSE` must not claim email was sent:

  ```typescript
  const SAFE_RESPONSE = {
    message:
      'If verification delivery is enabled and the account exists, a new verification step has been created.',
  };
  ```

  Logic:

  ```
  await connection()                         ← MUST be first
  AUTH_PROVIDER guard → 404
  Rate limit by IP: checkRateLimit(`resend-verification:${ip}`, { path: '/api/auth/resend-verification' })
    → exceeded: return SAFE_RESPONSE 200     (user-enumeration safe)
  Parse { email } from body (zod)

  Look up user by email; look up credentials:
    not found → return SAFE_RESPONSE 200
    emailVerified=true → return SAFE_RESPONSE 200 (silently)

  DB TRANSACTION (token replacement is atomic — delete old + insert new, or neither):
    await tx.delete(emailVerificationTokensTable).where(
      and(eq(userId), isNull(usedAt))   // clear all pending tokens for this user
    )
    await tx.insert(emailVerificationTokensTable).values({ userId, tokenHash, expiresAt })
    // If insert fails, delete is rolled back — user retains previous token state

  Log INFO: auth:verification_token_created, userId

  [Email delivery — NOT in scope; future task]

  Runtime guard (both conditions inline):
    if (env.NODE_ENV !== 'production' && env.AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV === true):
      log WARN devVerifyUrl
      return { ...SAFE_RESPONSE, devToken, devVerifyUrl }

  return SAFE_RESPONSE 200
  ```

---

## Phase F — Verify Email Page

- [ ] F-1: Create `src/app/auth/verify-email/page.tsx` + `verify-email-client.tsx`

  **Outer page (shell — no logic)**:

  ```typescript
  export default function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
    return (
      <Suspense fallback={null}>
        <VerifyEmailPageContent searchParams={searchParams} />
      </Suspense>
    );
  }
  ```

  **`VerifyEmailPageContent` async RSC**:

  ```
  await connection()                    ← MUST be first
  AUTH_PROVIDER guard → redirect('/')
  const { token } = await searchParams
  if (!token) → render <NoToken />

  tokenHash = sha256(token)

  DB TRANSACTION:
    Step 1 — atomic consume gate:
      consumed = await tx
        .update(emailVerificationTokensTable)
        .set({ usedAt: new Date() })
        .where(
          eq(tokenHash) AND gt(expiresAt, now()) AND isNull(usedAt)
        )
        .returning({ userId, id })

    If consumed.length === 0:
      Diagnostic read (read-only — no writes):
        existing = SELECT usedAt, expiresAt WHERE tokenHash = $hash LIMIT 1
        if !existing         → render <InvalidToken />   (not found)
        if existing.usedAt   → render <AlreadyVerified />
        /* expiresAt <= now implied */ → render <ExpiredToken /> (with resend form)
      [transaction ends — no writes on failure paths]

    If consumed.length === 1:
      Step 2 — set verified (same transaction):
        UPDATE user_credentials SET emailVerified=true, updatedAt=now() WHERE userId=$userId
      Log INFO: auth:email_verified, userId

  redirect('/auth/signin?verified=true')  ← after transaction commits
  ```

  **TOCTOU guarantee**: `UPDATE WHERE usedAt IS NULL` is the single DB-serialised gate. Concurrent requests compete at the write level — exactly one wins. No SELECT→UPDATE race possible.

  **Client component** (`verify-email-client.tsx`): renders `NoToken`, `InvalidToken`, `AlreadyVerified`, `ExpiredToken`. `ExpiredToken` and `NoToken` include `<ResendVerificationForm />` with an email `<input>`.

- [ ] F-2: Create `src/app/auth/verify-email-pending/page.tsx` + `verify-email-pending-client.tsx`

  **No email in query string.**

  RSC:

  ```
  await connection()
  AUTH_PROVIDER guard
  session = await getServerSession(authOptions)
  if (session) redirect('/')
  render <VerifyEmailPendingClient />
  ```

  `VerifyEmailPendingClient` copy — capability-aware (no email claim):

  > "Your account requires email verification before sign-in."
  > "Use the form below to request a new verification step."
  > [email input field] [Resend button]

  On submit: POST `/api/auth/resend-verification`; show SAFE_RESPONSE message.
  Suspense wrapper required.

---

## Phase G — Route Policy

- [ ] G-1: `src/security/middleware/route-policy.ts` — add to `AUTH_ROUTE_PREFIXES`:
  ```typescript
  '/auth/verify-email',
  '/auth/verify-email-pending',
  ```

---

## Phase H — Sign-in Client

- [ ] H-1: `src/app/auth/signin/sign-in-client.tsx`

  ```typescript
  const ERROR_MESSAGES: Record<string, string> = {
    CredentialsSignin: 'Incorrect email or password.',
    NoCredentials: 'Incorrect email or password.',
    EmailNotVerified: 'Email verification is required before sign-in.',
    Default: 'Something went wrong. Please try again.',
  };
  ```

  For `EmailNotVerified` state: render link → `/auth/verify-email-pending` with label "Request verification step →".

  Handle 429 from brute-force wrapper (`!result?.ok && !result?.error`):

  ```typescript
  setFormError('Too many sign-in attempts. Please wait before trying again.');
  ```

---

## Phase I — NextAuth Route Handler: Dual-Key Brute-Force

- [ ] I-1: `src/app/api/auth/[...nextauth]/route.ts`

  ```typescript
  import { createHash } from 'node:crypto';
  import { type NextRequest, connection } from 'next/server';
  import NextAuth from 'next-auth/next';

  import { authOptions } from '@/modules/auth/infrastructure/authjs/auth';
  import { getIP } from '@/shared/lib/network/get-ip';
  import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';

  const SIGNIN_PATH = '/api/auth/callback/credentials';

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

      const ipResult = await checkRateLimit(`signin:ip:${ip}`, {
        path: SIGNIN_PATH,
      });

      let identifierResult = { success: true as boolean };
      try {
        const form = await req.clone().formData();
        const rawEmail = form.get('email');
        if (typeof rawEmail === 'string' && rawEmail.length > 0) {
          const normalized = rawEmail.toLowerCase().trim();
          const identifierHash = createHash('sha256')
            .update(normalized)
            .digest('hex');
          identifierResult = await checkRateLimit(
            `signin:identifier:${identifierHash}`,
            { path: SIGNIN_PATH },
          );
        }
      } catch {
        // Body parse failure — IP limit still enforced
      }

      if (!ipResult.success || !identifierResult.success) {
        return Response.json(
          {
            error:
              'Too many sign-in attempts. Please wait before trying again.',
          },
          { status: 429 },
        );
      }
    }

    return NextAuth(req, ctx, authOptions) as unknown as Promise<Response>;
  }

  export { handler as GET, handler as POST };
  ```

  Rate limits use global `API_RATE_LIMIT_REQUESTS` / `API_RATE_LIMIT_WINDOW` via `checkRateLimit`. The prefix keys `signin:ip:` and `signin:identifier:` isolate sign-in counters.

---

## Phase J — Unit Tests

- [ ] J-1: Signup tests
  - `AUTH_DEV_AUTO_VERIFY: true` (test env default): 201 with `emailVerified: true`; client redirects to `/auth/signin` — **no behaviour change for existing passing tests**
  - `AUTH_DEV_AUTO_VERIFY: false`: 201 with `emailVerified: false`; client redirects to `/auth/verify-email-pending`; token row created in same transaction

- [ ] J-2: Startup validation tests (`validateVerificationConfig`):
  - `authjs` + `REGISTRATION_MODE=open` + `production` → throws
  - `authjs` + `REGISTRATION_MODE=open` + `development` + neither bypass → throws
  - `authjs` + `REGISTRATION_MODE=open` + `development` + `AUTO_VERIFY=true` → ok
  - `authjs` + `REGISTRATION_MODE=open` + `development` + `EXPOSE_TOKEN=true` → ok
  - Both bypass flags `true` simultaneously → throws
  - `production` + `AUTH_DEV_AUTO_VERIFY=true` → throws
  - `production` + `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV=true` → throws

- [ ] J-3: `authorize()` `EmailNotVerified` path:
  - Correct password + `emailVerified=false` → throws `EmailNotVerified`
  - Correct password + `emailVerified=true` → returns user

- [ ] J-4: Verify-email page (mock DB):
  - `UPDATE RETURNING` → 1 row: `emailVerified` set; redirect
  - `UPDATE RETURNING` → 0 rows, `usedAt IS NOT NULL`: `AlreadyVerified`
  - `UPDATE RETURNING` → 0 rows, `expiresAt <= now`: `ExpiredToken`
  - `UPDATE RETURNING` → 0 rows, row not found: `InvalidToken`
  - No token param: `NoToken`

- [ ] J-5: Resend route:
  - Rate limit exceeded → 200 SAFE_RESPONSE
  - User not found → 200 SAFE_RESPONSE
  - Already verified → 200 SAFE_RESPONSE
  - Valid unverified user → 200 SAFE_RESPONSE; new token inserted; old pending tokens deleted

- [ ] J-6: NextAuth route handler:
  - IP rate limit exceeded → 429
  - Identifier rate limit exceeded → 429
  - Both within limit → passes through
  - Non-credential POST → no rate-limit check

---

## Phase K — Validation Gate

- [ ] K-1: `pnpm typecheck` — zero errors
- [ ] K-2: `pnpm lint --fix` — zero unfixable errors
- [ ] K-3: `pnpm test` — all tests pass; coverage ≥ 75% all four dimensions
- [ ] K-4: `pnpm db:dev:reset && pnpm db:dev:migrate` — 11 migrations apply cleanly

---

## Phase L — Playwright E2E Specs (Pattern F)

All auth pages are publicly accessible. No `storageState`. No credentials. Minimum: page loads, title, key UI elements.

- [ ] L-1: `e2e/auth/signin.spec.ts`
- [ ] L-2: `e2e/auth/signup.spec.ts`
- [ ] L-3: `e2e/auth/forgot-password.spec.ts`
- [ ] L-4: `e2e/auth/reset-password.spec.ts` — no token → error state; no crash
- [ ] L-5: `e2e/auth/verify-email.spec.ts` — no token → `NoToken` state; resend form visible
- [ ] L-6: `e2e/auth/verify-email-pending.spec.ts` — message visible; email input field present

---

## File Change List

### New files

| File                                                                | Phase |
| ------------------------------------------------------------------- | ----- |
| `src/app/api/auth/resend-verification/route.ts`                     | E-1   |
| `src/app/auth/verify-email/page.tsx`                                | F-1   |
| `src/app/auth/verify-email/verify-email-client.tsx`                 | F-1   |
| `src/app/auth/verify-email-pending/page.tsx`                        | F-2   |
| `src/app/auth/verify-email-pending/verify-email-pending-client.tsx` | F-2   |
| `e2e/auth/signin.spec.ts`                                           | L-1   |
| `e2e/auth/signup.spec.ts`                                           | L-2   |
| `e2e/auth/forgot-password.spec.ts`                                  | L-3   |
| `e2e/auth/reset-password.spec.ts`                                   | L-4   |
| `e2e/auth/verify-email.spec.ts`                                     | L-5   |
| `e2e/auth/verify-email-pending.spec.ts`                             | L-6   |

### Modified files

| File                                                  | Phase    |
| ----------------------------------------------------- | -------- |
| `src/modules/auth/infrastructure/drizzle/schema.ts`   | A-1      |
| `src/modules/auth/infrastructure/authjs/auth.ts`      | C-1      |
| `src/app/api/auth/signup/route.ts`                    | D-1      |
| `src/app/auth/signup/sign-up-client.tsx`              | D-2      |
| `src/app/api/auth/[...nextauth]/route.ts`             | I-1      |
| `src/app/auth/signin/sign-in-client.tsx`              | H-1      |
| `src/security/middleware/route-policy.ts`             | G-1      |
| `src/core/env.ts`                                     | B-1, B-2 |
| `src/testing/infrastructure/env.ts`                   | B-3      |
| `.env.example`                                        | B-4      |
| `src/core/db/migrations/generated/meta/_journal.json` | A-2      |

---

## Sequencing

```
A (schema + migration)  ─┐
B (env vars)             ├─→ C, D, E, F, G, H, I → J → K → L
```
