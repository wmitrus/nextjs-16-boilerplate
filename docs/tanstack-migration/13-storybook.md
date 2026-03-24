# Phase 12: Storybook Integration

## Objective

Integrate Storybook with TanStack Start using `@storybook/react-vite`. Since TanStack Start uses Vite as its build tool, Storybook integration is cleaner than with Next.js (no `@storybook/nextjs` adapter needed, no Next.js-specific stubs).

**Prerequisite**: Phase 8 (Features) complete. Components must exist before stories can be written.

---

## Why This Is Simpler Than Next.js

In the Next.js boilerplate, Storybook uses `@storybook/nextjs` which provides stubs for:

- `next/image`
- `next/link`
- `next/navigation`
- `next/router`
- `next/head`

With TanStack Start + `@storybook/react-vite`:

- No Next.js stubs needed
- No adapter-specific configuration quirks
- Vite is the shared build tool for both app and Storybook
- TanStack Router provides `RouterDecorator` for stories that need routing
- TanStack Query provides `QueryClientDecorator` for stories with data

---

## Package

```bash
pnpm add -D @storybook/react-vite @storybook/blocks @storybook/react storybook
```

No `@storybook/nextjs`. Clean Vite integration.

---

## 1. Storybook Configuration

### `.storybook/main.ts`

```ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.{ts,tsx}'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  viteFinalConfig: async (config) => {
    return config;
  },
};

export default config;
```

**No special Next.js configuration needed.** `@storybook/react-vite` picks up the existing `vite.config.ts` automatically (including `vite-tsconfig-paths` for path aliases).

### `.storybook/preview.ts`

```ts
import type { Preview } from '@storybook/react';
import '../src/app/styles/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'centered',
  },
  decorators: [],
};

export default preview;
```

---

## 2. Decorators

### TanStack Router Decorator

For stories that use `Link`, `useNavigate`, or any router-aware components:

```ts
// .storybook/decorators/RouterDecorator.tsx
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from '@/app/routeTree.gen'
import type { Decorator } from '@storybook/react'

export const RouterDecorator: Decorator = (Story) => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  return <RouterProvider router={router} defaultComponent={Story} />
}
```

Usage in story:

```ts
export default {
  component: NavigationComponent,
  decorators: [RouterDecorator],
};
```

### TanStack Query Decorator

For stories that use `useSuspenseQuery` or `useQuery`:

```ts
// .storybook/decorators/QueryDecorator.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Decorator } from '@storybook/react'

export const QueryDecorator: Decorator = (Story) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <Story />
    </QueryClientProvider>
  )
}
```

---

## 3. Writing Stories

### Shared component story

```ts
// src/shared/components/ui/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  component: Button,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    children: 'Click me',
    variant: 'primary',
  },
};

export const Destructive: Story = {
  args: {
    children: 'Delete',
    variant: 'destructive',
  },
};
```

### Feature component story (with mock data)

```ts
// src/features/user-management/components/UserCard.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { UserCard } from './UserCard';

const meta: Meta<typeof UserCard> = {
  component: UserCard,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof UserCard>;

export const Default: Story = {
  args: {
    user: {
      id: '1',
      email: 'alice@example.com',
      name: 'Alice',
    },
  },
};
```

### Auth-aware component story (mocked session)

```ts
// src/modules/auth/ui/AuthControls.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { AuthControls } from './AuthControls';
import { fn } from '@storybook/test';

const meta: Meta<typeof AuthControls> = {
  component: AuthControls,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof AuthControls>;

export const Authenticated: Story = {
  parameters: {
    mockData: {
      session: {
        user: { email: 'alice@example.com', name: 'Alice' },
      },
    },
  },
};

export const Unauthenticated: Story = {
  parameters: {
    mockData: { session: null },
  },
};
```

**Note**: `AuthControls` uses `useSession()` from the Better Auth client. In Storybook, this needs to be mocked via MSW or a Storybook parameter decorator.

---

## 4. MSW Integration in Storybook

For components that make API calls, use MSW (`msw-storybook-addon`):

```bash
pnpm add -D msw-storybook-addon
```

### `.storybook/preview.ts` (add MSW)

```ts
import { initialize, mswLoader } from 'msw-storybook-addon';

initialize({
  onUnhandledRequest: 'bypass',
});

const preview: Preview = {
  loaders: [mswLoader],
  // ...
};
```

### Story with MSW handler

```ts
import { http, HttpResponse } from 'msw';

export const WithUsers: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/users', () =>
          HttpResponse.json([
            { id: '1', name: 'Alice', email: 'alice@example.com' },
          ]),
        ),
      ],
    },
  },
};
```

---

## 5. Storybook Vitest Integration

Storybook stories can run as Vitest tests via `@storybook/experimental-addon-test`:

### `vitest.config.ts` (add storybook project)

```ts
import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/experimental-addon-test/vitest-plugin';

export default defineConfig({
  plugins: [
    storybookTest({
      storybookScript: 'pnpm storybook --ci',
    }),
  ],
  test: {
    projects: [
      {
        extends: './vitest.unit.config.ts',
        name: 'unit',
      },
      {
        name: 'storybook',
        browser: {
          enabled: true,
          name: 'chromium',
          provider: 'playwright',
          headless: true,
        },
        include: ['**/*.stories.{ts,tsx}'],
        setupFiles: ['.storybook/vitest.setup.ts'],
      },
    ],
  },
});
```

---

## 6. Chromatic Visual Regression

```yaml
# .github/workflows/deployChromatic.yml
name: Chromatic

on:
  push:
    branches: [main]

jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Publish to Chromatic
        uses: chromaui/action@latest
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          buildScriptName: 'build:storybook'
```

No changes needed from the Next.js version. `build:storybook` script uses `@storybook/react-vite` which outputs to `storybook-static/`.

---

## Risks

| Risk                                                                                              | Severity | Mitigation                                                                            |
| ------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| TanStack Router `routeTree.gen.ts` may not exist during Storybook build (before first `pnpm dev`) | MINOR    | Commit `routeTree.gen.ts` or generate it in a setup step before Storybook build       |
| Better Auth `useSession()` hook makes a real HTTP request in Storybook                            | MAJOR    | Mock via MSW or provide a custom `authClient` with a mock `useSession` implementation |
| `@storybook/experimental-addon-test` may not be stable for all React 19 + Vite combinations       | MINOR    | Test separately; fall back to manual Storybook test command if needed                 |

---

## Validation

Phase 12 is complete when:

- [ ] `pnpm storybook` starts Storybook dev server
- [ ] `pnpm build:storybook` produces `storybook-static/`
- [ ] `pnpm test:storybook` runs story interaction tests
- [ ] At least 5 component stories exist (Button, UserCard, ErrorAlert, AuthControls, Header)
- [ ] Router-aware stories render without errors (using `RouterDecorator`)
- [ ] MSW mocks work in Storybook (API calls return mock data)
- [ ] Chromatic workflow publishes to Chromatic on main push
- [ ] No `next/*` imports in story files or Storybook config
