# 02 - Security & Auth - Summary

## Task Context

- Task ID: `2026-08-14-authjs-login-connection-closed`
- Task Objective: Classify the Preview and Production AuthJS sign-in rejection `Connection closed.` and recommend the smallest correction without weakening authentication, redirects, cookies, or telemetry.
- Current Run Scope: Read-only review of the AuthJS credentials sign-in path, edge identity/proxy path, root provider boundary, deployment-origin validation, and auth-flow constraints.
- Status: COMPLETED
- Last Updated: 2026-08-14
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- auth surfaces reviewed: `src/app/auth/signin/sign-in-client.tsx`, `src/app/auth/signin/page.tsx`, `src/app/api/auth/[...nextauth]/route.ts`, `src/modules/auth/infrastructure/authjs/auth.ts`, `src/modules/auth/infrastructure/authjs/auth.config.ts`, `src/modules/auth/ui/authjs/SessionProvider.tsx`, `src/app/layout.tsx`, `src/proxy.ts`, and `src/security/middleware/with-auth.ts`.
- authorization surfaces reviewed: public AuthJS protocol routes, subsequent proxy/private-route enforcement, and bootstrap/onboarding redirects.
- trust-boundary questions in scope: callback URL confinement, cookie/session ownership, canonical origin handling, public API classification, and client error observation.

## Inputs Reviewed

- code paths reviewed: AuthJS credentials callback, JWT/session callbacks, root `SessionProvider`, relative session endpoint access, proxy request identity, redirect construction, and global browser rejection handling.
- security/auth docs reviewed: `AUTH_FLOW_ANTI_PATTERNS.md`, `AUTH_FLOW_MATRIX_HOW_TO_USE.md`, `AUTH_FLOW_VERIFICATION_MATRIX.md`, and `SECURITY_CODING_PATTERNS.md`.
- earlier task artifacts reviewed: `plan.md` and `intake.md`.
- evidence reviewed: `temp/nextjs-16-boilerplate-woad.vercel.app.har`, AuthJS core E2E specs, and the installed Next.js RSC client implementation.

## Actions Performed

- identity flow tracing performed: Yes. `signIn('credentials', { redirect: false })` posts to the AuthJS credentials callback. The Node route handler rate-limits that callback and invokes `NextAuth(req, ctx, authOptions)` at request time. AuthJS signs the JWT session; the edge identity adapter/proxy and later server guards consume the signed session for private-route enforcement.
- authorization enforcement review performed: Yes. `/api/auth` is deliberately public for the AuthJS protocol, while the proxy enforces identity presence for private routes. This does not make client UI state authoritative.
- tenant / org context review performed: Yes. No caller-provided tenant or organization value is accepted by this sign-in flow. Existing post-auth onboarding and tenant enforcement remains downstream of the signed session.
- sensitive-data exposure review performed: Yes. The credentials handler hashes the rate-limit email identifier and logs only error name/message. No token, password, or cookie value is emitted by the reviewed code.

## Current-State Findings

- Confirmed: The exact `Connection closed.` string is emitted by Next.js's RSC client when a Flight response closes with pending work. It is not emitted by the reviewed AuthJS JWT/session callbacks, custom cookie configuration, or redirect sanitizer.
- Confirmed: The hosted `/auth/signin` response delivers a cached PPR shell containing an unresolved Suspense template and no form. The entire visible sign-in surface is inside `SignInPageContent`, which awaits `connection()`, checks `AUTH_PROVIDER`, reads `getServerSession(authOptions)`, sanitizes redirect inputs, and then renders `SignInClient`; its parent uses `Suspense fallback={null}`. If the dynamic segment does not settle, the user receives neither a form nor a visible recovery state.
- Confirmed: `SignInClient.handleSubmit` now catches rejected `signIn(...)` transport promises and uses `router.replace(...)` after a successful result. Those controls cannot handle an initial navigation that never resolves `SignInPageContent`, because neither the client form nor its submit handler is available in the cached PPR shell.
- Confirmed: Redirects are constrained to internal absolute paths by `sanitizeRedirectUrl()` before reaching `buildBootstrapRedirectUrl()`. The AuthJS sign-in page also sanitizes `callbackUrl` and `redirect_url` server-side. No reviewed path can forward a hostile external callback URL.
- Confirmed: `auth.config.ts` has no custom `cookies`, `redirect`, or callback URL override. AuthJS uses its default same-origin session cookie behavior. The SessionProvider uses relative AuthJS endpoints; it does not introduce a cross-origin session fetch.
- Confirmed: Production AuthJS requires a non-empty secret and explicit absolute `NEXTAUTH_URL`; Preview intentionally relies on Vercel request context. Forcing a production URL into Preview would risk cross-environment origin/cookie behavior and is not a safe correction.
- Confirmed: The HAR contains successful New Relic telemetry but no `/api/auth/*` callback/session response or rejected-promise payload. It cannot prove a server AuthJS callback failure or an origin/cookie mismatch.
- Risks: The originating Flight-stream closure is still unclassified. The client catch/router correction can prevent a post-submit rejection from escaping, but it is insufficient for the newly evidenced pre-form PPR failure. A visible fallback prevents a blank page but cannot make an unresolved dynamic template resolve; retain error reporting and investigate the server/Flight closure separately.
- Drift: The auth-flow anti-pattern and matrix describe historical Clerk bootstrap behavior. Their redirect/cookie invariants remain applicable, but they do not establish a root cause for this AuthJS-specific RSC transport failure.

## Trust Boundary Assessment

- where identity is established: The AuthJS credentials provider validates email/password against server-side data in `auth.ts`; NextAuth signs the JWT session in the route handler.
- where authorization is enforced: The client only initiates sign-in. `src/proxy.ts` and `with-auth.ts` enforce session presence for private requests; later application guards retain tenant/onboarding and resource enforcement.
- where tenant or org context is derived: Not from sign-in form data. Existing server-side identity/tenant providers derive it after authentication.
- what claims or inputs are trusted: Only server-validated credentials and signed AuthJS JWT claims are trusted for identity. `callbackUrl`, `redirect_url`, email, and password are untrusted inputs; callback URLs are sanitized, and credentials are schema-validated server-side.

## Sensitive Data And Exposure Notes

- logging / telemetry review: `GlobalErrorHandlers` correctly captures `Connection closed.` today. Do not add it to ignored rejection patterns. Any local recovery must emit a sanitized sign-in failure event to the existing browser logger/Sentry path before resolving the rejection.
- response exposure review: The rate-limit response exposes only a generic message. AuthJS protocol responses remain public by design; no sensitive payload is added by the reviewed code.
- client exposure review: No secret or server-only AuthJS configuration is referenced from the client sign-in component. Do not expose `NEXTAUTH_URL` or secret values to solve this issue.
- cache exposure review: Reviewed AuthJS route handler calls `await connection()` before request-sensitive auth work. No user- or tenant-scoped global cache was found in this path.
- PPR fallback rule: A sign-in fallback may show only generic, static loading UI such as a page title and `role="status"` loading message. It must not include credential inputs, session-derived text, callback/redirect values, error details, user identity, tenant state, or an authentication action before the dynamic server checks complete.

## Security Decisions / Constraints

- approved controls or constraints: Preserve `redirect: false` with server-side internal redirect sanitization; preserve full-page navigation only after a successful AuthJS result; preserve the request-time `NextAuth(req, ctx, authOptions)` invocation; preserve public `/api/auth` protocol routing and private-route server enforcement.
- minimal safe recommendation: Replace only this page's `fallback={null}` with a visible, static, non-sensitive loading shell, or equivalently scope the Suspense boundary around a dynamic content region while retaining that same static loading shell. Keep `connection()`, provider gating, `getServerSession(authOptions)`, redirect sanitization, and the signed-in redirect inside the dynamic server component; do not move them into the fallback or client code.
- disposition: The client router/catch correction alone is insufficient. It cannot provide a form, retry path, or bounded user feedback when the initial PPR dynamic segment remains unresolved. Treat visible fallback UI as immediate user-safe containment, not root-cause remediation; Runtime/Debug must continue tracing why the hosted Flight response closes before dynamic content resolves.
- rejected directions: Do not suppress `Connection closed.` in `GlobalErrorHandlers`; do not mark it as an ignored pattern; do not relax proxy checks; do not add a Preview-wide static `NEXTAUTH_URL`; do not add permissive cookie domains, `SameSite=None`, `trustHost`, or external callback allowlists without new evidence.
- required enforcement points: The correction belongs at the initiating client promise boundary. It must distinguish rejected transport from AuthJS's normal `result.error`, clear loading state, present the existing non-enumerating retry message, and report the sanitized error with `auth:credentials_sign_in` context rather than letting it escape unhandled.

## Artifact Synchronization

- `plan.md` updates: Not modified; user requested exactly one artifact write.
- `intake.md` updates: Not modified; user requested exactly one artifact write.
- `implementation-plan.md` updates: Not present and not created during this read-only specialist review.
- specialist artifact updates: Created this required persistent Security & Auth summary.

## Open Questions / Blockers

- unresolved questions: Which hosted request closes the Flight stream before `SignInPageContent` resolves, and whether it correlates with `connection()`, provider/env evaluation, `getServerSession(authOptions)`, SessionProvider refresh, deployment rollover, or an unrelated RSC render failure.
- blockers: The available HAR omits the AuthJS callback/session requests and rejected-promise payload, so it cannot discriminate among those runtime causes.
- evidence still needed: Focused hosted or scenario-run browser capture of `/api/auth/callback/credentials`, `/api/auth/session`, the following document navigation, response status/content type, and browser console stack. Redact cookies, credentials, secrets, and token-bearing URLs.

## Handoff Notes

- what the next agent should rely on: The hosted page can fail before the sign-in component exists. AuthJS callbacks/cookies/origins/redirects do not currently show a trust-boundary defect that explains this message; the visible fallback must not become an authentication or session-state surface.
- what should not be re-decided without new evidence: AuthJS protocol routes must stay public; authorization must remain server-side; callback targets must remain same-origin internal paths; Preview must not inherit Production's fixed `NEXTAUTH_URL`; global error handling must continue to observe unrelated unhandled rejections.
- recommended next specialist or step: Implementation Agent may make the smallest focused `try/catch` change in `sign-in-client.tsx`, using the repository's existing sanitized browser error-reporting path, then run focused component coverage and `pnpm e2e:authjs:core`. Runtime/Debug Investigation should inspect hosted network and server evidence if the caught transport failure recurs.

## Update Log

### Update Entry

- Date: 2026-08-14
- Trigger: Requested focused read-only Security & Auth review for hosted AuthJS login rejection.
- Summary of change: Classified the message as a Next.js RSC Flight-stream closure; identified the uncaught sign-in promise as the local reason it becomes unhandled; verified that current callbacks, cookie defaults, origins, redirect confinement, and server-side enforcement should be preserved.
- Sections refreshed: All sections created from the Security & Auth summary template.

### Update Entry

- Date: 2026-08-14
- Trigger: New hosted evidence of a cached `/auth/signin` PPR shell with an unresolved Suspense template and no form.
- Summary of change: Established that the initial failure occurs before `SignInClient` can run, so the existing client router/catch correction is insufficient by itself. Approved only a static, non-sensitive visible Suspense fallback as user-facing containment while preserving all server-side auth, session, and redirect decisions in the dynamic component.
- Sections refreshed: Current-State Findings, Sensitive Data And Exposure Notes, Security Decisions / Constraints, Open Questions / Blockers, Handoff Notes, Update Log.
