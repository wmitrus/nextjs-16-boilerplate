# Plan

- [done] Normalize task objective and current failure evidence.
- [done] Trace the E2E bootstrap control path from scenario runner to Playwright global setup.
- [done] Form one falsifiable root-cause hypothesis and one cheap disconfirming check.
- [done] Identify the minimum validation needed to confirm the root cause.
- [done] Report the root cause, evidence, and next safe action.

## Task Metadata

- Task ID: 2026-07-20-clerk-testing-token-root-cause
- Objective: Find the root cause of Clerk testing token fetch failure during E2E startup.
- Active mode: Change Validation
- Leantime status: Not executed in-session; command execution tool unavailable in this session.

## Confirmed Conclusion

- The default repository E2E scenario runner is Clerk-backed, not AuthJS-backed.
- `e2e/global.setup.ts` always calls `clerkSetup()`, and `@clerk/testing` then calls `testingTokens.createTestingToken()` using `CLERK_SECRET_KEY`.
- The observed failure therefore means the resolved `CLERK_SECRET_KEY` could not create a Clerk testing token for the active Clerk instance.
- This is a Clerk instance/key validity problem, not a DB reset problem and not a Playwright spec problem.

# Solution

After sign in into clerk it started to work.
