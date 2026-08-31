# 04 - Implementation Agent - Summary

## Task Context

- Task ID: `OZI-78`
- Current run scope: Gate A, Slice A1 coordinator review corrections only
- Status: completed locally; no commit, push, or remote operation performed
- Last updated: 2026-08-30
- Control artifact: `plan.md`

## Changes

- Canonical AuthJS provisioning now selects an owner-backed default-tenant
  organization using a stable organization/role ordering.
- The optional containment fixture inserts only A2. It reuses seeded Globex HQ
  as B1 and proves the returned A1/A2/B1 topology before responding.
- Fixture mutation refuses every database target except local PostgreSQL on
  `127.0.0.1:5433/app_test` (including `localhost` and `[::1]` host aliases),
  and refuses Vercel Preview and Production.
- The platform E2E user now provisions normally after the normal user creates
  the fixture.
- Containment helpers are isolated in a server-only sibling module so the
  Next.js route module exports only `POST`; IPv6 loopback is accepted as
  `[::1]`.
- Ordinary AuthJS provisioning continues to return only `{ success: true }`.
- The containment browser scenario now runs normal-admin and platform-admin
  assertions as two serial tests, so each remains within the standard test
  timeout while preserving a proven shared topology.

## Validation

- Focused route and step-up static tests: 34 passed.
- `pnpm lint --fix`: passed.
- `pnpm exec next typegen`: passed.
- `pnpm typecheck`: passed.
- Local AuthJS container Playwright containment scenario: passed; its setup
  explicitly skipped Clerk identities and reset only `app_test`.

## Scope and Safety

- No Clerk API, Neon, Vercel, Preview, production, Linear update, commit, or
  push was used.
- Existing A1/A2/B1 application-boundary assertions remain intact.
# OZI-78 — Implementation Summary

## A4.2a Controlled Remote Candidate DETAIL Read

- Added a rollback-assessment-local adapter for the sole authorized provider
  operation: `vercel api /v13/deployments/<nominated-id> --method=GET --raw`.
- Default `pnpm rollback:assess -- --deployment-id=<id>` remains local-only;
  it does not read anchors, invoke Vercel, or make a network call.
- Remote access requires the one-time explicit
  `--execute-remote-candidate-read` flag. Duplicate flags and malformed IDs
  fail before the provider subprocess.
- The adapter checks local expected identity anchors and local Vercel project
  linkage, bounds stdout, suppresses provider stderr, parses JSON as untrusted,
  and delegates all deployment acceptance to `assertProductionDeployment()`.
- A successful remote identity proof permits only the existing local Git
  ancestry check. No Git fetch/GitHub fallback, environment read, DB access,
  smoke, promotion, rollback, or traffic change was added.
- REMOTE_READ evidence provenance is structurally unforgeable: the exported
  `buildLocalRollbackAssessment()` has no provenance parameter in its type at
  all, so it can never produce `READ_AND_VALIDATED`; only a private helper
  used exclusively by `run()` after it has actually executed
  `readRemoteCandidateDetail()` may establish that provenance.
- The single Vercel DETAIL subprocess now also carries an explicit 15s
  timeout alongside the existing 128 KiB bounded output, with no retries.

## PR #89 Full Review Corrective Pass

- Removed `run()`'s caller-controlled dependency bag (`vercelExecutor`,
  `readExpectedIdentity`, `gitExecutor`). `run()` is now
  `run(argv = process.argv)` only, structurally bound to the real
  `readExpectedProductionIdentity()`, `readRemoteCandidateDetail()`, and
  local ancestry implementations — no importing module can inject a fake
  Vercel executor to fabricate `READ_AND_VALIDATED` provenance. CLI tests use
  a Vitest module mock of `./remote-candidate` instead.
- `src/app/api/internal/preview-canary/database-binding/route.ts` now also
  requires a non-empty `URL#hostname` after the protocol check, so
  `postgresql:///db` fails closed to the existing bounded 500
  `{"error":"Unavailable"}` instead of returning 200 with `databaseHost: ''`.
- `gitRefSchema` gained the remaining Git branch/ref-format predicates:
  no path component may start with `.` or end with `.lock`, the value may
  not be exactly `@`, and a branch name may not start with `-`. The existing
  character-class exclusions (control chars, whitespace, `~^:?*\[`, no
  trailing `]` restriction) were preserved unchanged.
- `src/app/api/internal/e2e/authjs-user/containment-fixture.ts` (`[::1]`) and
  the `gitRefSchema` character class were confirmed correct and left
  untouched; `scripts/git/full-diff.sh` (user-owned) was not modified.

A4.2a remains implemented and locally validated only — no remote Vercel
operation has been performed against Preview or Production. Full A4 is not
complete.

## Validation

- Focused rollback-assessment Vitest suite: 85 tests passed.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check` passed.
- No remote Vercel operation was run during implementation.
