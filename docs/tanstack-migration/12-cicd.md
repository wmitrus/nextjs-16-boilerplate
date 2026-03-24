# Phase 11: CI/CD Pipelines

## Objective

Adapt the CI/CD workflows for TanStack Start. Most workflows are reused with minimal changes – the build commands and runtime differ, but the pipeline structure is identical.

**Prerequisite**: Phase 10 (Testing) complete. All test commands must be working before CI is finalized.

---

## What Changes

| Workflow              | Status      | Change                                              |
| --------------------- | ----------- | --------------------------------------------------- |
| `pr-validation.yml`   | **Adapted** | Update build/test commands                          |
| `prod-deploy.yml`     | **Adapted** | Update deploy target; Vercel TanStack Start adapter |
| `preview-deploy.yml`  | **Adapted** | Same as prod-deploy                                 |
| `release.yml`         | **Reused**  | No change (semantic-release is framework-agnostic)  |
| `lighthouse.yml`      | **Adapted** | Update start command                                |
| `deployChromatic.yml` | **Adapted** | Storybook build uses `@storybook/react-vite`        |
| `security-scan.yml`   | **Reused**  | No change                                           |
| `e2e-label.yml`       | **Reused**  | No change                                           |

---

## 1. PR Validation Workflow

### `.github/workflows/pr-validation.yml`

```yaml
name: PR Validation

on:
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Unit tests
        run: pnpm test
        env:
          BETTER_AUTH_SECRET: test-secret-min-32-chars-for-ci
          DB_DRIVER: pglite
          SKIP_ENV_VALIDATION: true

      - name: Build
        run: pnpm build
        env:
          SKIP_ENV_VALIDATION: true
          DEPLOY_TARGET: node-server
```

**Changes from Next.js workflow**:

- Removed `NEXT_PUBLIC_*` env vars → `VITE_*`
- Removed Clerk-related secrets
- Added `BETTER_AUTH_SECRET` (required at build time by env validation)
- `DEPLOY_TARGET: node-server` for CI builds

---

## 2. Production Deploy Workflow (Vercel)

### `.github/workflows/prod-deploy.yml`

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build for Vercel
        run: pnpm build
        env:
          DEPLOY_TARGET: vercel
          BETTER_AUTH_SECRET: ${{ secrets.BETTER_AUTH_SECRET }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
          UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}
          UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}
          INTERNAL_API_KEY: ${{ secrets.INTERNAL_API_KEY }}

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

**Changes from Next.js workflow**:

- `DEPLOY_TARGET: vercel` env var switches Vite config preset
- Removed all Clerk secrets (`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_*`)
- Added `BETTER_AUTH_SECRET`, `DATABASE_URL`
- Build output in `.output/` (Nitro) instead of `.next/`

### Vercel config (`vercel.json`)

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": ".output",
  "installCommand": "pnpm install --frozen-lockfile",
  "framework": null
}
```

**Note**: TanStack Start with Nitro Vercel adapter does not use the standard Vercel Next.js framework detection. `"framework": null` is required.

---

## 3. Node.js Self-Hosted Deploy

For teams deploying to their own infrastructure (Docker, Railway, Render, etc.):

### `Dockerfile`

```dockerfile
FROM node:24-alpine AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DEPLOY_TARGET=node-server
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

### `docker-compose.yml` (development)

```yaml
services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/myapp
      BETTER_AUTH_SECRET: local-dev-secret-min-32-chars
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## 4. Required GitHub Secrets

### Previously required (Next.js + Clerk)

```
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```

### Now required (TanStack Start + Better Auth)

```
BETTER_AUTH_SECRET          # min 32 chars
DATABASE_URL                # PostgreSQL connection string
SENTRY_DSN
SENTRY_AUTH_TOKEN
SENTRY_ORG
SENTRY_PROJECT
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
INTERNAL_API_KEY
VERCEL_TOKEN                # if deploying to Vercel
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

---

## 5. Release Workflow

### `.github/workflows/release.yml` (no changes needed)

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
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

      - name: Release
        run: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

`semantic-release` is framework-agnostic. Configuration in `.releaserc.json` is unchanged.

---

## 6. Lighthouse CI

### `.github/workflows/lighthouse.yml` (adapted)

```yaml
name: Lighthouse CI

on:
  push:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build
        env:
          DEPLOY_TARGET: node-server
          SKIP_ENV_VALIDATION: true
          BETTER_AUTH_SECRET: test-secret-min-32-chars-for-ci
          DB_DRIVER: pglite

      - name: Start server
        run: node .output/server/index.mjs &
        env:
          PORT: 3000

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v12
        with:
          urls: |
            http://localhost:3000
            http://localhost:3000/auth/sign-in
          uploadArtifacts: true
          temporaryPublicStorage: true
```

**Changes**: Start command is `node .output/server/index.mjs` instead of `next start`.

---

## 7. Dependency Analysis (Pre-push Hooks)

Same tools as Next.js boilerplate. Commands unchanged:

```bash
pnpm typecheck
pnpm skott:check:only
pnpm depcheck
pnpm madge
```

`skott` and `madge` analyze import graphs. Circular dependency detection is identical.

---

## Risks

| Risk                                                                               | Severity      | Mitigation                                                                                 |
| ---------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| Vercel TanStack Start adapter configuration may need tweaks for each Nitro version | MINOR         | Pin `@tanstack/react-start` version; test on Vercel preview before production              |
| `BETTER_AUTH_SECRET` must be set in CI even for builds that skip runtime           | MINOR         | `SKIP_ENV_VALIDATION=true` skips env validation in CI builds that don't need a real secret |
| `.output/server/index.mjs` path depends on Nitro version                           | MINOR         | Check Nitro docs; path may change between major versions                                   |
| Docker build time may be longer (Vite + Vinxi build vs Turbopack)                  | INFORMATIONAL | Acceptable; production builds are infrequent                                               |

---

## Validation

Phase 11 is complete when:

- [ ] PR validation workflow passes on GitHub Actions
- [ ] `pnpm build` with `DEPLOY_TARGET=vercel` produces Vercel-compatible output
- [ ] `pnpm build` with `DEPLOY_TARGET=node-server` produces runnable Node.js server
- [ ] Vercel preview deploy succeeds (if applicable)
- [ ] Docker build succeeds and container starts
- [ ] Release workflow produces correct semver tags
- [ ] Lighthouse CI runs and reports scores
