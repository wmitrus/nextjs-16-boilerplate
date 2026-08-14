# Implementation Plan

## Status

- [done] Catch rejected AuthJS `signIn()` promises and restore the submit state.
- [done] Replace hard document navigation with same-origin `router.replace()`.
- [done] Reject cross-origin AuthJS result URLs.
- [done] Replace the sign-in page's null Suspense fallback with generic visible loading UI.
- [done] Add focused client regression coverage.
- [done] Run focused local validation.
- [blocked] Deploy and verify Preview and Production with real hosted sign-in evidence.

## Implementation Notes

The page keeps `connection()`, provider gating, session lookup, redirect sanitization, and authenticated-user redirect in `SignInPageContent`. The static fallback contains only a generic loading status, so it cannot disclose state or initiate authentication before those server checks resolve.

## Hosted Verification Plan

1. Deploy the current change through the normal Preview and Production release path.
2. Confirm a public `GET /auth/signin` renders a visible fallback or form rather than a blank shell.
3. With approved non-privileged test identities, verify completed-user and incomplete-user login flows.
4. Capture redacted console and network evidence for AuthJS callback, session, bootstrap, and Flight/document requests.
5. Confirm no unhandled `Connection closed.` rejection occurs; if it does, correlate the failed request with Vercel logs before expanding scope.
