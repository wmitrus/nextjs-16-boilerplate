# Phase 8: Features – User Management & Security Showcase

## Objective

Adapt the feature layer (`src/features/`) for TanStack Start. Features are product-facing composition slices that use modules, security, and shared layers. They require the most UI-level adaptation but the least business logic change.

**Prerequisite**: Phases 1–7 complete. Auth, security, authorization, and provisioning must all work before features can be fully wired.

---

## What Changes

| File/Dir                          | Status            | Change                                                                  |
| --------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| `src/features/user-management/`   | **Adapted**       | Server actions → `createServerFn`; Next.js navigation → TanStack Router |
| `src/features/security-showcase/` | **Adapted**       | Same pattern                                                            |
| `src/features/*/actions/`         | **Adapted**       | `createSecureAction` → `createSecureServerFn`                           |
| `src/features/*/components/`      | **Mostly reused** | Remove `next/navigation`, `next/link` → TanStack Router equivalents     |
| `src/features/*/api/`             | **Adapted**       | Route handlers adapted for TanStack Start API routes                    |
| `src/features/*/types/`           | **Reused as-is**  | Pure TypeScript types                                                   |
| `src/features/*/lib/`             | **Reused as-is**  | Framework-agnostic logic                                                |

---

## 1. Routing Changes

### Navigation

```ts
// Next.js
import { useRouter } from 'next/navigation';
const router = useRouter();
router.push('/app');
router.refresh();

// TanStack Start
import { useRouter, useNavigate } from '@tanstack/react-router';
const navigate = useNavigate();
navigate({ to: '/app' });
router.invalidate(); // equivalent to refresh
```

### Links

```tsx
// Next.js
import Link from 'next/link';
<Link href="/users">Users</Link>;

// TanStack Start
import { Link } from '@tanstack/react-router';
<Link to="/users">Users</Link>;
```

### Type-safe params

```ts
// TanStack Start (superior type safety)
const { userId } = Route.useParams(); // typed to the route's params
```

---

## 2. Server Action → Server Function Adaptation

### Before (Next.js)

```ts
// src/features/user-management/actions/update-user.ts
'use server';
import { createSecureAction } from '@/security/actions/secure-action';
import { z } from 'zod';

export const updateUser = createSecureAction({
  schema: z.object({ userId: z.uuid(), name: z.string() }),
  resource: { type: 'user' },
  action: 'update',
  dependencies: () => getSecureActionDependencies(),
  handler: async ({ input, context }) => {
    return updateUserInDb(input.userId, input.name);
  },
});
```

### After (TanStack Start)

```ts
// src/features/user-management/actions/update-user.ts
import { createSecureServerFn } from '@/security/actions/secure-server-fn';
import { z } from 'zod';

export const updateUser = createSecureServerFn({
  schema: z.object({ userId: z.uuid(), name: z.string() }),
  resource: { type: 'user' },
  action: 'update',
  handler: async ({ data, context }) => {
    return updateUserInDb(data.userId, data.name);
  },
});
```

**Key differences**:

- No `"use server"` directive
- `input` → `data`
- `dependencies` resolver gone – DI resolved inside `createSecureServerFn`
- Same response shape: `{ status: 'success' | 'unauthorized' | 'error', ... }`

### Client usage

```tsx
// Before (Next.js)
const result = await updateUser({ userId: '...', name: '...' });

// After (TanStack Start)
const result = await updateUser({ data: { userId: '...', name: '...' } });

// Then invalidate TanStack Query cache or router
queryClient.invalidateQueries({ queryKey: ['users'] });
```

Note: TanStack Start server functions require `{ data: ... }` wrapper for the payload.

---

## 3. Data Fetching Adaptation

### Before (Next.js + Server Component)

```tsx
// app/users/page.tsx (RSC)
import { getUserList } from '@/features/user-management/lib/getUserList';

export default async function UsersPage() {
  const users = await getUserList();
  return <UserList users={users} />;
}
```

### After (TanStack Start + Loader + TanStack Query)

```tsx
// src/app/routes/_authed/users/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { usersQueryOptions } from '@/features/user-management/lib/queries';

export const Route = createFileRoute('/_authed/users/')({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(usersQueryOptions()),
  component: UsersPage,
});

function UsersPage() {
  const users = useSuspenseQuery(usersQueryOptions()).data;
  return <UserList users={users} />;
}
```

### Query options factory

```ts
// src/features/user-management/lib/queries.ts
import { queryOptions } from '@tanstack/react-query';
import { listUsers } from '../actions/list-users';

export const usersQueryOptions = () =>
  queryOptions({
    queryKey: ['users'],
    queryFn: () => listUsers(),
    staleTime: 1000 * 30,
  });
```

Where `listUsers` is a `createServerFn`:

```ts
// src/features/user-management/actions/list-users.ts
import { createSecureServerFn } from '@/security/actions/secure-server-fn';
import { z } from 'zod';

export const listUsers = createSecureServerFn({
  method: 'GET',
  schema: z.object({}),
  resource: { type: 'user' },
  action: 'list',
  handler: async ({ context }) => {
    return fetchUsersFromDb(context.session.user.id);
  },
});
```

---

## 4. API Route Handlers

For REST API endpoints (used by external clients or E2E tests), use TanStack Start API routes:

```tsx
// src/app/routes/api/users/route.tsx
import { createAPIFileRoute } from '@tanstack/react-start/api';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';
import { listUsersApiHandler } from '@/features/user-management/api/list-users';
import { createUserApiHandler } from '@/features/user-management/api/create-user';

export const APIRoute = createAPIFileRoute('/api/users')({
  GET: withErrorHandler(listUsersApiHandler),
  POST: withErrorHandler(createUserApiHandler),
});
```

API handlers are plain async functions that receive `Request` and return `Response`:

```ts
// src/features/user-management/api/list-users.ts
import type { APIContext } from '@tanstack/react-start/api';
import { getSession } from '@/modules/auth/lib/session';
import { responseService } from '@/shared/lib/api/response-service';

export async function listUsersApiHandler({ request }: APIContext) {
  const session = await getSession();
  if (!session) {
    return responseService.unauthorized();
  }

  const users = await fetchUsersFromDb(session.user.id);
  return responseService.ok(users);
}
```

---

## 5. `src/features/user-management/` Structure

```
src/features/user-management/
├── actions/
│   ├── list-users.ts           # createSecureServerFn (GET)
│   ├── get-user.ts             # createSecureServerFn (GET)
│   ├── update-user.ts          # createSecureServerFn (POST)
│   └── delete-user.ts          # createSecureServerFn (POST)
├── api/
│   ├── list-users.ts           # REST handler (used by APIRoute)
│   └── create-user.ts          # REST handler
├── components/
│   ├── UserList.tsx            # Adapted (no next/* imports)
│   ├── UserCard.tsx            # Reused
│   └── UserForm.tsx            # Adapted (no next/navigation)
├── hooks/
│   └── useUserMutation.ts      # TanStack Query mutation hook
├── lib/
│   ├── queries.ts              # TanStack Query query options
│   └── user-helpers.ts         # Pure helpers (reused)
└── types/
    └── user.ts                 # Pure types (reused)
```

---

## 6. `src/features/security-showcase/` Adaptation

The security showcase demonstrates the security pipeline in action. Adaptation:

### Before (Next.js)

```tsx
// Client Component showing secure action usage
import { runSecureDemo } from '../actions/secure-demo';

async function handleDemo() {
  const result = await runSecureDemo({ type: 'demo' });
}
```

### After (TanStack Start)

```tsx
import { runSecureDemo } from '../actions/secure-demo';

async function handleDemo() {
  const result = await runSecureDemo({ data: { type: 'demo' } });
  if (result.status === 'success') {
    setResult(result.data);
  }
}
```

The action itself:

```ts
// src/features/security-showcase/actions/secure-demo.ts
import { createSecureServerFn } from '@/security/actions/secure-server-fn';
import { z } from 'zod';

export const runSecureDemo = createSecureServerFn({
  schema: z.object({ type: z.string() }),
  handler: async ({ data, context }) => {
    return {
      userId: context.session.user.id,
      timestamp: new Date().toISOString(),
      type: data.type,
    };
  },
});
```

---

## 7. Client Error Boundary Adaptation

The `ClientErrorBoundary` in `src/shared/components/error/client-error-boundary.tsx` needs minor adaptation – remove `next/navigation` import:

```tsx
// Before
import { useRouter } from 'next/navigation';
const router = useRouter();
router.refresh();

// After
import { useRouter } from '@tanstack/react-router';
const router = useRouter();
router.invalidate();
```

---

## 8. Removed Next.js Dependencies from Features

All feature code must be audited for these imports and replaced:

| Remove                                        | Replace with                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `import Link from 'next/link'`                | `import { Link } from '@tanstack/react-router'`                                              |
| `import { useRouter } from 'next/navigation'` | `import { useRouter, useNavigate } from '@tanstack/react-router'`                            |
| `import { redirect } from 'next/navigation'`  | `import { redirect } from '@tanstack/react-router'`                                          |
| `import { headers } from 'next/headers'`      | `import { getHeaders } from '@tanstack/react-start/server'`                                  |
| `import { cookies } from 'next/headers'`      | `import { getCookie } from '@tanstack/react-start/server'`                                   |
| `'use server'` directive                      | Remove – use `createServerFn` explicitly                                                     |
| `'use client'` directive                      | Remove – not needed in TanStack Start (all components are client by default after hydration) |

---

## Risks

| Risk                                                                                             | Severity | Mitigation                                                                                                               |
| ------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `createServerFn` requires `{ data: ... }` wrapper – client call sites must be updated everywhere | MAJOR    | ESLint rule or search-and-replace audit: `action(input)` → `action({ data: input })`                                     |
| TanStack Query `staleTime` must be set correctly – default is `0` (always refetch)               | MINOR    | Set global `defaultOptions.queries.staleTime` in router factory                                                          |
| Loader runs on both server (SSR) and client (navigation) – must be safe to run in both           | MAJOR    | Ensure `createServerFn` handles both contexts correctly; function middleware uses `getWebRequest()` which is server-only |
| `invalidate()` vs `refresh()` semantics differ slightly                                          | MINOR    | Test post-mutation cache invalidation paths                                                                              |

---

## Validation

Phase 8 is complete when:

- [ ] `/app/users` page renders user list (SSR + client navigation)
- [ ] `updateUser` server function returns `{ status: 'success' }` for authorized user
- [ ] `updateUser` returns `{ status: 'unauthorized' }` for unauthenticated request
- [ ] `updateUser` returns `{ status: 'validation_error' }` for invalid input
- [ ] TanStack Query cache invalidates after mutation
- [ ] Security showcase page works (demonstrates secure server function pipeline)
- [ ] No `next/*` imports remain in `src/features/`
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
