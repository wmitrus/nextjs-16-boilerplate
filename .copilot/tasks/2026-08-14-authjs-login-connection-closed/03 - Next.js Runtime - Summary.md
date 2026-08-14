# 03 - Next.js Runtime - Summary

## Task Context

- Task ID: `2026-08-14-authjs-login-connection-closed`
- Task Objective: Identify the runtime source of `Unhandled Promise Rejection: Connection closed.` during hosted AuthJS login and provide the smallest runtime-safe remediation direction.
- Current Run Scope: App Router AuthJS client/server flow, root client error listener, New Relic browser delivery, proxy, and hosted environment implications.
- Status: COMPLETED
- Last Updated: 2026-08-14
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- runtime entrypoints reviewed: `src/app/auth/signin/sign-in-client.tsx`, `src/app/auth/signin/page.tsx`, `src/app/auth/bootstrap/start/route.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/layout.tsx`, and `src/proxy.ts`
- App Router surfaces reviewed: root layout, AuthJS sign-in RSC page and client component, bootstrap redirect route, AuthJS catch-all route handler
- runtime questions in scope: client/server handoff after `signIn()`, Flight stream lifecycle, SessionProvider behavior, proxy placement, New Relic role, and Vercel env contract

## Inputs Reviewed

- code paths reviewed: AuthJS `SessionProvider`, `auth.ts`, `auth.config.ts`, `AuthJsEdgeIdentitySource`, route policy/rate-limit policy, global error handlers, browser New Relic config, AuthJS E2E helpers/specs, and `src/core/env.ts`
- runtime docs reviewed: repository runtime and security guidance; task `plan.md` and `intake.md`
- earlier task artifacts reviewed: `plan.md`, `intake.md`
- hosted evidence reviewed: `temp/nextjs-16-boilerplate-woad.vercel.app.har`
- framework evidence reviewed: installed Next.js 16.2.11 RSC client runtime

## Current-State Findings

- Confirmed: the exact `Error("Connection closed.")` string is created by the installed Next.js React Server Components client runtime. When a non-partial Flight response closes, its `close()` function calls `reportGlobalError()`, which rejects every pending RSC chunk with that error. This is not a string thrown by the reviewed AuthJS client/server code or the New Relic integration.
- Confirmed: `SignInClient` calls `await signIn('credentials', { redirect: false })` and then performs a full-document navigation through `window.location.href = result.url`. Its JSX event wrapper intentionally discards `handleSubmit()`'s returned promise, and `handleSubmit()` has no `try/catch`. Any `signIn()` rejection therefore reaches the root `unhandledrejection` listener.
- Confirmed: the root `GlobalErrorHandlers` listener observes and reports the rejected promise; it does not create the original RSC error. It calls `preventDefault()` for a first-seen rejection, logs through the browser logger, and reports to Sentry. `Connection closed` was deliberately removed from the ignored list historically, so this framework-level error is currently surfaced.
- Confirmed: the HAR contains successful New Relic collector requests whose referrer is `/auth/signin`; the collector request is wrapped by the NR SPA agent. It contains no AuthJS callback, session, bootstrap, or Flight request, and therefore neither identifies an aborted app request nor proves that New Relic caused one.
- Confirmed: the AuthJS catch-all handler is request-dynamic (`await connection()` is its first await) and calls `NextAuth(req, ctx, authOptions)` inside the handler. It avoids the banned module-level `NextAuth()` pattern. The credentials callback is Node-compatible because it uses Node crypto/bcrypt; it is not forced into Edge runtime.
- Confirmed: `/api/auth/*` is public in route policy. The protocol endpoints used by `next-auth/react` bypass the proxy's general API rate limiter. Proxy AuthJS identity extraction is Edge-safe JWT parsing and does not open a database connection.
- New hosted evidence: public `GET /auth/signin` returns `200`, `x-nextjs-prerender: 1`, and `x-vercel-cache: HIT`. Its captured DOM has the root header plus `<!--$?--><template id="B:0"></template><!--/$-->`, but no sign-in content or form. This matches the cached PPR shell for the page's sole `<Suspense fallback={null}>` boundary: `SignInPageContent` calls `connection()` and `getServerSession()`, so it suspends while its dynamic continuation is pending.
- Current local client state: `SignInClient` no longer uses `window.location.href`. It validates the same-origin AuthJS result, calls `router.replace(...)`, and catches `signIn()` failures to render the existing generic form error. This resolves the prior direct full-document-navigation hypothesis in the current workspace; it still requires focused browser proof in a hosted-equivalent runtime.
- Runtime conclusion: `fallback={null}` is not the direct creator of `Error("Connection closed.")`; that literal still comes from the RSC client when a pending Flight stream closes. It is, however, the direct reason a closed or missing continuation leaves the public sign-in route entirely blank. The hosted DOM proves that this page currently has no usable resilient shell when the dynamic continuation does not settle.
- Most likely remaining runtime origin: the deployed sign-in dynamic continuation or its RSC/Flight transport is closing before `SignInPageContent` is delivered. The provided DOM is consistent with that failure but does not identify whether the close is upstream/Vercel-side or a client-side navigation cancellation.
- Uncertain: the HAR has no callback or Flight request, so it cannot prove which Flight response closed or distinguish this navigation-cancellation path from a real Vercel/server response truncation. A browser capture with failed/aborted requests and `pageerror` evidence is required before treating the origin as conclusive.
- Risks: re-adding `Connection closed` to ignored patterns would hide a potentially real Flight truncation and violates the task's non-goal. Changing proxy rules, moving the Node AuthJS handler to Edge, or changing New Relic delivery lacks supporting evidence and would increase blast radius.
- Drift: the root layout currently uses the approved CDN `beforeInteractive` New Relic delivery, while the HAR's New Relic wrapper only evidences error collection after the failure. The HAR should not be interpreted as proof of an AuthJS or NR transport failure.

## Runtime Boundary Assessment

- server vs client placement: `SignInClient` and `SessionProvider` correctly run on the client. The sign-in page is an RSC that calls `await connection()` before `getServerSession()`. The catch-all AuthJS handler and credentials adapter remain server-only; no secret or DB path reaches the client.
- edge vs node placement: `src/proxy.ts` is Edge-oriented and imports only the JWT-based `AuthJsEdgeIdentitySource` path. The catch-all AuthJS handler imports Node crypto and reaches bcrypt/DB through `authOptions`, so its Node server execution is required and currently implicit/correct under `cacheComponents: true`.
- route handler / page / layout responsibilities: the AuthJS handler supplies JSON/protocol responses; `/auth/bootstrap/start` resolves post-login state and redirects; the RSC page renders the form; the client starts credentials sign-in and owns navigation after success. The root layout owns SessionProvider and error observation, not AuthJS request handling.
- proxy responsibilities: proxy can establish request identity and apply common security policies, but it neither handles `/api/auth/*` as protected traffic nor should it be used to repair a client Flight lifecycle error.

## Caching And Revalidation Notes

- cache-sensitive observations: the sign-in page and AuthJS route handler explicitly opt into request-time rendering through `connection()`. No evidence indicates user/session data is statically cached or shared across users.
- revalidation observations: no server action or cache revalidation occurs in the reviewed login handoff.
- request-time vs build-time notes: `cacheComponents: true` forbids route `runtime`/`dynamic` exports; the current handler/page correctly use `connection()` instead. Do not add segment exports while addressing this incident.

## Runtime Decisions / Constraints

- approved runtime constraints: preserve `await connection()` in the RSC page and handler; preserve the Node-only AuthJS route-handler path; retain global reporting for unexplained Flight closures.
- verified current local change: `SignInClient` now uses same-origin-checked `router.replace(...)` and catches `signIn()` failures. Keep that change; it is the narrow client-side correction for the former full-document navigation path.
- narrowest remaining runtime-safe patch: replace only the sign-in page's `fallback={null}` with a visible, static sign-in fallback. The fallback should include a usable `SignInClient` with no query-derived props, which safely defaults the post-auth destination to `/dashboard`; the dynamic child can still replace it when session/query state arrives. This keeps `connection()` and the server-side already-authenticated redirect intact, does not add a banned route segment config, and turns a failed continuation from a blank public route into a working credentials form. A loading-only fallback is insufficient because the hosted evidence shows the continuation can remain absent.
- rejected directions: do not suppress only `Connection closed`, alter the New Relic browser agent/configuration, add a route segment runtime config, or change proxy/rate-limit exemptions without focused browser evidence.
- runtime assumptions requiring validation: the current `result.url` remains the already-sanitized same-origin bootstrap path; `router.replace()` and the visible fallback must be verified in Preview and Production. Browser evidence must also show whether the pending Flight request fails after an initial document load, because the HAR/DOM alone cannot attribute the close.

## Artifact Synchronization

- `plan.md` updates: not modified by this runtime review; its `03 Next.js Runtime` item can be marked complete by the workflow owner.
- `intake.md` updates: not modified by this runtime review; exact closure request remains evidence-pending.
- `implementation-plan.md` updates: not present at review time.
- specialist artifact updates: created this single required runtime summary artifact.

## Open Questions / Blockers

- unresolved questions: Which request closes prematurely: the abandoned sign-in Flight stream, the destination transition, or an upstream Vercel response? Does `router.replace()` eliminate the reported rejection in both hosted environments?
- blockers: the supplied HAR captures only New Relic telemetry, not the login's AuthJS/Flight network sequence. The newly supplied document response/DOM establishes an unsatisfied PPR boundary but does not include the associated dynamic continuation response or a Vercel function log.
- evidence still needed: focused browser run that records `pageerror`/`unhandledrejection`, document plus Flight request outcomes, callback/session/bootstrap outcomes, and Vercel function logs correlated to the attempt. Test both the existing `router.replace()` path and the visible fallback after the page patch.

## Handoff Notes

- what the next agent should rely on: the literal's origin is Next.js RSC client stream closure; current AuthJS handler/proxy placement is runtime-valid; global handlers and New Relic observe/report the error rather than originating it.
- what should not be re-decided without new evidence: proxy policy, Node-vs-Edge handler placement, New Relic CDN configuration, or removal of the page's request-time `connection()` boundary.
- recommended next specialist or step: Implementation Agent should preserve the existing local `SignInClient` change and replace the sign-in page's null fallback with a usable static form fallback. Then run a fresh hosted-equivalent browser scenario that asserts a sign-in form is available even when the dynamic continuation is delayed/absent and that completed-user and incomplete-user AuthJS login produce no `pageerror`/unhandled rejection. Verify Vercel Preview and Production each expose `AUTH_PROVIDER=authjs`, `NEXTAUTH_SECRET`, and a correct environment-scoped `NEXTAUTH_URL` where configured; Preview may rely on request host only when `NEXTAUTH_URL` is absent, per the current env validator.

## Update Log

### Update Entry

- Date: 2026-08-14
- Trigger: Focused read-only runtime review for hosted AuthJS login connection closure.
- Summary of change: Established the framework-level source, confirmed the client navigation/error propagation path, ruled out several runtime boundaries as primary causes, and documented the smallest evidence-backed fix direction with remaining uncertainty.
- Sections refreshed: all sections; initial artifact creation.

### Update Entry

- Date: 2026-08-14
- Trigger: New hosted public response and DOM evidence for `/auth/signin`, plus review of current local client changes.
- Summary of change: The cached PPR shell and unsatisfied `B:0` boundary establish that the null fallback directly produces the blank hosted sign-in route when the dynamic continuation is absent. This is a symptom-resilience defect, not proof that the fallback causes the RSC `Connection closed` error. Corrected the stale client-path finding: the workspace already uses `router.replace()` and catches `signIn()` failures. Recommended preserving that change and adding only a usable static sign-in fallback.
- Sections refreshed: Current-State Findings, Runtime Decisions / Constraints, Open Questions / Blockers, Handoff Notes, Update Log.
