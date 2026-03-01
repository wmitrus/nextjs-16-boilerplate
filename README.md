This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Features

- [Next.js 16 Readiness](./docs/features/01%20-%20Next.js%2016%20Readiness.md) - Comprehensive update for Next.js 16, React Compiler, and Turbopack optimizations.
- [TypeScript, ESLint & Prettier Setup](./docs/features/02%20-%20TypeScript%20ESLint%20Prettier%20Setup.md) - Strict type safety, Flat Config linting, and Tailwind-aware formatting.
- [Testing Infrastructure](./docs/features/07%20-%20Testing%20Infrastructure.md) - Three-tier testing strategy: Unit (Jest), Integration (MSW), and E2E (Playwright).

## Getting Started Runbooks

- [Runbooks Index](./docs/getting-started/README.md)
- [Local Quickstart - Single Tenant](./docs/getting-started/01%20-%20Local%20Quickstart%20-%20Single%20Tenant.md)
- [Verification Runbook - Security Showcase (Single Tenant)](<./docs/getting-started/02%20-%20Verification%20Runbook%20-%20Security%20Showcase%20(Single%20Tenant).md>)

## Scripts

- `pnpm dev`: Start development server.
- `pnpm test`: Run unit tests.
- `pnpm test:integration`: Run integration tests.
- `pnpm test:all`: Run all Jest tests.
- `pnpm e2e`: Run Playwright E2E tests.
- `pnpm lint`: Run ESLint.
- `pnpm typecheck`: Run full TypeScript typecheck.

## Quick Start Testing

- Unit tests: `pnpm test`
- Integration tests: `pnpm test:integration`
- DB tests (fast, in-memory PGLite): `pnpm test:db`
- DB tests (local Postgres, Podman-first):

  ```bash
  pnpm db:local:up
  pnpm db:migrate:local
  pnpm test:db:local
  pnpm db:local:down
  ```

- E2E tests: `pnpm e2e`

CI equivalents:

- DB tests in CI (Testcontainers): `pnpm test:db:ci`
- E2E in CI: `pnpm e2e:ci`

For the full testing matrix, config mapping, CI flow, and troubleshooting, see:

- [docs/usage/03 - Testing Usage & DB Workflows.md](./docs/usage/03%20-%20Testing%20Usage%20%26%20DB%20Workflows.md)

## Database Migrations

- `pnpm db:generate` → generate migration files (dev config)
- `pnpm db:migrate:dev` → apply migrations to local PGLite
- `pnpm db:migrate:prod` → apply migrations to Postgres using `DATABASE_URL`

Rules:

- Never run migrations automatically in production runtime.
- Commit migration files to the repository.
- Keep `DATABASE_URL` server-side only.

## Local DB CI Test Mode (Podman-first)

This repo defaults local compose operations to Podman.

```bash
pnpm db:local:up
pnpm db:migrate:local
pnpm test:db:local
pnpm db:local:down
```

DB URL used by local DB tests:

- `postgres://postgres:postgres@127.0.0.1:5433/app_test`

Docker users can opt in with one env var:

```bash
DB_COMPOSE_ENGINE=docker pnpm db:local:up
```

Compose file selection is automatic (`compose.yml`, `podman-compose.yml`, `docker-compose.yml`) and can be overridden with:

```bash
DB_COMPOSE_FILE=podman-compose.yml pnpm db:local:up
```

## Architecture PR Gate (Modular Monolith)

Use this in every architecture-sensitive PR to keep the baseline enforced.

Reference docs:

- [Implementation guardrails & AI prompt contract](./docs/architecture/12%20-%20Implementation%20Guardrails%20%26%20AI%20Prompt%20Contract.md)
- [Executive sign-off](./docs/architecture/10%20-%20Executive%20Sign-Off%20-%20Modular%20Monolith.md)
- [Full compliance report](./docs/architecture/09%20-%20Final%20Modular%20Monolith%20Compliance%20Report.md)

Runtime boundary docs (must-read for auth/middleware/authorization work):

- [Edge vs Node Composition Root Boundary](./docs/architecture/15%20-%20Edge%20vs%20Node%20Composition%20Root%20Boundary.md)
- [Extending App Safely - Edge vs Node Authorization](./docs/usage/04%20-%20Extending%20App%20Safely%20-%20Edge%20vs%20Node%20Authorization.md)

Copy-paste snippet for PR description:

```md
## Modular Monolith Compliance

- [ ] No reverse dependency from `core` to `app/features/security/modules` (except approved composition-root module registration pattern).
- [ ] No domain policy logic in `shared/*`.
- [ ] No provider SDK leakage into domain/core contracts.
- [ ] Security decisions remain centralized in `security/*` and contract-driven services.

### Required Gate Results

- [ ] `pnpm typecheck` (pass)
- [ ] `pnpm skott:check:only` (pass)
- [ ] `pnpm madge` (pass)
- [ ] `pnpm depcheck` (pass)
- [ ] `pnpm env:check` (pass)
- [ ] `pnpm test` (pass)
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
