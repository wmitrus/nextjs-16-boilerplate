# AuthJS Login Connection-Closed Incident Plan

## Task Metadata

- Task ID: `2026-08-14-authjs-login-connection-closed`
- Objective: Determine and correct the shared Preview/Production AuthJS login error `Unhandled Promise Rejection: Connection closed.` without weakening auth, redirect, or telemetry safeguards.
- Scope: Hosted AuthJS sign-in path, NextAuth client/server interaction, root client error handling, New Relic evidence, provider/runtime configuration, and focused browser-capable validation.
- Non-goal: Suppress the error merely in telemetry or change provider secrets/hosted settings without evidence.
- Leantime: Milestone `99`; task `100` is active with status `W toku` (`4`).

## Hypothesis And Discriminating Check

- Hypothesis: Next.js rejects a pending RSC Flight segment when its stream closes; the sign-in client previously let this surface as an unhandled submission rejection, and the page's null PPR fallback made a missing initial continuation blank.
- Cheapest discriminating check: a hosted public request showed an unresolved PPR boundary with no form. After deployment, capture the corresponding Flight/document requests and AuthJS callback/session responses to distinguish cancellation from server-side truncation.

## Specialist Sequence

- [done] 06 Debug Investigation: identified the Next.js RSC literal and isolated the missing hosted Flight evidence.
- [done] 02 Security & Auth: preserved auth, redirect, cookie, and telemetry boundaries.
- [done] 03 Next.js Runtime: classified the blank PPR shell and approved the focused runtime-safe containment.
- [done] 05 Validation Strategy: defined focused unit, scenario E2E, and hosted verification evidence.
- [done] 04 Implementation Agent: applied the approved client and fallback corrections.
- [in progress] Focused validation: local checks passed; hosted verification remains blocked pending deployment.

## Constraints

- Preserve server-side authorization and provider isolation.
- Do not record credentials, tokens, or cookie values in artifacts.
- Do not run ESLint because the documented agent-shell blocker remains active.
- Do not use raw Playwright for AuthJS sign-off; use the repository scenario runner or focused AuthJS package script when credentials/runtime are available.
- Track implementation and evidence in `constraints.md`, `implementation-plan.md`, and `validation-report.md`.
