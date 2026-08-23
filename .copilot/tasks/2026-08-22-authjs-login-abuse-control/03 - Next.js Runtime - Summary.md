# 03 - Next.js Runtime - Summary

## Task Context

- Task ID: `2026-08-22-authjs-login-abuse-control`
- Task Objective: Confirm the runtime shape of the fix (route handler, Node-only Redis/fetch calls, client widget) is safe.
- Current Run Scope: `route.ts`, `auth.ts`, `login-abuse-control.ts`, `turnstile.ts`, `TurnstileWidget.tsx`, `sign-in-client.tsx`.
- Status: COMPLETED
- Last Updated: 2026-08-22
- Related Control Artifacts: `02 - Security & Auth - Summary.md`, `04 - Implementation Agent - Summary.md`

## Scope Handled

- runtime entrypoints reviewed: `/api/auth/[...nextauth]` route handler (Node runtime — Drizzle/Postgres access), the Credentials `authorize()` callback, the sign-in Client Component
- App Router surfaces reviewed: `src/app/auth/signin/page.tsx` / `sign-in-client.tsx` (Client Component boundary), no new routes added
- runtime questions in scope: is the new Redis usage Node-only (no Edge); does the new client widget correctly stay client-only; does the Turnstile `fetch()` call have a bounded timeout; CSP compatibility

## Inputs Reviewed

- code paths reviewed: all files listed in Scope Handled above; `src/security/middleware/with-headers.ts` (CSP, read-only — confirmed no change needed)
- runtime docs reviewed: `AGENTS.md`'s Next.js 16 section; this repo's existing CSP `CLOUDFLARE_DOMAINS` allowlist
- earlier task artifacts reviewed: Cases 1–2's runtime summaries for conventions

## Actions Performed

- server/client boundary review performed: `login-abuse-control.ts` and `turnstile.ts` are server-only modules (Redis client, `TURNSTILE_SECRET_KEY`) — confirmed they are imported only from `auth.ts` (Node-only NextAuth config) and never from a Client Component. `TurnstileWidget.tsx` is explicitly `'use client'` and imports only browser APIs (`document`, `window`) plus React; `sign-in-client.tsx` (already `'use client'`) imports `env` from `@/core/env`, which is safe because `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is declared in T3-Env's `client` schema (bundled), not `server`.
- route handler / server action review performed: the new IP check in `route.ts` runs before `await connection()`'s downstream work reaches NextAuth — actually runs _after_ `await connection()` (unchanged position), still fully request-time; no caching introduced. `authorize()`'s new checks are synchronous-ish awaits inside the same async function, no new render-time concerns (Server Actions/RSC aren't involved in `authorize()` at all — it's plumbing invoked by NextAuth's own request handling, not a Next.js Server Action).
- proxy review performed: confirmed `AUTHJS_PROTOCOL_RATE_LIMIT_BYPASS_PATHS` in `with-rate-limit.ts` is unchanged by this fix — the bypass is still correct given the route handler's own (now properly dedicated) IP check compensates.
- cache / runtime review performed: no cache tags, no revalidation paths touched. The Turnstile `fetch()` call in `verifyTurnstileToken()` uses `AbortSignal.timeout(5000)` — a bounded network call, won't hang a login request indefinitely if Cloudflare is slow/unreachable (fails closed to "invalid token" on timeout).

## Current-State Findings

- Confirmed: no Edge-runtime code touches Redis or the Turnstile secret key — both stay strictly in the Node-runtime `authorize()` call path, consistent with the existing pattern for `UPSTASH_REDIS_REST_URL`-backed features (`apiRateLimit` in `rate-limit.ts` is likewise never used from Edge).
- Confirmed: `TurnstileWidget.tsx`'s module-level `scriptLoadPromise` singleton (one `<script>` tag per page load, shared by any number of widget instances) is a client-only, browser-tab-scoped concern — no SSR/hydration mismatch risk since the component renders an empty `<div>` server-side and only mutates the DOM inside `useEffect` (client-only).
- Risks: none identified.
- Drift: none — `CLOUDFLARE_DOMAINS` in CSP was already present and correct for this use case (see Security & Auth summary's Drift note); no CSP changes were needed or made.

## Runtime Boundary Assessment

- server vs client placement: `login-abuse-control.ts`/`turnstile.ts` (server-only) vs. `TurnstileWidget.tsx` (client-only) are cleanly separated; `sign-in-client.tsx` only reads the public site key, never the secret.
- edge vs node placement: unchanged — the Credentials flow was already Node-only (Drizzle/Postgres); this fix adds Node-only Redis/fetch calls to the same already-Node path.
- route handler / page / layout responsibilities: `route.ts` keeps its existing responsibility (a thin IP pre-check before delegating to NextAuth); `authorize()` keeps its existing responsibility (credential verification), now with the account-side abuse checks as an explicit first phase.
- proxy responsibilities: unaffected; not modified.

## Caching And Revalidation Notes

- cache-sensitive observations: none.
- revalidation observations: not applicable.
- request-time vs build-time notes: all new logic (Redis reads/writes, Turnstile `fetch()`, the artificial delay) executes strictly at request time inside `authorize()`/the route handler — never at module scope, never in a prerenderable component.

## Runtime Decisions / Constraints

- approved runtime constraints: keep Redis/Turnstile-secret usage Node-only; keep the Turnstile widget's script loading entirely client-side with no SSR involvement; bound the `siteverify` fetch with an explicit timeout.
- rejected directions: none proposed that conflicted with runtime constraints.
- runtime assumptions requiring validation: real end-to-end Turnstile verification (real keys, real browser round trip) — not performed in this session, flagged in `plan.md`.

## Artifact Synchronization

- `plan.md` updates: runtime review step marked complete.
- `intake.md` updates: none required.
- `implementation-plan.md` updates: not used for this workflow.
- specialist artifact updates: none beyond this file.

## Open Questions / Blockers

- unresolved questions: none.
- blockers: none.
- evidence still needed: real-browser Turnstile smoke check (deferred to the user, real keys required).

## Handoff Notes

- what the next agent should rely on: the server/client split for Turnstile is correct and should be preserved (never move `TURNSTILE_SECRET_KEY` usage into a Client Component).
- what should not be re-decided without new evidence: the decision to bound the `siteverify` call with a 5s timeout and fail closed.
- recommended next specialist or step: none for this case.

## Update Log

### Update Entry

- Date: 2026-08-22
- Trigger: Conditional runtime review for this security incident (route handler, Server/Client Component boundary, new Node-only Redis/fetch usage).
- Summary of change: Confirmed correct server/client separation, no Edge-runtime exposure of secrets, no CSP changes needed, bounded outbound Turnstile call.
- Sections refreshed: all.
