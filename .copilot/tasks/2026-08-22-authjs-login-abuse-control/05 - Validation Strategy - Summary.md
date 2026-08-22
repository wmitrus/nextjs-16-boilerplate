# 05 - Validation Strategy - Summary

## Task Context

- Task ID: `2026-08-22-authjs-login-abuse-control`
- Task Objective: Decide the minimum validation that genuinely closes the login-abuse gap.
- Current Run Scope: `login-abuse-control.ts`, `turnstile.ts`, `TurnstileWidget.tsx`, `route.ts`, `auth.ts`, `sign-in-client.tsx`.
- Mode: CHANGE VALIDATION
- Status: COMPLETED
- Last Updated: 2026-08-22
- Related Control Artifacts: `02 - Security & Auth - Summary.md`, `04 - Implementation Agent - Summary.md`

## Scope Handled

- change surfaces assessed: two new server-only modules, one new client component, one rewritten route handler, one rewritten `authorize()`, one updated sign-in form
- validation questions in scope: what layer must prove the fix actually throttles/escalates; whether real Cloudflare Turnstile credentials are required to call this closed
- excluded validation areas: any other password-verification endpoint (none exist elsewhere in this repo today)

## Inputs Reviewed

- code paths reviewed: as listed in `04 - Implementation Agent - Summary.md`
- tests / configs / workflows reviewed: existing `rate-limit*.test.ts` conventions, `auth.test.ts`'s `getAuthorize()` module-reset pattern, `sign-in-client.test.tsx`'s existing error-message test conventions
- earlier task artifacts reviewed: Cases 1–2's Validation Strategy summaries for this series' established validation depth

## Actions Performed

- validation posture review performed: the defect lives in pure logic (threshold math, ordering, bucket independence) plus a small number of well-defined integration seams (Redis client, Cloudflare's `siteverify` HTTP endpoint, `window.turnstile`'s script API) — each seam is mockable with high fidelity, so direct unit tests against real code paths (not against a mock of the function under test) are the strongest available proof without live third-party credentials.
- risk analysis performed: the two highest-value proofs are (a) that a locked/captcha-blocked account genuinely never reaches the DB/bcrypt call, and (b) that the two buckets (IP, account) are genuinely independent — both directly assertable without any external service.
- test-level recommendations prepared: see below.
- command recommendations prepared: see below.

## Current-State Findings

- Confirmed: no real Cloudflare Turnstile account/keys are available in this session — `verifyTurnstileToken()` is tested against a mocked `fetch`, and `TurnstileWidget` is tested against a mocked `window.turnstile` (the real script never loads in a unit/jsdom environment). This is standard practice for third-party API integrations in this repo (comparable to how Clerk/Sentry/other provider SDKs are tested) and is not treated as a validation gap for the abuse-control logic itself, but it does mean the CAPTCHA layer's real end-to-end behavior (does Cloudflare's actual widget render/verify correctly against a real site key) has not been observed in this session.
- Risks: none remaining for the rate-limiting/lockout logic itself. The CAPTCHA-specific residual risk (real-provider verification) is explicitly named in `plan.md`, not hidden.
- Drift: none.

## Validation-Risk Assessment

- primary risks: (a) a locked account's request still reaching bcrypt (defeats the CPU-amplification defense) — mitigated by asserting `mockSelect`/DB mocks are never called for a locked/captcha-blocked attempt; (b) the two buckets not being truly independent — mitigated by dedicated cross-bucket-independence tests in both `login-abuse-control.test.ts` (different account keys) and `route.test.ts` (different IPs); (c) `E2E_ENABLED` failing to bypass one of the two buckets, silently breaking this repo's AuthJS E2E fixture reuse — mitigated by explicit bypass tests for both.
- confidence gaps: real Cloudflare Turnstile round-trip behavior (network shape, real token format, real Managed-mode UX) — acceptable gap given the CAPTCHA gate itself is designed to fail closed and be independently disable-able; not a gap in the actual access-control guarantee this fix provides.
- over-validation or under-validation concerns: did not add a dedicated Playwright E2E spec for the CAPTCHA flow — the unit-level proof (mocked `window.turnstile`, mocked `fetch`) already exercises every branch of the client/server wiring; a real-browser spec would mostly re-prove the same wiring against a live third-party service, which is better validated once real keys exist (see `plan.md`).

## Recommended Validation Scope

- minimum required validation:
  - `pnpm typecheck`
  - `pnpm lint --fix`
  - `pnpm test` (all new/updated unit test files)
  - `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check`
- optional additional validation: a real-browser smoke check once the user provisions real Turnstile keys (Turnstile's official always-pass test keys are sufficient for a first pass without needing production credentials) — not implemented in this session, no credentials available.
- validation explicitly not required: `pnpm test:db` (no DB-layer code changed in this case).

## Validation Commands / Checks

- commands to run: `pnpm typecheck`, `pnpm lint --fix`, `pnpm test`, `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check` — all run in this session (see `plan.md` for exact results).
- environment prerequisites: none beyond what Cases 1–2 already established (`pnpm install`, in-memory PGlite for DB tests, not needed here).
- expected evidence: all commands exit 0; `pnpm test` output includes the new/updated test files (`login-abuse-control.test.ts`, `turnstile.test.ts`, `TurnstileWidget.test.tsx`, `route.test.ts` for `[...nextauth]`, and the SEC-34 additions to `auth.test.ts` and `sign-in-client.test.tsx`).

## Artifact Synchronization

- `plan.md` updates: validation step marked complete; gate results table populated.
- `intake.md` updates: none required.
- `implementation-plan.md` updates: not used for this workflow.
- specialist artifact updates: none beyond this file.

## Open Questions / Blockers

- unresolved questions: whether/when the user will provision real Turnstile keys for an end-to-end smoke check.
- blockers: none for closing this task; a real-provider check is a separate, later confirmation step.
- dependencies on architecture / security / runtime decisions: none outstanding.

## Handoff Notes

- what the next agent should rely on: the gate results in `plan.md` are current and complete for this change.
- what should not be re-decided without new evidence: the decision that mocked-provider unit tests are sufficient to close this task, with real-provider verification tracked as a separate, explicit follow-up rather than blocking this fix.
- recommended next specialist or step: Implementation (already run); this task is otherwise ready for the user's PR/CI step.

## Update Log

### Update Entry

- Date: 2026-08-22
- Trigger: Validation-scope decision ahead of implementation sign-off.
- Summary of change: Decided unit-level, real-code-path tests (mocked Redis/Cloudflare/Turnstile-script integration seams) are the minimum required and sufficient validation for the abuse-control logic; documented the real-provider verification gap explicitly rather than treating it as closed.
- Sections refreshed: all.
