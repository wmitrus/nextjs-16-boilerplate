# Remediation Plan

## Outcome

- This run moved from review-only planning into focused implementation.
- The two runtime remediation workstreams covering the 3 latent findings were implemented.
- Production code, focused tests, and Codacy configuration were updated.
- Remaining follow-up is limited to Codacy-side verification that the new path exclusions are honored consistently in local and cloud-backed analysis.

## Priority 0: Must-Fix Runtime Items

### R-01. Harden bootstrap reason resolution on untrusted search params

- Priority: Must fix before treating the Codacy queue as fully remediated.
- Findings covered: 1 latent `security/detect-object-injection` warning.
- Affected file: `src/app/auth/bootstrap/page.tsx`.
- Problem: The current `reason in ERROR_BY_REASON` guard allows prototype-chain hits on an untrusted query-param key before `ERROR_BY_REASON[reason]` is read.
- Required remediation: Replace the current guard-and-index pattern with an own-key check plus bounded lookup, or switch to a `Map` or explicit `switch` over allowed bootstrap reasons.
- Preferred implementation shape: keep the mapping local to the bootstrap page, avoid widening the public API, and preserve the current user-facing fallback behavior.
- Focused validation expected after patch: bootstrap page render coverage for known reasons plus a negative case such as `toString` or another prototype property.
- Status in this run: Implemented in `src/app/auth/bootstrap/page.tsx` using `Object.hasOwn(...)` plus bounded lookup semantics. Added a focused negative test for inherited prototype keys in `src/app/auth/bootstrap/page.test.tsx`.

### R-02. Add sink-level confinement to the reusable logger directory helper

- Priority: Must fix before considering the logger fs-path findings closed.
- Findings covered: 2 latent `security/detect-non-literal-fs-filename` warnings at the helper's fs sinks.
- Affected file: `src/core/logger/utils.ts`.
- Problem: The helper currently accepts a dynamic `logDir` string and performs fs access without enforcing `path.resolve` plus base-directory confinement at the point of access.
- Required remediation: Resolve the final directory path inside the helper, assert it stays within the allowed log base directory, and fail closed before `fs.existsSync` and `fs.mkdirSync`.
- Preferred implementation shape: keep the guard inside the helper rather than relying on caller discipline, and use the repository's `SEC-16` sink-confinement model.
- Focused validation expected after patch: logger helper unit coverage for allowed repository-local paths and a rejection case for path traversal or out-of-base input.
- Status in this run: Implemented in `src/core/logger/utils.ts` with `path.resolve(...)` plus sink-level confinement and a new traversal-rejection test in `src/core/logger/utils.test.ts`.

## Priority 1: Rule-Scope Follow-Up

### F-01. Narrow `security/detect-object-injection` review scope without disabling runtime scrutiny

- Keep the rule active for runtime surfaces under `src/app`, `src/core`, `src/modules`, `src/security`, and runtime-supporting `src/shared/lib`.
- Demote or separate findings in `e2e`, `tests`, `*.test.*`, `*.spec.*`, `*.mock.*`, and most `scripts` paths where the current findings are bounded lookups, accumulator writes, or test scaffolding.
- Status in this run: Implemented in `.codacy.yml` by excluding `tests/**`, `e2e/**`, `scripts/**`, and `.vscode/**` from the current Codacy ESLint and Semgrep review scope.

### F-02. Narrow `security/detect-non-literal-fs-filename` to helper and operator boundaries

- Keep the rule active for reusable runtime helpers and operator-facing scripts that accept external paths.
- Demote findings in repository-owned env readers, E2E helpers, and already-confined script paths.
- Status in this run: Implemented in `.codacy.yml` with the same path narrowing used for broader high-noise scope reduction.

### F-03. Demote structurally low-signal non-runtime rules from the primary remediation queue

- `security/detect-unsafe-regex`: test-assertion-only noise in Playwright specs.
- `security/detect-child-process`: dev-only editor extension path.
- `@next/next/no-img-element`: test harness mock only.
- `prettier/prettier`: formatter drift already owned by repository linting.
- Status in this run: Implemented in `.codacy.yml` for test, E2E, script, and local-tooling paths that were dominating review volume.

### F-04. Security-doc propagation remains a follow-up, not part of this run

- Possible later Security & Auth doc updates remain the same as rule review identified: clarify the safe own-key accumulator pattern and reinforce helper-level fs confinement at the sink.
- This run builds on the already-completed `SEC-15` and `SEC-16` propagation.
- Status in this run: Already completed earlier in the workflow; no new propagation changes were required here.

## Priority 2: Maintenance Debt

### M-01. Tighten migration helper typing

- Findings covered: 2 `@typescript-eslint/no-explicit-any` errors in `src/core/db/migrations/run-migrations.ts`.
- Risk class: non-security type-safety debt.
- Status in this run: Deferred.

### M-02. Retain deprecated adapter compatibility coverage until removal window closes

- Findings covered: 4 `@typescript-eslint/no-deprecated` errors in `src/modules/auth/infrastructure/drizzle/DrizzleExternalIdentityMapper.db.test.ts`.
- Risk class: intentional compatibility coverage, not a runtime security issue.
- Status in this run: Deferred.

### M-03. Clean formatter drift when the Codacy helper script is next touched

- Findings covered: 2 `prettier/prettier` errors in `scripts/codacy-analyze.mjs`.
- Risk class: non-security formatting drift.
- Status in this run: Deferred.

## Code Change Decision

- Code changes applied: yes.
- Production files changed: `src/app/auth/bootstrap/page.tsx`, `src/core/logger/utils.ts`, `.codacy.yml`.
- Test files changed: `src/app/auth/bootstrap/page.test.tsx`, `src/core/logger/utils.test.ts`.
- Artifact files changed in this run: task remediation, validation, summary, and workflow-status artifacts.
- Reason: the user explicitly requested implementing the two deferred runtime fixes and making the Codacy scope decision now.

## Recommended Next Steps

1. Verify in Codacy cloud or the next local review run whether `.codacy.yml` exclusions are honored; the immediate local SARIF rescan still included excluded paths.
2. If excluded paths continue to appear, inspect `scripts/codacy-analyze.mjs` or Codacy cloud sync behavior rather than reopening the runtime code fixes.
