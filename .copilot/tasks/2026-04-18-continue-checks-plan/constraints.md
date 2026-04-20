# Constraints

## Design Constraints

- Continue checks must complement, not duplicate, deterministic gates.
- Each check must cover one concern only.
- Every check must have an early-exit condition tied to changed files or changed patterns.
- Phase 1 should stay within 3-5 checks.
- Auth/bootstrap/onboarding checks must anchor to repository docs, not generic security language.
- Runtime checks must respect Next.js 16 `cacheComponents` constraints and request-time rendering rules.

## Anti-Noise Constraints

- Do not create a generic `security-review.md`; this repo already has strong static and documented security patterns.
- Do not create a generic `test-coverage.md`; this repo already enforces tests via deterministic commands and explicit validation strategy.
- Do not create a generic `documentation-freshness.md` in phase 1; docs drift exists, but the signal-to-noise ratio is lower than auth/runtime risks.
- Do not create a generic `migration-safety.md` unless database migration churn becomes a recurring PR issue.
- Do not create a Continue check for architecture boundary imports already enforced by `scripts/architecture-lint.sh`, `skott`, `madge`, or ESLint restrictions.

## Severity Model For This Task

- `critical`: missing this check can plausibly allow auth bypass, hard runtime failure, or a production incident on protected routing paths
- `high`: missing this check can introduce serious regressions or security-sensitive breakage, but usually with narrower blast radius
- `medium`: useful judgment signal with real value, but failure should not block the first rollout unless the team sees recurring problems
- `low`: informational or hygiene-oriented; defer until the first-wave checks prove low-noise

## Recommended Ownership Split

- Continue rules: provide repo-specific context and standards
- Continue checks: enforce narrow, high-value judgment calls on PR diffs
- ESLint/TypeScript/scripts: keep static, deterministic enforcement
- Vitest/Playwright: keep behavioral and browser correctness verification
- Codacy/audit/depcheck: keep dependency and security scanning where deterministic
