# 05 - Validation Strategy - Summary

> **Superseded validation conclusion:** Auth-only tests cannot prove this
> packaging failure. Use the artifact and hosted-runtime gates in
> `final-root-cause-and-deployment-standard.md`.

## Task Context

- Task ID: `2026-08-14-authjs-login-connection-closed`
- Task Objective: Validate the AuthJS credentials sign-in correction: catch rejected `signIn()` calls locally, replace successful hard navigation with App Router navigation, keep the sign-in RSC render path lightweight, and confirm the build worker cap.
- Current Run Scope: Change-validation review plus synchronization against the current implementation and local validation evidence.
- Mode: CHANGE VALIDATION
- Status: COMPLETED
- Last Updated: 2026-08-14
- Related Control Artifacts: `plan.md`, `intake.md`, `02 - Security & Auth - Summary.md`, `03 - Next.js Runtime - Summary.md`, `06 - Debug Investigation - Summary.md`

## Scope Handled

- change surfaces assessed: `src/app/auth/signin/sign-in-client.tsx`, `src/app/auth/signin/page.tsx`, colocated unit/page tests, AuthJS E2E helper/specs, scenario runner, `next.config.ts`, and auth-flow verification matrix.
- validation questions in scope: local rejection handling, successful App Router navigation, normal AuthJS result errors, lightweight JWT-backed existing-session redirect, credentials-session health, completed and incomplete post-sign-in settlement, build worker cap application, and hosted Preview/Production evidence.
- excluded validation areas: AuthJS route-handler authorization, proxy policy, credentials persistence, cookie configuration, tenancy, and New Relic configuration. These are unchanged and were reviewed by the Security & Auth and Next.js Runtime specialists.

## Inputs Reviewed

- code paths reviewed: `src/app/auth/signin/sign-in-client.tsx`, `e2e/authjs-auth.ts`, `e2e/authjs-session.spec.ts`, `e2e/authjs-dashboard-entry.spec.ts`, and `e2e/authjs-onboarding-entry.spec.ts`.
- tests / configs / workflows reviewed: `src/app/auth/signin/sign-in-client.test.tsx`, `package.json`, `playwright.config.ts`, `docs/usage/05 - Playwright E2E Architecture.md`, `AUTH_FLOW_MATRIX_HOW_TO_USE.md`, and `AUTH_FLOW_VERIFICATION_MATRIX.md`.
- earlier task artifacts reviewed: `plan.md`, `intake.md`, and the completed Debug Investigation, Security & Auth, and Next.js Runtime summaries.

## Actions Performed

- validation posture review performed: Yes. Existing unit coverage only asserts `signIn()` arguments. Existing AuthJS core E2E exercises session-route JSON health, a completed-user credentials login, and an incomplete-user credentials login through onboarding.
- risk analysis performed: Yes. A client mock cannot prove an App Router/Flight transition or deployed rejection behavior; browser evidence cannot reliably force an RSC transport rejection. Both layers are necessary and non-duplicative.
- test-level recommendations prepared: Yes.
- command recommendations prepared: Yes.

## Current-State Findings

- Confirmed: Current `SignInClient` catches rejected `signIn()` promises, rejects cross-origin result URLs, and uses `router.replace()` for same-origin results.
- Confirmed: Current `SignInPageContent` no longer imports `authOptions` or calls `getServerSession(authOptions)`; it reads the signed AuthJS JWT through `getToken()` with App Router cookie/header stores after `await connection()`.
- Confirmed: `next.config.ts` now caps Next.js build workers with `experimental.cpus`; `pnpm build` printed `cpus: 16`, proving the cap was loaded by Next.
- Confirmed: The implemented change stays within the sign-in page/client and build config. It does not alter route-handler, proxy, authorization, tenant, cookie, or database behavior.
- Confirmed: `pnpm e2e:authjs:core` is the supported scenario-runner entrypoint and covers AuthJS JSON endpoint health plus fresh completed- and incomplete-user sign-in paths.
- Risks: Neither current unit tests nor current AuthJS E2E explicitly fail on a browser `unhandledrejection`/`pageerror` during credentials sign-in. A hosted runtime check must add that observation for this incident.
- Risk: The local `pnpm build` run did not finish after accepting `cpus: 16`, so build completion is still unproven in this agent shell.
- Drift: The mandatory auth-flow matrix is primarily phrased in historical Clerk `/users` terminology. Its routing/redirect invariants apply, but AuthJS evidence must use the current `/dashboard` and `/onboarding` equivalents rather than claiming Clerk-path coverage.

## Validation-Risk Assessment

- primary risks: a rejected `signIn()` remains unhandled; a successful credentials result fails to navigate through the sanitized bootstrap URL; normal AuthJS result errors or the email-verification branch regress while adding `try/catch`; a local-only pass hides the Preview/Production Flight-close symptom.
- confidence gaps: The supplied HAR does not contain the credentials/session/Flight request sequence. The upstream Flight closure is still unclassified, so a catch is a bounded recovery behavior, not root-cause proof.
- over-validation or under-validation concerns: Route-handler/db integration tests, proxy matrix expansion, and broad E2E suites add no signal for this client-only change. Conversely, unit tests alone are insufficient because they cannot observe real browser navigation, session refresh, or hosted App Router behavior.

## Recommended Validation Scope

- minimum required validation:
  - Extend the colocated `SignInClient` unit test to prove a rejected `signIn()` promise is caught, renders the existing generic retry-safe error, and re-enables submission; it must not escape as a rejected event-handler promise.
  - Prove a successful `result.url` invokes `useRouter().replace(result.url)`, preserving the existing bootstrap URL built from the sanitized callback destination. Preserve explicit assertions for the `signIn()` options.
  - Cover the existing normal `result.error` branch, including `EmailNotVerified`, so adding the rejection boundary does not collapse AuthJS response errors into transport handling or bypass the verification route.
  - Run the focused unit file, then `pnpm typecheck`. Do not run lint: the repository's documented ESLint execution blocker is active.
  - Run `pnpm e2e:authjs:core` with its scenario-managed AuthJS/container profile. It must pass `/api/auth/session` and providers JSON health, a fresh completed-user credentials sign-in to `/dashboard`, and a fresh incomplete-user credentials sign-in through `/onboarding` to `/dashboard`.
  - For each affected hosted environment, Preview and Production, execute an interactive credentials sign-in with approved non-privileged completed and incomplete test identities. Record browser console/page-error or unhandled-rejection evidence and the callback/session/bootstrap/document request outcomes with credentials, cookies, tokens, and sensitive URLs redacted. No `Connection closed.` unhandled rejection may occur.
  - Revisit and record the matrix for the AuthJS equivalents: AF-05 completed returning-user sign-in (`/dashboard`), AF-06 incomplete-user sign-in (`/onboarding` then `/dashboard`), AF-22 re-authentication, AF-26 unauthenticated private-route redirect, and AF-27 already-authenticated sign-in routing. Mark all unrelated Clerk-specific rows N/A for this provider rather than passing them by inference.
- optional additional validation:
  - If either hosted run records a failed/aborted Flight request, capture CDP network `loadingFailed` evidence and correlate it with Vercel function logs before expanding the fix; this discriminates ordinary navigation cancellation from server/render truncation.
  - Add explicit browser assertions for `pageerror`/`unhandledrejection` to the existing AuthJS dashboard and onboarding entry specs if the implementation agent can do so without introducing a second test harness. This converts the incident symptom into a durable regression guard.
- validation explicitly not required:
  - No new Drizzle/db test: no repository/schema/DB adapter behavior changes.
  - No route-handler, proxy, authorization, tenancy, cache, or cookie test expansion: those enforcement paths and configuration are unchanged.
  - No full Clerk auth matrix, raw Playwright sign-off, broad `pnpm e2e:matrix`, build, or manual New Relic test. These do not provide additional signal for the changed AuthJS client handoff.

## Validation Commands / Checks

- commands to run:
  - `pnpm vitest run --config vitest.unit.config.ts src/app/auth/signin/sign-in-client.test.tsx`
  - `pnpm exec vitest run --config vitest.unit.config.ts src/app/auth/signin/page.test.tsx src/app/auth/signin/sign-in-client.test.tsx --coverage.enabled=false`
  - `pnpm typecheck`
  - `pnpm e2e:authjs:core`
  - `pnpm build` after the worker cap, with the remaining hang tracked separately if it reproduces
- environment prerequisites: Node 24 and pnpm; the AuthJS core run requires the scenario runner's supported container profile, `E2E_BACKEND_MODE=container`, and its isolated `127.0.0.1:5433/app_test` database. Hosted checks require authorized Preview/Production test identities and a browser capture mechanism; do not use raw Playwright as the authoritative local AuthJS sign-off.
- expected evidence: unit assertions for rejected/success/normal-result-error paths; a passing typecheck; line-reporter scenario output for the AuthJS core suite; and separate Preview and Production matrix records showing clean console/rejection behavior and healthy AuthJS callback/session/navigation outcomes.

## Artifact Synchronization

- `plan.md` updates: Not modified because the user requested exactly one artifact write.
- `intake.md` updates: Not modified because the user requested exactly one artifact write.
- `implementation-plan.md` updates: Not present; not created because the user requested exactly one artifact write.
- specialist artifact updates: Created this required persistent Validation Strategy summary only.

## Open Questions / Blockers

- unresolved questions: Whether `router.replace()` eliminates the hosted Flight closure or only contains its unhandled-rejection symptom; whether a hosted closure correlates with an aborted client navigation or server-side response truncation.
- blockers: None for implementing and running local focused validation. Hosted acceptance is blocked until approved Preview/Production test identities and browser/network capture access are available.
- dependencies on architecture / security / runtime decisions: Use the already-approved Security & Auth constraints (preserve `redirect: false`, same-origin sanitized redirects, server-side enforcement, and global reporting) and Runtime decision (`router.replace()` only after a successful AuthJS result). Do not re-decide proxy, cookie, Node-handler, or New Relic behavior without new evidence.

## Handoff Notes

- what the next agent should rely on: The smallest credible proof is three layers: focused client behavior tests, the existing scenario-managed AuthJS core E2E suite, and interactive Preview plus Production evidence. These validate distinct risks.
- what should not be re-decided without new evidence: The original Flight close remains unclassified; catching it locally must not suppress global reporting for unrelated errors or be presented as server-transport root-cause proof.
- recommended next specialist or step: Implementation Agent applies the narrow client change and tests; then Playwright E2E/Runtime collects the required hosted evidence and marks the listed AuthJS matrix scenarios PASS, BLOCKED, or DEFERRED explicitly.

## Update Log

### Update Entry

- Date: 2026-08-14
- Trigger: Requested minimum safe validation review for the proposed AuthJS client sign-in fix.
- Summary of change: Defined focused unit, scenario-runner E2E, and Preview/Production interactive matrix evidence; excluded unrelated validation surfaces.
- Sections refreshed: All sections created from the Validation Strategy summary template.

### Update Entry

- Date: 2026-08-14
- Trigger: Continued validation sync after the sign-in RSC `getToken()` patch and requested `pnpm build` worker cap.
- Summary of change: Updated the validation surface to include the page-level JWT redirect predicate, `next.config.ts` worker cap, combined focused test command, and the observed local build hang after Next accepted `cpus: 16`.
- Sections refreshed: Task Context, Scope Handled, Current-State Findings, Validation Commands / Checks, Update Log.
