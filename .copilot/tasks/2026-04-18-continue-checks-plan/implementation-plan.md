# Implementation Plan

## Rollout Strategy

### Phase 1: High-Signal Initial Rules

- [x] Add `.continue/rules/architecture-boundaries.md`
- [x] Add `.continue/rules/auth-flow-safety.md`
- [x] Add `.continue/rules/nextjs-runtime.md`
- [x] Add `.continue/rules/security-coding-patterns.md`
- [x] Add `.continue/rules/validation-and-tool-boundaries.md`

### Phase 1: Blocking Checks

- [x] Add `.continue/checks/connection-before-di.md`
- [x] Add `.continue/checks/rate-limit-path-propagation.md`
- [x] Add `.continue/checks/redirect-sanitization.md`
- [x] Add `.continue/checks/auth-flow-change-review.md`

### Phase 1: Local Trial

- [x] Run each check against at least one representative diff
- [x] Confirm early-exit behavior on unrelated diffs
- [x] Adjust prompt wording for false positives before CI rollout

## Current Implementation Status

- Phase 1 rule files implemented.
- First phase 1 check implemented: `auth-flow-change-review.md`.
- Second phase 1 check implemented: `connection-before-di.md`.
- Third phase 1 check implemented: `redirect-sanitization.md`.
- Fourth phase 1 check implemented: `rate-limit-path-propagation.md`.
- Local refinement result for `auth-flow-change-review.md`:
  - unrelated diff in `src/shared/lib/api/*` correctly early-exits
  - auth-adjacent copy/error-message diff in `src/app/auth/bootstrap/bootstrap-error.tsx` exposed prompt noise
  - prompt refined so auth-scoped copy, styling, test-only, and non-routing error-presentation changes no longer trigger full auth-flow review unless they change redirects, cookies, guards, provisioning, or provider/layout boundaries
- `connection-before-di.md` is intentionally narrower than a raw `getAppContainer()` grep:
  - it only targets async App Router render paths under `src/app/**`
  - it excludes plain server actions unless the diff moves DI bootstrap into a render path
  - it accepts explicit `connection()`, `headers()`, `cookies()`, or awaited server `searchParams` access as request-time opt-in evidence
- `redirect-sanitization.md` is intentionally trust-boundary-oriented rather than path-only:
  - it triggers only when changed lines read request-controlled redirect input or forward redirect params
  - it requires `sanitizeRedirectUrl()` at the read site, matching local `SEC-03`
  - it explicitly allows forwarding values already derived from `sanitizeRedirectUrl(...)` and fixed literal redirect targets
- `rate-limit-path-propagation.md` is intentionally request-context-oriented rather than helper-oriented:
  - it triggers only for changed request-aware `checkRateLimit(...)` call sites
  - it requires `{ path: pathname }` or equivalent local request-derived path propagation
  - it explicitly ignores helper internals, tests, and mocks unless the production diff introduces a new request-aware call pattern
- Phase 1 local trial is now complete:
  - low-signal auth copy diff stayed quiet after auth-flow refinement
  - auth redirect sanitization diff matched both the auth-flow and SEC-03 prompts correctly
  - `/users` onboarding-routing diff matched the auth-flow prompt correctly
  - request-time runtime fix diff matched `connection-before-di.md`
  - SEC-17 rate-limit fix diff matched `rate-limit-path-propagation.md`
- Next phase can move to CI integration planning rather than more blind prompt shaping.

### Phase 2: Optional Expansion

- [ ] Evaluate `.continue/checks/dependency-and-overrides-review.md`
- [ ] Evaluate `.continue/checks/docs-and-config-drift.md`
- [ ] Reassess whether any advisory check should become blocking

### Phase 3: CI Integration

- [ ] Choose the CI integration pattern
- [ ] Add workflow with artifact retention and stale-run cancellation
- [ ] Document local iteration workflow for check refinement

## Proposed Rule Files

### `.continue/rules/architecture-boundaries.md`

- Purpose: teach Continue the modular-monolith boundaries, ownership rules, and when not to move logic into `src/shared/*` or delivery/UI layers.
- Sources:
  - `AGENTS.md`
  - `scripts/architecture-lint.sh`
  - `docs/ai/general/ARCHITECTURE_LINT_RULES.md`
- Why rule not check: deterministic tools already own most import-direction and dependency-graph enforcement.

### `.continue/rules/auth-flow-safety.md`

- Purpose: preload auth/bootstrap/onboarding constraints, trusted boundaries, and matrix-driven review expectations.
- Sources:
  - `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
  - `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
  - `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- Why rule not check: this is shared context needed by multiple auth-sensitive checks.

### `.continue/rules/nextjs-runtime.md`

- Purpose: preload App Router, `cacheComponents`, `connection()`, Edge-vs-Node, and request-time rendering constraints.
- Sources:
  - `AGENTS.md`
  - `src/proxy.ts`
- Why rule not check: runtime principles are cross-cutting context used by narrow checks.

### `.continue/rules/security-coding-patterns.md`

- Purpose: expose the local SEC patterns that matter repeatedly in review.
- Sources:
  - `docs/ai/general/SECURITY_CODING_PATTERNS.md`
- Why rule not check: the patterns are reusable standards, not one blocking concern.

### `.continue/rules/validation-and-tool-boundaries.md`

- Purpose: teach Continue what not to flag because ESLint, TypeScript, tests, audit, depcheck, or architecture-lint already own it.
- Sources:
  - `AGENTS.md`
  - `eslint.config.mjs`
  - `scripts/architecture-lint.sh`
- Why rule not check: this file exists to reduce false positives and duplicated enforcement.

## Proposed Check Files With Severity

### `.continue/checks/connection-before-di.md`

- Severity: `critical`
- Purpose: flag async App Router pages, layouts, or route handlers that call `getAppContainer()`-style request DI/bootstrap before `await connection()`.
- Repository basis:
  - `AGENTS.md` explicitly documents `connection()` before `getAppContainer()` as a hard Next.js 16 rule.
- Early exit:
  - if the PR does not touch `src/app/**/{page,layout,route}.ts*`, no action
  - if changed files do not call `getAppContainer()`, no action
- Why Continue:
  - this is a multi-file runtime judgment problem with a documented repo-specific failure mode, not just syntax.
- Failure impact:
  - can produce hard prerender/runtime errors and unstable HMR/build behavior.

### `.continue/checks/rate-limit-path-propagation.md`

- Severity: `critical`
- Purpose: flag any new or modified `checkRateLimit()` call sites that fail to propagate `meta.path`.
- Repository basis:
  - `AGENTS.md` documents SEC-17 and the infinite edge-log recursion failure mode.
- Early exit:
  - if the PR does not touch rate-limit code paths or `checkRateLimit(` call sites, no action
- Why Continue:
  - this is a narrow, repo-specific operational hazard that static tools will not infer reliably.
- Failure impact:
  - can create recursive log floods and degrade internal logging endpoints under timeout conditions.

### `.continue/checks/redirect-sanitization.md`

- Severity: `high`
- Purpose: flag new redirect flows that forward raw `redirect_url`-style query params without `sanitizeRedirectUrl()` or equivalent allowlisting.
- Repository basis:
  - `src/security/middleware/with-auth.ts`
  - `docs/ai/general/SECURITY_CODING_PATTERNS.md` SEC-03
- Early exit:
  - if no redirect construction or redirect query forwarding changed, no action
- Why Continue:
  - the issue requires reading request parsing plus downstream redirect construction together.
- Failure impact:
  - open-redirect style regressions or incorrect auth-route bounce behavior.

### `.continue/checks/auth-flow-change-review.md`

- Severity: `critical`
- Purpose: review PRs touching Clerk/bootstrap/onboarding/auth middleware against the local anti-pattern catalogue and verification matrix, and fail when required scenarios or enforcement points are missing.
- Repository basis:
  - `src/proxy.ts`
  - `src/security/middleware/with-auth.ts`
  - auth-flow docs under `docs/ai/general/`
- Early exit:
  - if the PR does not touch auth/bootstrap/onboarding/private-route access surfaces, no action
- Why Continue:
  - this repo has rich, repo-specific auth-flow constraints that are too contextual for static lint alone.
- Failure impact:
  - auth regressions, bad redirect loops, or broken protected-route behavior.

### Deferred `.continue/checks/dependency-and-overrides-review.md`

- Severity: `medium`
- Purpose: review dependency additions/bumps and override changes for rationale, dynamic-usage awareness, and stale override cargo-culting.
- Why deferred:
  - valuable, but less safety-critical than auth/runtime issues and more likely to drift into policy discussion.

### Deferred `.continue/checks/docs-and-config-drift.md`

- Severity: `low`
- Purpose: flag public config or workflow changes that likely require doc updates.
- Why deferred:
  - useful after the core checks settle, but lower severity and easier to over-trigger.

## Explicitly Rejected As Continue Checks For V1

- generic `security-review.md`
  - rejected because the repository already uses Codacy, ESLint security rules, audit, and strong documented SEC patterns
- generic `test-coverage.md`
  - rejected because tests and validation already have strong deterministic ownership here
- architecture boundary check
  - rejected because `scripts/architecture-lint.sh`, `skott`, `madge`, and import restrictions already carry most of the deterministic load
- browser-render verification check
  - rejected because real browser validation should remain in Playwright rather than a probabilistic AI check
- client/server import hygiene check
  - rejected for v1 because `eslint.config.mjs` already restricts key logger import mistakes in relevant file sets

## CI / Operating Notes

- Start with a single-runner setup and stale-run cancellation.
- Save full check outputs as artifacts for prompt tuning.
- Run deterministic checks first; Continue checks should see a cleaner diff state.
- Review false positives weekly and prune aggressively if acceptance rate is weak.
