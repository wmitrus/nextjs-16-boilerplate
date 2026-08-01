# Preview AuthJS 500 Incident Intake

## Task

- Leantime task: 88
- Date: 2026-07-28
- Environment: Vercel preview deployment
- URL: `https://nextjs-16-boilerplate-wmitrus-wojciech-mitruss-projects.vercel.app/auth/signin`

## Symptom

Preview was switched from Clerk to AuthJS. Local AuthJS works, but the preview sign-in page reports production-only failures.

User-provided DevTools evidence:

```text
Failed to load resource: the server responded with a status of 500 ()
[next-auth][error][CLIENT_FETCH_ERROR]
https://next-auth.js.org/errors#client_fetch_error There is a problem with the server configuration.
/api/auth/_log Failed to load resource: the server responded with a status of 500 ()
Server Components render error in production build.
```

## Initial Classification

General production incident, not a security incident. The likely surface is env-driven AuthJS configuration plus Neon preview database migration state.

## Constraints

- Do not expose real env values, tokens, connection strings, or deployment credentials in artifacts.
- Repository code is the source of truth.
- AuthJS preview must be validated with `pnpm e2e:authjs:core` when local infrastructure permits.
- Neon preview migrations must follow `docs/features/DEPLOY-neon.md`.
