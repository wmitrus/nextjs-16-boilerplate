# Intake

## Request

Find the root cause of the Playwright E2E startup failure:

- Failure point: `e2e/global.setup.ts`
- Error: `Failed to fetch testing token from Clerk API.`
- Immediate stack: `await clerkSetup()`

## Known Evidence

- `playwright.config.ts` always points `globalSetup` to `e2e/global.setup.ts`.
- `e2e/global.setup.ts` always calls `ensureClerkTestingEnv()` and then `clerkSetup()`.
- `package.json` contains both Clerk and AuthJS E2E scripts.

## Readiness Checklist

- [done] Required repository instructions reviewed.
- [done] Relevant E2E bootstrap files identified.
- [done] Scenario runner/provider branch confirmed.
- [done] Root-cause hypothesis confirmed or falsified.
- [done] Validation recommendation recorded.

## Outcome

- Confirmed active provider path for default scenario runs: Clerk (`scripts/e2e/env/base.env`).
- Confirmed failure point: `@clerk/testing` backend token creation, not missing env presence.
- Confirmed likely operator/root cause class: invalid, mismatched, or non-E2E-ready Clerk secret key / instance configuration.

## Constraints

- Repository code is the source of truth.
- Use focused, behavior-level evidence over broad speculation.
- Do not claim runtime command output that could not be executed in-session.
