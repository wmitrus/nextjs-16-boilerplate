# Constraints Summary

## Task

Contain the hosted AuthJS sign-in RSC closure without weakening identity, redirect, or telemetry controls.

## Scope

- AuthJS sign-in page rendering, client credential submission, and focused regression coverage.
- Preview and Production browser verification after deployment.

## Out of Scope

- Changes to AuthJS secrets, cookie policy, callback allowlists, proxy policy, New Relic configuration, database code, or tenant enforcement.

## Architecture Constraints

- Keep server session reads, provider gating, redirect sanitization, and signed-in redirects in the server component.
- Keep the Node-only NextAuth handler request-time and do not add route segment runtime or dynamic exports.
- Keep client recovery at the credentials-submission boundary.

## Security/Auth Constraints

- Preserve public AuthJS protocol routes and server-side authorization for private routes.
- Permit only same-origin callback URLs before client navigation.
- Do not suppress `Connection closed.` globally or expose credential, session, tenant, or redirect data in a fallback.

## Runtime Constraints

- Preserve `await connection()` before `getServerSession()`.
- The fallback is static and non-sensitive. It is not an authentication or session decision surface.
- Preserve error reporting for unexplained RSC/Flight closures.

## Validation Constraints

- Run focused component tests, `pnpm e2e:authjs:core`, and `pnpm typecheck`.
- Do not run ESLint because the documented agent-shell blocker is active.
- Use scenario-managed E2E rather than raw Playwright for AuthJS sign-off.

## Explicitly Allowed Changes

- Catch rejected AuthJS credential requests locally.
- Use same-origin App Router navigation after a successful result.
- Render a generic loading state rather than a blank sign-in PPR shell.
- Add focused tests for successful navigation, AuthJS result errors, rejection recovery, and cross-origin callbacks.

## Explicitly Forbidden Changes

- Do not change cookies, static Preview origins, proxy exemptions, New Relic, or global error suppression without new causal evidence.

## Protected Invariants

- Invalid credentials remain non-enumerating.
- Completed users settle on the ready route and incomplete users settle through onboarding.
- Redirect targets remain internal and sanitized.

## Open Questions / Blocks

- The exact hosted Flight continuation that closes remains unclassified. The deployed page must be retested after this patch with browser console and network evidence.
