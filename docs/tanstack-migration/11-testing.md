# Phase 10: Testing Infrastructure

## Objective

Adapt the testing infrastructure for TanStack Start. The three-tier testing strategy (unit / integration / e2e) is preserved. The main work is replacing Next.js-specific test utilities and mocks with TanStack Start equivalents.

**Prerequisite**: Phase 1 (Foundation) complete. Test frameworks must be installed.

---

## Testing Strategy (Preserved)

| Suite       | Framework  | Pattern                              | Command                 |
| ----------- | ---------- | ------------------------------------ | ----------------------- |
| Unit        | Vitest     | `src/**/*.test.{ts,tsx}`             | `pnpm test`             |
| Integration | Vitest     | `src/**/*.integration.test.{ts,tsx}` | `pnpm test:integration` |
| Storybook   | Vitest     | `.stories.{ts,tsx}`                  | `pnpm test:storybook`   |
| E2E         | Playwright | `e2e/**/*.spec.ts`                   | `pnpm e2e`              |

Coverage threshold: 80% (lines / functions / branches / statements) for unit tests.

---

## What Changes

| File/Dir                                            | Status      | Change                                            |
| --------------------------------------------------- | ----------- | ------------------------------------------------- |
| `vitest.unit.config.ts`                             | **Adapted** | Remove Next.js environment, update setup files    |
| `vitest.integration.config.ts`                      | **Adapted** | Same                                              |
| `vitest.config.ts`                                  | **Adapted** | Same                                              |
| `tests/setup.tsx`                                   | **Adapted** | Remove Next.js mocks                              |
| `tests/polyfills.ts`                                | **Reused**  | Minimal changes                                   |
| `src/testing/infrastructure/clerk.ts`               | **Deleted** | Replaced by Better Auth mocks                     |
| `src/testing/infrastructure/next-headers.ts`        | **Deleted** | No next/headers in TanStack Start                 |
| `src/testing/infrastructure/better-auth.ts`         | **New**     | Better Auth session mocks                         |
| `src/testing/infrastructure/tanstack.ts`            | **New**     | TanStack Router/Query test utilities              |
| `src/testing/infrastructure/security-middleware.ts` | **Adapted** | For `createMiddleware` instead of Edge middleware |
| `src/testing/factories/request.ts`                  | **Adapted** | No next/server types                              |
| All other `src/testing/` files                      | **Reused**  | Framework-agnostic                                |

---

## 1. Vitest Config Adaptation

### `vitest.unit.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'unit',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      exclude: [
        'src/app/**',
        'src/testing/**',
        'src/stories/**',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
  },
});
```

**Removed**: `environment: 'jsdom'` override for RSC pages (not needed). `@next/env` setup. Next.js module mocks.

### `vitest.integration.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'integration',
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts', 'tests/setup.integration.ts'],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
```

---

## 2. `tests/setup.ts`

```ts
import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock env for all tests
vi.mock('@/core/env', () => ({
  env: {
    NODE_ENV: 'test',
    BETTER_AUTH_SECRET: 'test-secret-min-32-chars-for-testing',
    INTERNAL_API_KEY: 'test-internal-key',
    SECURITY_AUDIT_LOG_ENABLED: false,
    TENANCY_MODE: 'single',
    DEFAULT_TENANT_ID: '00000000-0000-0000-0000-000000000001',
    DB_DRIVER: 'pglite',
    FREE_TIER_MAX_USERS: 5,
    TENANT_CONTEXT_HEADER: 'x-tenant-id',
    TENANT_CONTEXT_COOKIE: 'active_tenant_id',
    DEPLOY_TARGET: 'node-server',
    API_RATE_LIMIT_REQUESTS: 100,
    API_RATE_LIMIT_WINDOW: '60 s',
    LOG_LEVEL: 'silent',
    VITE_LOG_LEVEL: 'silent',
  },
}));

// Suppress console output in tests
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
```

**Removed**: `next/headers` mock, `next/navigation` mock, Clerk environment mocks.

---

## 3. Better Auth Test Mocks

### `src/testing/infrastructure/better-auth.ts` (new)

```ts
import { vi } from 'vitest';
import type { Session, User } from '@/modules/auth/lib/auth';

export const TEST_USER: User = {
  id: 'test-ba-user-id',
  email: 'test@example.com',
  name: 'Test User',
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const TEST_SESSION: Session = {
  session: {
    id: 'test-session-id',
    userId: TEST_USER.id,
    token: 'test-token',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: null,
    userAgent: null,
  },
  user: TEST_USER,
};

/**
 * Mock getSession to return a valid session.
 * Use in tests that require an authenticated context.
 */
export function mockAuthenticatedSession(overrides?: Partial<User>) {
  const user = { ...TEST_USER, ...overrides };
  const session = { ...TEST_SESSION, user };

  vi.mock('@/modules/auth/lib/session', () => ({
    getSession: vi.fn().mockResolvedValue(session),
    ensureSession: vi.fn().mockResolvedValue(session),
  }));

  return session;
}

/**
 * Mock getSession to return null (unauthenticated).
 */
export function mockUnauthenticatedSession() {
  vi.mock('@/modules/auth/lib/session', () => ({
    getSession: vi.fn().mockResolvedValue(null),
    ensureSession: vi.fn().mockRejectedValue(new Error('Unauthorized')),
  }));
}
```

---

## 4. TanStack Router Test Utilities

### `src/testing/infrastructure/tanstack.ts` (new)

```ts
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { routeTree } from '@/app/routeTree.gen'

export function createTestRouter(initialUrl = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
    context: { queryClient },
  })

  return { router, queryClient }
}

export function renderWithRouter(
  ui: ReactElement,
  { initialUrl = '/' } = {},
) {
  const { queryClient } = createTestRouter(initialUrl)

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}
```

---

## 5. Security Middleware Test Utilities

### `src/testing/infrastructure/security-middleware.ts` (adapted)

```ts
import { vi } from 'vitest';

/**
 * Create a mock Request for middleware testing.
 * Replaces the Next.js NextRequest factory.
 */
export function createMockRequest(
  url: string,
  options: RequestInit & { headers?: Record<string, string> } = {},
): Request {
  const fullUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`;
  return new Request(fullUrl, {
    ...options,
    headers: options.headers,
  });
}

/**
 * Create a mock request with auth session cookie.
 */
export function createAuthenticatedRequest(url: string): Request {
  return createMockRequest(url, {
    headers: {
      cookie: 'better-auth.session_token=test-session-token',
    },
  });
}

/**
 * Test a createMiddleware handler in isolation.
 */
export async function testRequestMiddleware(
  middleware: { server: (ctx: unknown) => unknown },
  request: Request,
): Promise<Response> {
  let capturedResponse: Response | undefined;

  await middleware.server({
    request,
    next: async () => {
      const response = new Response('OK', { status: 200 });
      capturedResponse = response;
      return response;
    },
  });

  return capturedResponse ?? new Response('Not found', { status: 404 });
}
```

---

## 6. DB Test Utilities (Reused)

### `src/testing/db/create-test-db.ts`

No change. PGLite test DB factory is framework-agnostic.

```ts
import { createPGliteDriver } from '@/core/db/drivers/pglite';

export function createTestDb() {
  return createPGliteDriver();
}
```

Each integration test creates its own PGLite in-memory DB. Schema is migrated at test setup.

### Integration test setup

```ts
// tests/setup.integration.ts
import { createTestDb } from '@/testing/db/create-test-db';
import { runMigrations } from '@/core/db/migrations';

let testDb: ReturnType<typeof createTestDb>;

beforeAll(async () => {
  testDb = createTestDb();
  await runMigrations(testDb);
});

afterEach(async () => {
  // Truncate all tables between tests
  await testDb.execute('BEGIN');
  await testDb.execute('TRUNCATE users, tenants, memberships CASCADE');
  await testDb.execute('COMMIT');
});
```

---

## 7. Security Test Factories (Adapted)

### `src/testing/factories/security.ts` (adapted)

```ts
import type { SecurityContext } from '@/security/core/security-context';
import { TEST_SESSION, TEST_USER } from './better-auth';

export function createTestSecurityContext(
  overrides?: Partial<SecurityContext>,
): SecurityContext {
  return {
    userId: TEST_USER.id,
    email: TEST_USER.email,
    tenantId: '00000000-0000-0000-0000-000000000001',
    session: TEST_SESSION,
    ip: '127.0.0.1',
    readinessStatus: 'READY',
    user: {
      id: 'internal-user-uuid',
      email: TEST_USER.email,
      tenantId: '00000000-0000-0000-0000-000000000001',
      attributes: {},
    },
    ...overrides,
  };
}
```

---

## 8. E2E Test Adaptation (Playwright)

### `playwright.config.ts` – No changes

Playwright config remains the same. Base URL is `http://localhost:3000`. Tests run against the running dev/production server.

### E2E auth setup

```ts
// e2e/fixtures/auth.ts
import type { Page } from '@playwright/test';

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('/app');
}
```

### E2E auth script

```ts
// scripts/e2e-auth-check.ts
import { createTestUser } from './create-test-user';

async function main() {
  if (!process.env.E2E_ENABLED) {
    console.log('E2E not enabled, skipping auth setup');
    return;
  }

  await createTestUser({
    email: process.env.E2E_USER_USERNAME!,
    password: process.env.E2E_USER_PASSWORD!,
  });
}

main();
```

Unlike the Next.js boilerplate (which used Clerk's pre-seeded E2E user), Better Auth users must be seeded programmatically via Better Auth's admin API or directly in the DB.

---

## 9. MSW (Mock Service Worker) Adaptation

MSW is used to mock API calls in component tests. No framework-specific changes needed:

```ts
// src/shared/lib/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: '1', email: 'alice@example.com', name: 'Alice' },
    ]);
  }),
];
```

MSW setup in Vitest:

```ts
// tests/setup.ts (add)
import { setupServer } from 'msw/node';
import { handlers } from '@/shared/lib/mocks/handlers';

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## 10. What Is Deleted

| Deleted                                                 | Reason                               |
| ------------------------------------------------------- | ------------------------------------ |
| `src/testing/infrastructure/clerk.ts`                   | Clerk-specific mock setup            |
| `src/testing/infrastructure/next-headers.ts`            | `next/headers` mock not needed       |
| `src/proxy.edge-composition.test.ts`                    | Edge composition test not applicable |
| Clerk-specific E2E env vars (`E2E_CLERK_USER_USERNAME`) | Replaced by `E2E_USER_USERNAME`      |

---

## Risks

| Risk                                                                                               | Severity | Mitigation                                                                        |
| -------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `createServerFn` may be harder to unit test than Server Actions (requires mock context)            | MAJOR    | Use the `testRequestMiddleware` helper and mock `getWebRequest()` at the boundary |
| TanStack Router `beforeLoad` runs in both SSR and client – integration tests must cover both paths | MINOR    | Test with `createMemoryHistory` for client navigation; Playwright for SSR path    |
| E2E test user creation requires Better Auth running – seeding script must use API, not direct DB   | MINOR    | Provide seed script using Better Auth admin API                                   |
| PGLite WASM init in test context may be slow                                                       | MINOR    | Use `beforeAll` (not `beforeEach`) for DB initialization                          |

---

## Validation

Phase 10 is complete when:

- [ ] `pnpm test` runs with zero failures
- [ ] `pnpm test:integration` runs with zero failures
- [ ] Coverage threshold (80%) met
- [ ] `mockAuthenticatedSession()` correctly intercepts `getSession()` in tests
- [ ] Integration test: sign-up → bootstrap → server function call
- [ ] `pnpm e2e` passes against running server (with E2E user seeded)
- [ ] No `@clerk/nextjs` or `next/headers` imports in test files
- [ ] MSW handlers work in component tests
