---
name: Connection Before DI
description: Review async App Router server files for request-time opt-in before getAppContainer-style DI bootstrap
---

If the PR does not touch App Router server files under `src/app/**` that can execute on the server, no action is needed.

Focus only on changed files such as:

- `page.tsx`
- `layout.tsx`
- `route.ts`
- async server components colocated under `src/app/**` when the changed lines add or move `getAppContainer()` or `.createChild()` request bootstrap logic into them

Do not review unrelated files, client components, tests, or server actions marked with `'use server'` unless the changed lines move the DI bootstrap pattern into an async App Router render path.

This repository has a hard Next.js 16 runtime rule: async App Router render paths that call `getAppContainer()` must first opt into request-time rendering.

Review the changed files against these sources before deciding pass or fail:

- `AGENTS.md`
- `.continue/rules/nextjs-runtime.md`
- `src/app/feature-flags-demo/page.tsx`

Look for these issues and fail only if they are introduced by the changed lines:

## 1. Missing Request-Time Opt-In Before DI

- an async App Router page, layout, route handler, or async server component newly calls `getAppContainer()` or `getAppContainer().createChild()` before any explicit request-time data source is awaited
- the change removes an existing `await connection()` that previously guarded `getAppContainer()`
- the change reorders code so `getAppContainer()` now runs before the request-time opt-in

## 2. Invalid Replacement Patterns

- the change relies on `export const dynamic` or `export const runtime` instead of the repository-approved request-time pattern
- the change treats a non-request-time helper or comment as sufficient proof that `getAppContainer()` is safe in prerender mode

## 3. Runtime Boundary Regressions

- request DI bootstrap is moved into a render path that is likely to prerender, without explicit request-time access first
- the changed file now makes the request-time rendering dependency implicit and fragile instead of explicit in the same render path

Accept as valid request-time opt-in evidence before `getAppContainer()` when it is explicit in the changed render path:

- `await connection()`
- `await headers()` or another direct awaited `headers()` read
- `await cookies()` or another direct awaited `cookies()` read
- awaited `searchParams` access in the same render path when that path is server-rendered

Do not fail only on suspicion. If the changed lines do not clearly add or move `getAppContainer()` into a risky render path, or the request-time opt-in is indirect and unchanged outside the diff, pass.

Passing result expectations:

- changed App Router render paths keep explicit request-time opt-in before DI bootstrap
- no changed lines introduce banned segment runtime exports as a substitute
- the review identifies whether the affected path is a page, layout, route handler, or async server component render path

Fail only when the changed code clearly introduces the documented `getAppContainer()` before request-time opt-in problem or replaces the approved pattern with a banned or weaker one.
