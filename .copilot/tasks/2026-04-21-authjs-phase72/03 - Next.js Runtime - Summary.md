# 03 - Next.js Runtime - Summary

## Task Context

- **Task ID**: `2026-04-21-authjs-phase72`
- **Task Objective**: Runtime review for email verification flow, brute-force rate limiting in NextAuth handler, and new auth pages
- **Current Run Scope**: Phase 7.2 — new route handlers, new pages, NextAuth handler modification
- **Status**: COMPLETED
- **Last Updated**: 2026-04-21
- **Related Control Artifacts**: `plan.md`, `01 - Architecture Guard - Summary.md`, `02 - Security & Auth - Summary.md`

---

## Scope Handled

- **New route handlers**: `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`
- **Modified route handlers**: `POST /api/auth/signup`, `src/app/api/auth/[...nextauth]/route.ts`
- **New pages**: `/auth/verify-email`, `/auth/verify-email-pending`
- **Runtime questions**: `connection()` placement; Suspense boundaries; `searchParams` handling; `await ctx.params` in modified NextAuth handler; caching; no banned route segment configs

---

## Inputs Reviewed

- `src/app/api/auth/[...nextauth]/route.ts` — existing NextAuth handler
- `src/app/auth/forgot-password/page.tsx` — Suspense pattern reference
- `src/app/auth/reset-password/page.tsx` — searchParams + Suspense pattern reference
- `src/app/auth/signup/page.tsx` — auth-provider guard + session redirect pattern
- `next.config.ts` (via AGENTS.md) — `cacheComponents: true` constraint
- Phase 2 Runtime Summary (`03 - Next.js Runtime - Summary.md` in `.zencoder/chats/...`)
- Architecture Guard Summary (this task)

---

## Runtime Constraints Carried In

- `cacheComponents: true` → `export const dynamic` and `export const runtime` are **BANNED** in all route segments (pages, layouts, route handlers)
- `await connection()` is the only supported dynamic opt-in under Cache Components model
- `searchParams` in Next.js 16 is a `Promise<Record<string,string>>` — must be awaited inside an async RSC

---

## Assessment: New Route Handlers

### `POST /api/auth/verify-email`

- **Node runtime deps**: `crypto.createHash()`, Drizzle DB, bcrypt not needed (only hash comparison) → Node-safe
- **`await connection()`**: REQUIRED — must be first line of handler (same as all other auth API routes)
- **No `export const dynamic` or `export const runtime`**: BANNED — confirmed must not be added
- **Caching**: Route handlers with `POST` are not cached by Next.js — no caching concern
- **Pattern**: Identical to `reset-password/route.ts` — token hash lookup, atomic update, correct

### `POST /api/auth/resend-verification`

- **Node runtime deps**: `crypto.randomBytes()`, Drizzle DB → Node-safe
- **`await connection()`**: REQUIRED — must be first line
- **Rate limiting**: Must call `checkRateLimit()` with `meta: { path: '/api/auth/resend-verification' }` (SEC-17)
- **No `export const dynamic` or `export const runtime`**: BANNED
- **Pattern**: Identical to `forgot-password/route.ts` — rate-limit + user-enumeration-safe response

### `POST /api/auth/signup` (modified)

- **`await connection()`**: Already present — verify it remains first before any DB access ✅
- **New code path**: Token creation and optional dev-mode exposure must be within the existing dynamic rendering scope (after `await connection()`) ✅
- **No new runtime concerns** introduced by adding verification token creation

---

## Assessment: `src/app/api/auth/[...nextauth]/route.ts` Modification

**Current handler**:

```typescript
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> },
) {
  await connection();
  return NextAuth(req, ctx, authOptions) as unknown as Promise<Response>;
}
```

**Modified handler (brute-force rate limit)**:

```typescript
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> },
) {
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

**Runtime analysis**:

- `await ctx.params` is correct for Next.js 16 App Router (params is a Promise) ✅
- `await connection()` is already called first — rate-limit code runs under dynamic rendering scope ✅
- `getIP(req.headers)` uses the standard `Headers` API — `NextRequest.headers` is a `Headers` instance ✅
- `checkRateLimit()` is a Node-safe async call — no Edge-runtime constraint violation ✅
- `Response.json()` is standard Web API — correct return type ✅
- No `export const dynamic` or `export const runtime` — BANNED constraint respected ✅

**One concern**: `NextAuth(req, ctx, authOptions)` is called with `req` as `NextRequest` and `ctx` as the params object. After `await ctx.params`, the original `ctx` still has the Promise-based `params`. Passing the original `ctx` (not `{ params: resolvedParams }`) to NextAuth is correct — NextAuth internally awaits it. ✅

---

## Assessment: New Pages

### `/auth/verify-email/page.tsx`

Reads `token` from `searchParams`. Same pattern as `/auth/reset-password/page.tsx`.

**Required pattern**:

```typescript
async function VerifyEmailPageContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await connection();                       // REQUIRED — first line
  if (env.AUTH_PROVIDER !== 'authjs') redirect('/');

  const { token } = await searchParams;     // await Promise — Next.js 16 App Router
  // DB lookup...
}

export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense fallback={null}>             // REQUIRED — wraps async content component
      <VerifyEmailPageContent searchParams={searchParams} />
    </Suspense>
  );
}
```

**Constraints**:

- `await connection()` before `getAppContainer()` ✅
- `Suspense` boundary required — page reads searchParams at render time ✅
- No `export const dynamic` / `export const runtime` — BANNED ✅
- `searchParams` typed as `Promise<{ token?: string }>` — Next.js 16 requirement ✅

**Success path**: After marking token used and setting `emailVerified=true`, use `redirect('/auth/signin?verified=true')` from `next/navigation`. This is a server-side redirect — correct.

### `/auth/verify-email-pending/page.tsx`

Does NOT read searchParams in an async RSC for verification — only reads `email` for form prefill.

**Pattern**:

```typescript
async function VerifyEmailPendingPageContent({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  await connection();
  if (env.AUTH_PROVIDER !== 'authjs') redirect('/');
  const session = await getServerSession(authOptions);
  if (session) redirect('/');               // already verified and signed in

  const { email } = await searchParams;
  return <VerifyEmailPendingClient defaultEmail={email} />;
}

export default function VerifyEmailPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPendingPageContent searchParams={searchParams} />
    </Suspense>
  );
}
```

**Constraints**: Same as above. ✅

---

## Security Considerations (Runtime Angle)

### Token in URL Query Parameter

The verification token appears in `?token=<rawToken>` in the URL. Runtime notes:

- Next.js does NOT log query params in server logs by default ✅
- `await connection()` ensures no static prerender of the page with the token ✅
- Token must be consumed atomically before any success response is sent ✅
- The token value must NOT be logged — only the event and `userId` (SEC-10 compliant) ✅

### Dev Token Exposure

`devToken` and `devVerifyUrl` in signup response: only present when `NODE_ENV !== 'production' && AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV === true`. These env checks happen at request time (after `await connection()`), which is correct.

---

## No Runtime Issues Found

All proposed new files and modifications comply with:

- `cacheComponents: true` constraint (no banned route segment configs)
- `await connection()` mandatory placement
- `Suspense` boundary pattern for async page content components
- Async `searchParams` (Promise) handling
- `await ctx.params` for route handler params
- No Edge runtime violations (all new code uses Node-only APIs, which is correct for auth routes)

---

## Handoff Notes

- **Implementation Agent must**: Follow all patterns above exactly — no `export const dynamic`, no `export const runtime`; always `await connection()` as first line; always wrap async content in `<Suspense fallback={null}>`; always type `searchParams` as `Promise<...>`
- **Do not re-decide**: Runtime placement, `connection()` pattern, Suspense pattern
- **No blockers for implementation**

---

## Update Log

### 2026-04-21 — Phase 7.2 Runtime Review

- Scope: New verify-email routes, new pages, NextAuth handler modification, signup modification
- Summary: No runtime issues; all patterns confirmed compliant with Next.js 16 `cacheComponents: true` constraints
