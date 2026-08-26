# 06 - Debug Investigation - Summary

> **Final debug disposition:** Vercel logs proved the Flight stream closed
> because the function could not load Next.js `file-logger.js`. See
> `final-root-cause-and-deployment-standard.md`.

## Task Context

- Task ID: `2026-08-14-authjs-login-connection-closed`
- Task Objective: Identify the source and trigger of the hosted AuthJS login `Unhandled Promise Rejection: Connection closed.` incident without changing production behavior.
- Current Run Scope: Installed dependency source, AuthJS credentials sign-in path, redirect/bootstrap flow, root error handling, supplied HAR, local hosted artifacts, and focused AuthJS E2E coverage.
- Status: COMPLETED - exact source, hosted failure chain, and final remediation confirmed.
- Last Updated: 2026-08-14
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- symptom or flow investigated: Hosted AuthJS credentials sign-in on `/auth/signin` through post-auth bootstrap navigation.
- runtime surfaces investigated: Next.js 16.2.11 RSC browser runtime, NextAuth 4.24.15 browser client and callback route, App Router bootstrap route handler, root `SessionProvider`, and global rejection handler.
- env or timing questions investigated: `AUTH_PROVIDER=authjs` route path; Next.js `cacheComponents: true`; successful sign-in has a session-refresh request before the hard bootstrap navigation.

## Inputs Reviewed

- code paths reviewed: `src/app/auth/signin/sign-in-client.tsx`, `src/app/auth/signin/page.tsx`, `src/app/api/auth/[...nextauth]/route.ts`, `src/modules/auth/infrastructure/authjs/auth.ts`, `src/app/auth/post-auth-redirect.ts`, `src/app/auth/bootstrap/start/route.ts`, `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`, `src/app/layout.tsx`, `src/proxy.ts`, and `src/shared/components/error/global-error-handlers.tsx`.
- installed dependency paths reviewed: `next-auth@4.24.15/.../next-auth/react/index.js` and `next@16.2.11/.../react-server-dom-webpack-client.browser.production.js`.
- logs / diagnostics reviewed: `temp/nextjs-16-boilerplate-woad.vercel.app.har`, local Vercel bundle captures under `logs/`, and repository history for commit `73bcf97`.
- tests / task artifacts reviewed: Existing plan/intake plus `e2e/authjs-session.spec.ts`, `e2e/authjs-dashboard-entry.spec.ts`, `e2e/authjs-onboarding-entry.spec.ts`, and `e2e/authjs-auth.ts`.

## Actions Performed

- reproduction attempts performed: No hosted browser replay was run. The supplied HAR does not preserve the sign-in request sequence; it contains only three New Relic telemetry submissions after the browser-side error.
- execution-path tracing performed: Traced credentials submission from `signInClient` through NextAuth client internals, the credentials callback route, AuthJS authorization, session refresh, and the bootstrap route handler.
- source-of-truth tracing performed: Confirmed the database/provisioning result determines post-auth readiness; the AuthJS JWT/session is identity transport, and `__onboarding_pending` is only a routing hint.
- evidence collection performed: Located the exact installed production dependency branch that creates the error and compared it against the browser handler and historical suppression change.

## Symptom Summary

- observed symptom: `Error: Unhandled Promise Rejection: Connection closed.` is captured on the hosted `/auth/signin` page.
- where it surfaces: `GlobalErrorHandlers` listens for `unhandledrejection`, prevents the browser default, logs `Unhandled Promise Rejection`, and forwards eligible errors to Sentry/New Relic. It observes the rejection; it does not originate it.
- reproducibility: Reported in Preview and Production. No complete request trace or stack trace from the incident is available locally.
- trigger conditions: AuthJS credentials sign-in success reaches a NextAuth session refresh and then a hard navigation to `/auth/bootstrap/start`. The exact concurrently open RSC/Flight request remains unknown.

## Confirmed Evidence

- code facts:
  - The exact literal is emitted by Next.js 16.2.11's compiled RSC browser client, not by NextAuth, AuthJS application code, New Relic, or Logflare: `react-server-dom-webpack-client.browser.production.js` calls `reportGlobalError(weakResponse, Error("Connection closed."))` when `close()` receives a response with `_allowPartialStream === false`.
  - That branch means the Flight response closed while the client still required non-partial response completion. It is a framework-level representation of an incomplete/aborted RSC response, not a network-library string identifying a socket or database connection.
  - `signIn('credentials', { redirect: false })` in `sign-in-client.tsx` delegates to NextAuth client code. NextAuth first fetches providers and CSRF state, posts `/api/auth/callback/credentials`, parses JSON, then calls `__NEXTAUTH._getSession({ event: 'storage' })` before resolving a successful credentials sign-in.
  - The application then assigns `window.location.href = result.url`. `result.url` is `/auth/bootstrap/start?redirect_url=...`; this is a full document navigation rather than an App Router `push`/`replace` call.
  - The credentials callback handler invokes `await connection()`, applies IP and identifier rate limits, then calls `NextAuth(req, ctx, authOptions)`. `authorize` performs DB credential and user lookups; no inspected AuthJS path constructs this error string.
  - `/auth/bootstrap/start` also invokes `await connection()`, resolves the authenticated identity and provisioning outcome, then returns a standard HTTP redirect. It is not a Flight endpoint.
  - The AuthJS root layout contains `SessionProvider` and a Suspense-wrapped app shell. No additional AuthJS route-navigation effect was found in the examined auth UI surfaces.
- runtime evidence:
  - The supplied HAR has the current URL `/auth/signin` and records only New Relic `jserrors`, browser-session blob, and `ins` telemetry calls, all returning `200`/`204`.
  - The HAR has no `/api/auth/*`, `/auth/bootstrap/*`, or RSC request available for correlation, and no telemetry payload/stack naming the source request.
  - Existing focused AuthJS E2E tests prove session endpoint JSON health, successful dashboard entry, and incomplete-user onboarding settlement. They currently do not fail a scenario on a browser `unhandledrejection` or preserve all request failures during credentials submission.
- diagnostics or logs:
  - Commit `73bcf97` deliberately removed `Connection closed` from ignored client error patterns, but its old comment incorrectly classified it as a Logflare error. The installed Next.js source disproves that classification.
  - The same Next.js RSC literal is present in captured hosted client bundles, consistent with the deployed framework being the message source.

## Execution Path

- entry point: Browser submits the client form on `/auth/signin`; `handleSubmit` calls NextAuth `signIn('credentials', { email, password, callbackUrl, redirect: false })`.
- critical path:
  1. NextAuth client obtains provider and CSRF data.
  2. NextAuth client POSTs the credentials callback.
  3. `src/app/api/auth/[...nextauth]/route.ts` rate-limits and dispatches to `NextAuth(req, ctx, authOptions)`.
  4. Credentials `authorize` validates DB-held credential and verification state, and NextAuth writes the session/JWT on success.
  5. NextAuth client refreshes `/api/auth/session` before returning a successful response to `handleSubmit`.
  6. The app assigns `window.location.href` to `/auth/bootstrap/start?redirect_url=...`.
  7. Bootstrap resolves authenticated identity, provisioning, and onboarding state, then redirects to the ready target or `/onboarding`.
- state transitions: unauthenticated credentials form -> AuthJS JWT/session established -> client session refreshed -> bootstrap resolves DB-backed provisioning truth -> ready route or onboarding routing hint/redirect.
- failure boundary: The emitted error occurs when the Next RSC browser runtime closes a non-partial Flight response with unresolved chunks. This is outside the inspected NextAuth callback and bootstrap redirect responses.

## Hypotheses And Failure Points

- likely failure points:
  - Most likely: A Flight/RSC navigation response associated with the sign-in page lifecycle is canceled or truncated while unresolved as the session refresh and subsequent full-document bootstrap navigation settle. The hard navigation is the only confirmed application-controlled navigation at success time.
  - Less likely: A deployed server/render error ends a Flight response early. The current HAR cannot disprove this because it lacks the request and Vercel function logs for the affected time window.
  - Less likely: The credentials callback/session endpoint is malformed or returns HTML. Existing E2E guards cover unauthenticated JSON endpoint shape, but production successful-session evidence is absent.
- hypotheses:
  - Falsifiable root-cause hypothesis: The unhandled rejection is created by the Next.js RSC browser client when a non-partial Flight response is abandoned during the successful AuthJS sign-in transition; `GlobalErrorHandlers` makes that framework rejection visible but does not cause it. The likely application trigger is the session-refresh-to-`window.location.href` transition, not the credentials DB logic or New Relic telemetry.
  - This hypothesis predicts a browser trace will show an RSC/document request canceled (`ERR_ABORTED` or equivalent) during the sign-in transition, with no preceding `5xx` or malformed response from `/api/auth/callback/credentials` or `/api/auth/session`.
- disproven possibilities:
  - The exact `Connection closed.` string does not originate in the repository AuthJS provider, credentials authorization, rate limiter, New Relic telemetry agent, or Logflare.
  - New Relic telemetry `200`/`204` responses in the HAR are post-error observation traffic, not evidence of a successful or failed AuthJS callback.
  - `GlobalErrorHandlers` is not the source; it only receives an already-unhandled browser rejection.

## Missing Evidence / Uncertainty

- what remains unclear: Which exact Flight/document request invokes the installed Next.js `close()` branch and whether it is a harmless browser cancellation or an upstream render truncation.
- what evidence would reduce uncertainty fastest: One production/preview browser trace that preserves the sign-in navigation and records console `pageerror`/`unhandledrejection`, every `/api/auth/*` response status/content type, and CDP network `loadingFailed` events including the failed request URL and error text.
- external dependencies or blockers: The supplied HAR starts at telemetry submission and omits the necessary request chain. No Vercel function logs or browser stack trace tied to the reported event were available in this investigation.

## Artifact Synchronization

- `plan.md` updates: Not edited; its active Debug Investigation hypothesis is refined by this summary.
- `intake.md` updates: Not edited; the exact dependency source and missing browser evidence are captured here.
- `implementation-plan.md` updates: Not present.
- specialist artifact updates: Created this single persistent Debug Investigation summary.

## Handoff Notes

- what the next agent should rely on: Treat this as a Next.js RSC browser-client closure, not an AuthJS `Connection closed` error. Preserve the server-side AuthJS callback, rate limit, DB-backed provisioning, redirect sanitization, and error observation behavior until the discriminating trace identifies the upstream close.
- what remains unproven: Whether the RSC response is canceled by the normal hard navigation or prematurely terminated by the deployed render/runtime.
- recommended next specialist or step: Run the narrow AuthJS browser sign-in scenario with a temporary test-only/CDP network and rejection capture against the affected Preview or Production deployment. The decision is binary:
  - canceled Flight/document request with healthy AuthJS callback/session responses: route to Next.js Runtime for a navigation/RSC compatibility decision;
  - `5xx`, aborted server response, or malformed AuthJS response before cancellation: route to Debug Investigation with matching Vercel function logs, then Security & Auth or Runtime based on the failing endpoint.

## Update Log

### Update Entry

- Date: 2026-08-14
- Trigger: Evidence-first investigation requested for the hosted AuthJS `Connection closed` rejection.
- Summary of change: Confirmed the installed Next.js production RSC client as the literal source; traced the AuthJS credentials/session/bootstrap sequence; bounded the unresolved cause to a Flight response close; documented the fastest falsifying browser check.
- Sections refreshed: All initial sections.

### Update Entry

- Date: 2026-08-14
- Trigger: New production screenshot shows `Loading sign in...` plus Next client `Unhandled Promise Rejection: Connection closed.` after a fallback deployment.
- Scope handled: Current source, `connection()`, RSC `getServerSession(authOptions)`, AuthJS config/provider imports, active Vercel deployment/build data, and accessible Vercel request logs. No application code was edited.
- Confirmed evidence:
  - `Loading sign in...` is unique to `src/app/auth/signin/page.tsx` and can render only while `SignInPageContent` is suspended. The active order is `await connection()`, AuthJS provider gate, `await getServerSession(authOptions)`, then `await searchParams` before the form is emitted.
  - `connection()` is correctly the first request-time operation. It is required under `cacheComponents: true` and is not a database/socket connection.
  - Installed `next-auth@4.24.15` implements RSC `getServerSession(authOptions)` by reading `headers()` and `cookies()`, then calling local `AuthHandler` with `action: 'session'` and `providers: []`. It does not fetch `/api/auth/session`, execute the credentials provider's `authorize`, query the database, bcrypt-compare a password, or invoke bootstrap.
  - `authOptions` uses JWT sessions. Importing `auth.ts` builds the Credentials provider definition, but database and bcrypt work occurs only in `authorize` during `POST /api/auth/callback/credentials`, which cannot run before the form exists.
  - The current production alias is deployment `dpl_A5RByEAXNL2Tiwknir7xxe88HTSf`, produced by GitHub Actions run `31808466275` from `1f42eb87`. Vercel reports a successful prebuilt `.vercel/output` deployment. Its anonymous `/auth/signin` response is a cache-hit PPR shell (`x-nextjs-prerender: 1`) with unresolved `B:0` Suspense content and no form.
  - Production `1f42eb87` predates the visible-fallback commit `3921f831`; it cannot be the source of the screenshot text. The accessible PR Preview is deployment-protected, so it cannot be anonymously correlated either.
  - Vercel returned no log entry for the captured production request ID and no recent production `5xx`. This does not prove a stream cannot close, but it provides no evidence for an exception in `connection()`, `getServerSession()`, auth config evaluation, or credentials authorization.
- Superseded prior hypothesis: The current source uses `router.replace()` rather than `window.location.href`; the prior post-submit hard-navigation explanation does not explain the reported pre-form loading screen.
- Falsifiable root-cause hypothesis: The loading screen and `Connection closed.` rejection are effects of one initial PPR failure. Vercel/Next delivers the cached sign-in shell, but the browser's dynamic Flight continuation closes before `SignInPageContent` completes. `GlobalErrorHandlers` observes the resulting framework rejection; it does not create it. The evidence does not support AuthJS provider/database work as the cause of this pre-form occurrence.
- Cheapest discriminating check: Against the exact deployment that renders `Loading sign in...`, capture one anonymous browser navigation with CDP network events and console `unhandledrejection`. The hypothesis is supported only when the document shell is `200` and its associated Flight continuation is canceled, reset, or truncated without a preceding function `5xx`. It is falsified by a continuation response or function log naming `connection()`, `getServerSession()`, auth config import/evaluation, or session-cookie parsing. Query Vercel with the captured request ID immediately after the trace; redact cookies and credentials.
- Handoff: Route a clean continuation closure to Next.js Runtime for PPR/transport analysis. Route a named server error back to Debug Investigation, then to Runtime or Security & Auth based on the failing boundary.
