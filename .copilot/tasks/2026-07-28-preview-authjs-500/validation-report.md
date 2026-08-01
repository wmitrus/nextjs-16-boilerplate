# Validation Report

## Commands

```bash
pnpm exec vitest run --config vitest.unit.config.ts --coverage=false scripts/validate-env.test.ts src/core/env.test.ts
```

Result: passed, 72 tests.

```bash
pnpm exec tsc --noEmit --pretty false
```

Result: passed.

```bash
pnpm lint --fix
```

Result: passed after rerunning with escalated pnpm access. Initial sandbox run failed before script execution with `unable to open database file`.

```bash
pnpm e2e:authjs:core
```

Result: passed, 6 Playwright tests.

Covered:

- `/api/auth/session` returns JSON for unauthenticated requests
- `/api/auth/providers` returns JSON
- session endpoint does not return HTML for CLIENT_FETCH_ERROR regression
- unauthenticated dashboard redirects to AuthJS sign-in
- completed AuthJS sign-in lands on dashboard
- incomplete AuthJS user routes through onboarding and settles on dashboard

## Live Vercel Checks

```bash
pnpm vercel:inspect:logs -- https://nextjs-16-boilerplate-wmitrus-wojciech-mitruss-projects.vercel.app
```

Result: passed after device login. Build logs show:

- build command: `DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:migrate:prod && pnpm build`
- migration summary present
- Drizzle migrations applied successfully
- deployment status ready

```bash
npx -y vercel@latest logs https://nextjs-16-boilerplate-wmitrus-wojciech-mitruss-projects.vercel.app
```

Result: passed. Runtime logs confirm:

```text
[next-auth][error][NO_SECRET]
Error [MissingSecretError]: Please define a `secret` in production.
```

Affected paths observed in logs:

- `GET /auth/signin`
- `GET /auth/signup`

Plain curl to preview returned Vercel SSO/protection redirects, so it could not probe the app endpoints directly.

## Residual Risk

Preview requires external Vercel configuration:

- non-empty `NEXTAUTH_SECRET` for Preview
- redeploy after setting `NEXTAUTH_SECRET`
