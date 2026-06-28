# Validation Report

## Scope

Focused validation for the preview migration compatibility refactor in `src/core/db/migrations/config/drizzle.prod.ts`.

## Commands Run

### 1. Legacy-compatible shell override shape

```shell
env DATABASE_URL='postgresql://user:pass@ep-foo.eu-central-1.aws.neon.tech/db?sslmode=require' \
  pnpm exec tsx -e "import('./src/core/db/migrations/config/drizzle.prod.ts').then(() => console.log('legacy-direct-ok'))"
```

Result: PASS

Observed output:

```text
legacy-direct-ok
```

### 2. Preferred pooled/direct shape

```shell
env DATABASE_URL='postgresql://user:pass@ep-foo-pooler.eu-central-1.aws.neon.tech/db?sslmode=require' \
  DATABASE_URL_UNPOOLED='postgresql://user:pass@ep-foo.eu-central-1.aws.neon.tech/db?sslmode=require' \
  pnpm exec tsx -e "import('./src/core/db/migrations/config/drizzle.prod.ts').then(() => console.log('preferred-shape-ok'))"
```

Result: PASS

Observed output:

```text
preferred-shape-ok
```

### 3. Invalid pooled effective sink

```shell
env DATABASE_URL='postgresql://user:pass@ep-foo-pooler.eu-central-1.aws.neon.tech/db?sslmode=require' \
  pnpm exec tsx -e "import('./src/core/db/migrations/config/drizzle.prod.ts')"
```

Result: PASS (expected failure)

Observed output excerpt:

```text
Error: [drizzle.prod] The effective migration URL appears to be a pooled/PgBouncer URL.
Migrations MUST use the direct connection (no -pooler. in the hostname).
```

## Validation Verdict

- Legacy Vercel-compatible shell override shape: restored
- Preferred pooled/direct steady-state shape: preserved
- Pooled migration sink rejection: preserved
- Editor diagnostics for `src/core/db/migrations/config/drizzle.prod.ts`: clean
