# Constraints

## Auth-Flow Constraints Confirmed From Current Code And Docs

- Bootstrap start remains the hot-path routing boundary for post-auth entry; do not move primary onboarding routing back into `/users` or `/dashboard` layouts.
- DB-backed provisioning and onboarding status remain authoritative; `__onboarding_pending` is a routing hint only.
- Cookie mutation remains legal only in route handlers or server actions; current set/delete usage complies.
- `redirect_url` forwarding must continue through `sanitizeRedirectUrl()`.
- Provider-aware sign-in routing must be used consistently; AuthJS paths must not fall back to Clerk-only `/sign-in` URLs.
- For AuthJS flows, matrix sign-off is incomplete until AF-02, AF-05, AF-06, AF-09, AF-10, AF-16, AF-17, AF-21, and AF-27 are explicitly verified or deferred with reason.

## Review Findings That Constrain Any Next Fix

- Do not accept hardcoded `/sign-in` inside onboarding/bootstrap guards as safe for AuthJS.
- Do not claim the repository still uses `/users` as the default app entry when live code sets `DEFAULT_APP_ENTRY_URL = '/dashboard'`.
- Do not broaden proxy-based onboarding redirects for `/users`; current code intentionally preserves DB-backed authority in route layouts for that path.
- Do not treat the current loop report as fully root-caused until browser evidence distinguishes stale session/bootstrap churn from pure redirect drift.

## Approved Remediation Shape

- Reuse the existing provider-aware sign-in path pattern already established in `src/security/middleware/with-auth.ts` rather than inventing a second redirect convention.
- Keep the first implementation slice limited to:
  - `src/app/auth/bootstrap/start/route.ts`
  - `src/app/onboarding/layout.tsx`
  - `src/app/users/layout.tsx`
  - directly coupled unit tests for those paths
- Treat raw `err` logging cleanup and docs/matrix landing-route reconciliation as adjacent follow-up scope unless they are required to complete the same slice safely.
