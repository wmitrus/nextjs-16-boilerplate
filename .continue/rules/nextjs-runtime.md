# Next.js Runtime

This repository uses Next.js 16 App Router with `cacheComponents: true`. Review code against that reality, not generic framework advice.

## Runtime Facts

- Middleware-style interception lives in `src/proxy.ts`.
- `cacheComponents: true` is enabled.
- `reactCompiler: true` is enabled.
- `connection()` is the supported request-time dynamic opt-in when request-time rendering is needed.

## Hard Runtime Constraints

- Do not use `export const dynamic` in App Router files.
- Do not use `export const runtime` in App Router files.
- In async RSC paths that call `getAppContainer()`, call `await connection()` first unless another valid request-time API has already been awaited.
- Do not import node-only libraries into edge-executed paths.
- Do not move server-only helpers into client components.

## Request-Time Safety

- With `cacheComponents: true`, request-sensitive helpers must not run before a request-time boundary is established.
- Helpers or third-party APIs that call `Date.now()` or `new Date()` can break prerendered paths if called too early.
- `src/proxy.ts` is edge-sensitive. Keep its imports and logic runtime-safe.

## Review Focus

- server vs client placement
- edge vs node placement
- route handler vs page/layout responsibility
- auth-sensitive or user-sensitive cache assumptions
- explicit request-time opt-in before DI/bootstrap helpers

## What Not To Re-Flag

Do not duplicate framework hard errors as AI findings unless the PR is trying to work around them.
