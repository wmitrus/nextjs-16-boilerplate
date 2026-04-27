# Intake

## Objective

Design a professional, repository-specific Continue PR review setup for this Next.js 16 modular-monolith boilerplate before any implementation begins.

## User Requirements

- deliver a full plan first
- tailor the design to this repository rather than generic Continue examples
- evaluate each proposed check file using severity terminology
- avoid regressions and low-value noise
- distinguish what should remain in Codacy/lint/tests/CI versus what belongs in Continue

## Scope

- propose the `.continue/rules/*.md` set
- propose the `.continue/checks/*.md` set
- assign severity to each proposed check file
- define phased rollout order
- define anti-noise guidance and ownership boundaries

## Non-Goals

- do not rewrite existing ESLint, test, or Codacy configuration in this task
- do not widen the phase 1 check set beyond the approved four blocking checks

## Acceptance Criteria

- the plan names concrete Continue rule files
- the plan names concrete Continue check files
- each proposed check file has a severity level and rationale
- the plan explains why each check is worth Continue rather than deterministic tooling
- the rollout is phased and cost-aware
- deferred or rejected checks are explicitly called out

## Source Inputs

- Official Continue docs and examples:
  - checks reference/spec
  - rules/codebase-awareness docs
  - plan mode docs
  - CI workflow guidance
  - `continuedev/checks` examples
- Repository code and constraints:
  - `AGENTS.md`
  - `eslint.config.mjs`
  - `scripts/architecture-lint.sh`
  - `src/proxy.ts`
  - `src/security/middleware/with-auth.ts`
  - docs under `docs/ai/general/`

## Repository Facts Relevant To This Plan

- middleware-equivalent logic lives in `src/proxy.ts`
- `cacheComponents: true` means route-segment runtime exports are banned
- request-time dynamic opt-in must use `await connection()`
- auth/bootstrap/onboarding flows are high-risk and already documented in dedicated anti-pattern and matrix docs
- deterministic tooling is already strong: ESLint, TypeScript, Vitest, Playwright, depcheck, audit, skott, madge, architecture-lint shell script

## Readiness Checklist

- [x] Continue docs/examples reviewed
- [x] repo hotspots reviewed
- [x] existing deterministic gates reviewed
- [x] candidate checks narrowed to project-specific high-signal concerns
- [x] initial rollout recommendation drafted
- [x] implementation approved by user

## Open Questions

- whether the eventual CI runtime should use Continue-native infrastructure only or a custom workflow wrapper
- whether the team wants blocking checks only, or a mix of blocking and advisory checks
- whether auth-flow checks should link directly to matrix scenario IDs in their prompt bodies

## Approval Addendum

- 2026-04-19: user approved moving past planning/local trial into CI workflow wiring (`"ok dodaj"`)
- chosen rollout shape: repo-local GitHub Actions workflow using `cn check` against `.continue/checks/`, with artifact retention and stale-run cancellation
