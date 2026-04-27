# Continue Checks Plan

## Task Context

- Task ID: `2026-04-18-continue-checks-plan`
- Objective: design and implement a repository-specific Continue checks and rules rollout for PR review, with per-check severity, phased rollout, and clear separation from deterministic tooling.
- Status: COMPLETED
- Scope: phase 1 rules/check implementation plus repo-local CI workflow wiring and local iteration documentation.

## Progress Checklist

- [x] Gather official Continue checks/rules/CI guidance.
- [x] Inspect repository guardrails, hotspots, and deterministic quality gates.
- [x] Identify which concerns belong in Continue checks versus lint/tests/CI scripts.
- [x] Define proposed `.continue/rules/*.md` set.
- [x] Define proposed `.continue/checks/*.md` set with severity.
- [x] Define phased rollout and anti-noise constraints.
- [x] Implement `.continue/rules/*.md`.
- [x] Implement `.continue/checks/*.md`.
- [x] Add or adapt CI workflow for Continue checks.
- [x] Trial-run checks locally on representative diffs.

## Likely Affected Areas

- Continue configuration surface: `.continue/rules/`, `.continue/checks/`
- PR workflow surface: `.github/workflows/`
- Agent guidance surface: `AGENTS.md` or a Continue-specific operating note if later needed
- Existing repo guardrails used as sources of truth:
  - `AGENTS.md`
  - `eslint.config.mjs`
  - `scripts/architecture-lint.sh`
  - `src/proxy.ts`
  - `src/security/middleware/with-auth.ts`
  - `docs/ai/general/SECURITY_CODING_PATTERNS.md`
  - `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
  - `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
  - `docs/ai/general/ARCHITECTURE_LINT_RULES.md`

## Expected Specialist Sequence

- Architecture Guard: completed for planning-level boundary fit
- Security & Auth: completed for auth/trust-boundary relevance
- Next.js Runtime: completed for App Router and `connection()` constraints
- Validation Strategy: completed for check-vs-tool separation and rollout scope
- Implementation Agent: completed for phase 1 rollout plus CI workflow wiring

## Known Risks / Unknowns

- Continue checks are probabilistic and can become noisy if they duplicate deterministic gates.
- CI cost and latency rise quickly if too many checks are introduced in v1.
- Some high-value concerns are better encoded as rules or human-review context than as blocking checks.
- Browser verification remains better as Playwright/E2E than as an AI check in this repository.

## Artifact List

- `plan.md`
- `intake.md`
- `constraints.md`
- `implementation-plan.md`
- `01 - Architecture Guard - Summary.md`
- `02 - Security & Auth - Summary.md`
- `03 - Next.js Runtime - Summary.md`
- `05 - Validation Strategy - Summary.md`
- `04 - Implementation Agent - Summary.md`

## Current Recommendation Snapshot

- Start with 5 Continue rules for codebase awareness.
- Start with 4 blocking Continue checks in phase 1.
- Defer architecture-boundary, browser, and generic test-coverage checks because deterministic tooling already owns most of that signal here.
- Keep auth/bootstrap/runtime checks narrow and early-exit aggressively.
- Phase 1 rules are now implemented.
- All 4 phase 1 blocking checks are now implemented: `auth-flow-change-review.md`, `connection-before-di.md`, `redirect-sanitization.md`, and `rate-limit-path-propagation.md`.
- Local representative-diff trial is complete for all 4 phase 1 checks.
- CI integration is now implemented through `.github/workflows/continue-checks.yml` using `cn review --format json`, stale-run cancellation, and artifact retention for prompt tuning.
- Local iteration workflow is now documented in `README.md`.
