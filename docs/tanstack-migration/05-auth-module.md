# Phase 4: Auth Module – Better Auth Integration

## Objective

Replace the Clerk-based auth module with Better Auth. This is the most significant module-level change in the entire migration. The auth module boundary is preserved, but all infrastructure adapters are replaced.

**Prerequisite**: Phase 3 (DB Layer) complete. Better Auth schema tables must exist.

---

## Architecture Summary

### What changes

- All Clerk-specific adapters deleted
- Better Auth instance created as the auth foundation
- New `BetterAuthIdentitySource` replaces `ClerkRequestIdentitySource`
- `DrizzleInternalIdentityLookup` simplified or removed (Better Auth manages identity natively)
- `RequestScopedIdentityProvider` logic simplified
- `AuthModuleConfig` simplified (no `authProvider` field)
- Provisioning adapter simplified (no external ID mapping write-path)

### What stays the same

- Auth module boundary (`src/modules/auth/index.ts` exports same interface)
- `AUTH.IDENTITY_SOURCE`, `AUTH.IDENTITY_PROVIDER`, `AUTH.TENANT_RESOLVER` tokens
- `IdentityProvider` contract
- `RequestIdentitySource` contract
- `TenantResolver` contract
- Tenancy mode logic (single / personal / org)

---

## 1. Better Auth Instance

### `src/modules/auth/lib/auth.ts` (new)

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { db } from '@/core/db';
import * as schema from '@/core/db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.baUser,
      session: schema.baSession,
      account: schema.baAccount,
      verification: schema.baVerification,
    },
  }),

  plugins: [tanstackStartCookies()],

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  trustedOrigins: [process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
```

**Notes**:

- `tanstackStartCookies()` plugin handles cookie reading/writing in TanStack Start context (uses `getWebRequest()` and `appendResponseHeader()` from `@tanstack/react-start/server`)
- `db` is the process-scoped DB instance – **not** injected via DI container because Better Auth instance is module-level singleton
- Social login plugins (Google, GitHub, etc.) can be added in `plugins[]`

### `src/modules/auth/lib/auth-client.ts` (new – client-side)

```ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_APP_URL ?? 'http://localhost:3000',
});

export const { signIn, signOut, signUp, useSession } = authClient;
```

The auth client is used in React components (client-side) for sign-in/sign-up flows and session access.

---

## 2. Session Helpers

### `src/modules/auth/lib/session.ts` (new)

```ts
import { auth } from './auth';
import { getWebRequest } from '@tanstack/react-start/server';

/**
 * Get current session in server context.
 * Returns null if no session (not authenticated).
 */
export async function getSession() {
  const request = getWebRequest();
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  return session;
}

/**
 * Assert session exists. Throws if not authenticated.
 * Use in server functions that require authentication.
 */
export async function ensureSession() {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized: session required');
  }
  return session;
}

export type { Session } from './auth';
```

---

## 3. Auth API Route Handler

Better Auth handles all auth operations via HTTP at `/api/auth/*`.

### `src/app/routes/api/auth/$.tsx` (new)

```tsx
import { createAPIFileRoute } from '@tanstack/react-start/api';
import { auth } from '@/modules/auth/lib/auth';

export const APIRoute = createAPIFileRoute('/api/auth/$')({
  GET: ({ request }) => auth.handler(request),
  POST: ({ request }) => auth.handler(request),
});
```

This single catch-all route handles all Better Auth endpoints:

- `POST /api/auth/sign-in/email`
- `POST /api/auth/sign-up/email`
- `POST /api/auth/sign-out`
- `GET /api/auth/get-session`
- `POST /api/auth/verify-email`
- etc.

---

## 4. `BetterAuthIdentitySource` – Replaces Clerk Adapter

### `src/modules/auth/infrastructure/better-auth/BetterAuthIdentitySource.ts` (new)

```ts
import type { RequestIdentitySource } from '@/core/contracts/identity';
import { getSession } from '@/modules/auth/lib/session';

/**
 * RequestIdentitySource backed by Better Auth session.
 *
 * Better Auth manages identity natively – no external ID mapping required.
 * The session contains the Better Auth user ID directly.
 */
export class BetterAuthIdentitySource implements RequestIdentitySource {
  async get() {
    const session = await getSession();

    if (!session) {
      return {
        userId: undefined,
        tenantExternalId: undefined,
        email: undefined,
      };
    }

    return {
      userId: session.user.id,
      tenantExternalId: undefined,
      email: session.user.email,
    };
  }
}
```

**Key difference from Clerk**: The `userId` returned here is the **Better Auth user ID** (which is a string, not UUID). The provisioning module is responsible for mapping this to an internal domain UUID.

---

## 5. `RequestScopedIdentityProvider` – Adapted

The existing `RequestScopedIdentityProvider` maps `RequestIdentitySource` → `IdentityProvider`. With Better Auth:

- The internal identity lookup (`DrizzleInternalIdentityLookup`) remains but is simplified
- It looks up `users.betterAuthId = session.user.id` instead of the complex `(provider, externalId)` tuple

### `src/modules/auth/infrastructure/RequestScopedIdentityProvider.ts` (adapted)

```ts
import type {
  IdentityProvider,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import type { DrizzleInternalIdentityLookup } from './drizzle/DrizzleInternalIdentityLookup';

export class RequestScopedIdentityProvider implements IdentityProvider {
  constructor(
    private readonly identitySource: RequestIdentitySource,
    private readonly lookup: DrizzleInternalIdentityLookup,
  ) {}

  async getIdentity() {
    const rawIdentity = await this.identitySource.get();

    if (!rawIdentity.userId) {
      return null;
    }

    const internalUser = await this.lookup.findByBetterAuthId(
      rawIdentity.userId,
    );

    if (!internalUser) {
      return null;
    }

    return {
      id: internalUser.id,
      email: internalUser.email,
      tenantId: undefined,
    };
  }
}
```

---

## 6. `DrizzleInternalIdentityLookup` – Simplified

### `src/modules/auth/infrastructure/drizzle/DrizzleInternalIdentityLookup.ts` (adapted)

```ts
import type { DrizzleDb } from '@/core/db';
import { users } from '@/core/db/schema';
import { eq } from 'drizzle-orm';

export class DrizzleInternalIdentityLookup {
  constructor(private readonly db: DrizzleDb) {}

  async findByBetterAuthId(betterAuthId: string) {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.betterAuthId, betterAuthId))
      .limit(1);

    return result[0] ?? null;
  }
}
```

**Simplified from Next.js version**: No longer needs `(provider, externalId)` composite lookup. Single `betterAuthId` field lookup.

**Removed from Next.js version**: The `auth_user_identities` and `auth_tenant_identities` tables are gone. The complex cross-provider lookup logic is gone.

---

## 7. Auth Module Registration (`index.ts`)

### `src/modules/auth/index.ts` (adapted)

```ts
import type { Container, Module } from '@/core/container';
import { AUTH, INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db';
import type { TenancyMode } from '@/modules/provisioning/domain/tenancy-mode';
import type { TenantContextSource } from '@/modules/provisioning/domain/tenant-context-source';
import type { MembershipRepository } from '@/core/contracts/repositories';

import { BetterAuthIdentitySource } from './infrastructure/better-auth/BetterAuthIdentitySource';
import { DrizzleInternalIdentityLookup } from './infrastructure/drizzle/DrizzleInternalIdentityLookup';
import { RequestScopedIdentityProvider } from './infrastructure/RequestScopedIdentityProvider';
import { DrizzleUserRepository } from '@/modules/user/infrastructure/drizzle/DrizzleUserRepository';

import { OrgDbTenantResolver } from '@/modules/provisioning/infrastructure/OrgDbTenantResolver';
import { PersonalTenantResolver } from '@/modules/provisioning/infrastructure/PersonalTenantResolver';
import { SingleTenantResolver } from '@/modules/provisioning/infrastructure/SingleTenantResolver';
import { CompositeActiveTenantSource } from '@/modules/provisioning/infrastructure/request-context/CompositeActiveTenantSource';
import { CookieActiveTenantSource } from '@/modules/provisioning/infrastructure/request-context/CookieActiveTenantSource';
import { HeaderActiveTenantSource } from '@/modules/provisioning/infrastructure/request-context/HeaderActiveTenantSource';

export interface AuthModuleConfig {
  tenancyMode: TenancyMode;
  defaultTenantId?: string;
  tenantContextSource?: TenantContextSource;
  tenantContextHeader: string;
  tenantContextCookie: string;
  membershipRepository?: MembershipRepository;
}

export function createAuthModule(config: AuthModuleConfig): Module {
  return {
    register(container: Container) {
      if (!container.has(INFRASTRUCTURE.DB)) {
        throw new Error('[authModule] Missing INFRASTRUCTURE.DB');
      }

      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
      const identitySource = new BetterAuthIdentitySource();
      const lookup = new DrizzleInternalIdentityLookup(db);
      const userRepository = new DrizzleUserRepository(db);

      const tenantResolver = buildTenantResolver(config, lookup);

      container.register(AUTH.IDENTITY_SOURCE, identitySource);
      container.register(
        AUTH.IDENTITY_PROVIDER,
        new RequestScopedIdentityProvider(identitySource, lookup),
      );
      container.register(AUTH.TENANT_RESOLVER, tenantResolver);
      container.register(AUTH.USER_REPOSITORY, userRepository);
    },
  };
}

function buildTenantResolver(
  config: AuthModuleConfig,
  lookup: DrizzleInternalIdentityLookup,
) {
  switch (config.tenancyMode) {
    case 'single': {
      if (!config.defaultTenantId) {
        throw new Error(
          '[authModule] TENANCY_MODE=single requires DEFAULT_TENANT_ID',
        );
      }
      return new SingleTenantResolver(config.defaultTenantId);
    }

    case 'personal': {
      return new PersonalTenantResolver(lookup);
    }

    case 'org': {
      if (config.tenantContextSource !== 'db') {
        throw new Error(
          '[authModule] TENANCY_MODE=org requires TENANT_CONTEXT_SOURCE=db with Better Auth',
        );
      }
      if (!config.membershipRepository) {
        throw new Error(
          '[authModule] TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=db requires membershipRepository',
        );
      }
      const activeTenantSource = new CompositeActiveTenantSource([
        new HeaderActiveTenantSource(config.tenantContextHeader),
        new CookieActiveTenantSource(config.tenantContextCookie),
      ]);
      return new OrgDbTenantResolver(
        activeTenantSource,
        config.membershipRepository,
      );
    }

    default:
      throw new Error(
        `[authModule] Unknown TENANCY_MODE: ${config.tenancyMode}`,
      );
  }
}
```

**Key changes from Next.js version**:

- `authProvider` field removed from `AuthModuleConfig`
- `buildIdentitySource` function removed (was a switch on `authProvider`) – always `BetterAuthIdentitySource`
- `TENANT_CONTEXT_SOURCE=provider` option removed (Clerk-specific). Better Auth is self-hosted; tenant context must come from DB.
- `OrgProviderTenantResolver` deleted (Clerk organizations-specific)
- `crossProviderEmailLinking` removed (Clerk-specific concept)

---

## 8. Auth UI Components

### `src/modules/auth/ui/SignInForm.tsx` (new)

```tsx
'use client';
import { signIn } from '@/modules/auth/lib/auth-client';
import { useRouter } from '@tanstack/react-router';

export function SignInForm() {
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await signIn.email({
      email: form.get('email') as string,
      password: form.get('password') as string,
      callbackURL: '/app',
    });
    router.invalidate();
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit">Sign In</button>
    </form>
  );
}
```

### `src/modules/auth/ui/SignUpForm.tsx` (new)

```tsx
'use client';
import { signUp } from '@/modules/auth/lib/auth-client';
import { useRouter } from '@tanstack/react-router';

export function SignUpForm() {
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await signUp.email({
      email: form.get('email') as string,
      password: form.get('password') as string,
      name: form.get('name') as string,
      callbackURL: '/auth/bootstrap',
    });
    router.invalidate();
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" type="text" required />
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit">Sign Up</button>
    </form>
  );
}
```

### `src/modules/auth/ui/AuthControls.tsx` (adapted from Next.js)

```tsx
'use client';
import { signOut, useSession } from '@/modules/auth/lib/auth-client';

export function AuthControls() {
  const { data: session } = useSession();

  if (!session) {
    return <a href="/auth/sign-in">Sign In</a>;
  }

  return (
    <div>
      <span>{session.user.email}</span>
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  );
}
```

---

## 9. Route Protection

### Auth-guarded layout route

```tsx
// src/app/routes/_authed/route.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { getSession } from '@/modules/auth/lib/session';

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: '/auth/sign-in' });
    }
    return { session };
  },
});
```

The `beforeLoad` function runs on the server during SSR and on the client during navigation. Session check is authoritative on server-side SSR, providing a secure redirect.

---

## 10. Deleted Files

All Clerk-specific adapters are deleted:

- `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`
- `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts`
- `src/modules/auth/infrastructure/supabase/SupabaseRequestIdentitySource.ts`
- `src/modules/auth/infrastructure/system/SystemIdentitySource.ts` ← may be kept for testing
- `src/modules/provisioning/infrastructure/OrgProviderTenantResolver.ts` (Clerk orgs)

---

## Risks

| Risk                                                                          | Severity      | Mitigation                                                                                                          |
| ----------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `getWebRequest()` from TanStack Start throws if called outside server context | CRITICAL      | Only call `getSession()` inside server functions, `beforeLoad`, loaders, or middleware. Never in client components. |
| Better Auth `tanstackStartCookies` plugin requires Nitro cookie support       | MAJOR         | Verified to work with TanStack Start v1; test at integration level                                                  |
| `ba_user.id` is `text` not UUID – type mismatch with domain `users.id` (UUID) | MAJOR         | Store as `text` in `betterAuthId` column; internal user UUID remains authoritative                                  |
| Email verification flow requires email sending infrastructure                 | MINOR         | Keep `requireEmailVerification: false` for boilerplate; document how to enable                                      |
| Social login (Google/GitHub) not included in base – must be added per-project | INFORMATIONAL | Document as extension point                                                                                         |

---

## Validation

Phase 4 is complete when:

- [ ] `auth.handler` responds to `GET /api/auth/get-session` → `200 null`
- [ ] `POST /api/auth/sign-up/email` creates user in `ba_user` table
- [ ] `POST /api/auth/sign-in/email` returns session cookie
- [ ] `getSession()` returns session when cookie present
- [ ] `getSession()` returns null when no cookie
- [ ] `/_authed` route redirects to `/auth/sign-in` when no session
- [ ] `/_authed` route renders when session is valid
- [ ] `pnpm typecheck` passes
- [ ] Unit test: `BetterAuthIdentitySource.get()` returns userId from session
- [ ] Unit test: `DrizzleInternalIdentityLookup.findByBetterAuthId()` returns user
