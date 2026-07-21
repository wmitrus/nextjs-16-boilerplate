# 05 - Validation Strategy - Summary

## Task Context

- Task ID: 2026-07-20-clerk-testing-token-root-cause
- Task Objective: Find the root cause of Clerk testing token fetch failure during E2E startup.
- Current Run Scope: Read-only analysis of Playwright bootstrap, auth-provider routing, and env gating.
- Mode: CHANGE VALIDATION
- Status: COMPLETED
- Last Updated: 2026-07-20
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- change surfaces assessed: E2E bootstrap and auth-provider-specific test setup
- validation questions in scope: whether Clerk setup runs only when Clerk is the active provider and whether current env selection can misconfigure Clerk testing token fetch
- excluded validation areas: app business logic unrelated to E2E bootstrap

## Inputs Reviewed

- code paths reviewed: `e2e/global.setup.ts`, `e2e/clerk-auth.ts`, `playwright.config.ts`
- tests / configs / workflows reviewed: `package.json`, auth-flow E2E guidance, validation strategy guidance
- earlier task artifacts reviewed: none

## Actions Performed

- validation posture review performed: yes
- risk analysis performed: yes
- test-level recommendations prepared: yes
- command recommendations prepared: yes

## Current-State Findings

- Confirmed: Playwright always invokes `e2e/global.setup.ts`; that file unconditionally calls `clerkSetup()`.
- Confirmed: the default scenario runner loads `scripts/e2e/env/base.env`, which sets `AUTH_PROVIDER=clerk` for normal E2E scenario runs.
- Confirmed: `@clerk/testing` fetches a testing token by calling Clerk Backend `testingTokens.createTestingToken()` with `CLERK_SECRET_KEY` when `CLERK_TESTING_TOKEN` is absent.
- Confirmed: the reported error means env presence checks already passed and the failure is now at Clerk backend token creation.
- Confirmed: a second failure mode remained after key recovery: `scripts/check-e2e-auth-env.mjs` only verified env presence, so missing Clerk fixture accounts such as `personalNewUser` were not caught until runtime sign-in.
- Risks: invalid, mismatched, or non-test-instance Clerk keys block the entire suite before any Playwright spec runs.
- Drift: none recorded in code; repository docs already describe this as a Clerk fixture / instance setup problem.

## Validation-Risk Assessment

- primary risks: key presence is treated as sufficient in `global.setup.ts`, but the real external dependency is a valid Clerk secret key that can mint testing tokens on the same Clerk test instance as the publishable key and fixtures.
- confidence gaps: the exact Clerk backend rejection reason cannot be observed in-session because command execution is unavailable.
- over-validation or under-validation concerns: broad suite reruns are unnecessary until the active Clerk key pair is verified against the intended test instance.

## Recommended Validation Scope

- minimum required validation: inspect the resolved `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `.env.e2e.local` / `.env.e2e` / `.env.local`, confirm they belong to the same Clerk test instance, and rerun the focused env validator plus one Clerk-backed E2E entrypoint.
- optional additional validation: set `CLERK_TESTING_TOKEN` explicitly if available to bypass backend token minting and isolate whether the failure is key-minting-specific.
- validation explicitly not required: AuthJS-focused commands, full matrix reruns, or DB troubleshooting before Clerk instance/key validation.

## Follow-Up Fix Applied

- `scripts/check-e2e-auth-env.mjs` now validates that required Clerk fixture users for the selected scenario actually exist in the configured Clerk instance by querying Clerk Backend before Playwright starts.
- `scripts/check-e2e-auth-env.test.ts` now covers the missing-fixture case and the non-email skip path.
- `scripts/e2e-clerk-fixtures.md` now documents that the preflight also verifies user existence, not just env presence.
- `e2e/clerk-auth.ts` now automatically creates or repairs mutable standalone Clerk fixtures before browser sign-in for `singleNewUser`, `singleProvisionedUser`, `incompleteUser`, `personalNewUser`, and `orgDbSeededMember`.
- `scripts/check-e2e-auth-env.mjs` now downgrades missing mutable standalone fixtures to warnings because the runtime helper reconciles them automatically.

## Validation Commands / Checks

- commands to run: `node scripts/check-e2e-auth-env.mjs --scenario single`; inspect `.env.e2e.local` for Clerk keys; rerun `pnpm e2e:auth` or `node scripts/e2e/run-scenario.mjs single -- e2e/auth.spec.ts --project=chromium --reporter=line`
- environment prerequisites: Clerk test instance with email+password enabled, no extra Client Trust / MFA challenge for dedicated E2E password fixtures, matching secret/publishable key pair, required E2E fixture users configured
- expected evidence: env validator passes; Clerk testing token fetch succeeds; Playwright proceeds beyond global setup into spec execution

## Artifact Synchronization

- `plan.md` updates: created and initialized
- `intake.md` updates: created and initialized
- `implementation-plan.md` updates: not applicable yet
- specialist artifact updates: created this summary artifact

## Open Questions / Blockers

- unresolved questions: the exact Clerk API rejection payload remains unknown in-session
- blockers: command execution tool unavailable in this session
- dependencies on architecture / security / runtime decisions: none yet

## Handoff Notes

- what the next agent should rely on: default scenario runs are intentionally Clerk-backed; `clerkSetup()` fails only after reaching Clerk backend token creation.
- what should not be re-decided without new evidence: this is not caused by DB reset output and not primarily by missing env presence checks.
- recommended next specialist or step: operator checks resolved Clerk key pair and test-instance settings, then reruns the focused Clerk E2E entrypoint.

## Update Log

### Update Entry

- Date: 2026-07-20
- Trigger: runtime fixture hardening
- Summary of change: added automatic Clerk fixture reconciliation for mutable standalone identities and aligned preflight from hard failure to warning for those identities
- Sections refreshed: Follow-Up Fix Applied, Update Log
