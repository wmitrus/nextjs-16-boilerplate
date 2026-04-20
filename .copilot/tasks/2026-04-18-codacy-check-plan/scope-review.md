# Codacy Scope Review

## Source Artifact

- `.codacy/reports/codacy-findings.json`

## Remaining Findings By Area

- `src`: 45 findings
  - `security/detect-object-injection`: 43
  - `security/detect-non-literal-fs-filename`: 2
- `scripts`: 46 findings
  - `security/detect-non-literal-fs-filename`: 25
  - `security/detect-object-injection`: 21
- `e2e`: 20 findings
  - `security/detect-unsafe-regex`: 8
  - `security/detect-object-injection`: 7
  - `security/detect-non-literal-fs-filename`: 5
- `.vscode`: 1 finding
  - `security/detect-child-process`: 1
- `tests`: 1 finding
  - `@next/next/no-img-element`: 1

## Scope Classification

### Production Runtime

- `src/security/rsc/data-sanitizer.ts`
- `src/shared/lib/security/sanitize-log-context.ts`
- `src/core/logger/edge.ts`
- `src/shared/lib/api/with-action-handler.ts`
- `src/shared/lib/api/with-error-handler.ts`
- `src/core/logger/utils.ts`

Assessment:

- Most remaining `src` findings are scanner noise around safe dynamic object access patterns that already use one or more of:
  - `Object.entries()` / `Object.keys()` on own properties only
  - `Object.create(null)` accumulators
  - finite typed unions (`Record<Level, ...>`, env enums)
  - sink-side path confinement (`assertPathWithinBase()`)
- These findings have low immediate security impact and should not be treated as equivalent to exploitable injection or path traversal.

### Scripts / CLI Tooling

- `scripts/leantime/*`
- `scripts/codacy-analyze.mjs`
- `scripts/check-e2e-auth-env.mjs`
- `scripts/load-env-files.ts`

Assessment:

- Dominated by local wrapper code that validates env names, constrains remote paths, or resolves repository-owned files.
- Mostly low-signal findings for local/dev tooling, not production runtime security defects.

### E2E / Test Infrastructure

- `e2e/clerk-auth.ts`
- `e2e/global.setup.ts`
- `e2e/runtime-profile.ts`
- `e2e/provisioning-runtime.spec.ts`
- `tests/setup.tsx`

Assessment:

- Mostly test-only noise.
- `unsafe-regex` findings come from URL assertions like `/\/onboarding(?:\?.*)?$/`, which are not a meaningful production ReDoS surface.
- `non-literal-fs-filename` findings in E2E setup match the repository's existing SEC-05 false-positive class.

### Local Editor Tooling

- `.vscode/extensions-dev/parent-branch-status/parent-branch-status.js`

Assessment:

- Entirely out-of-scope for product security remediation.
- Should be excluded from Codacy review scope rather than fixed in product remediation work.

## Scope Recommendations

- Exclude `.vscode/extensions-dev/**` from Codacy remediation scope.
- Exclude `tests/setup.tsx` from Codacy remediation scope for this task.
- Treat `e2e/**` findings as low-priority unless a regex or file path pattern is demonstrably unsafe beyond test-only usage.
- Keep `src/**` in scope, but classify remaining findings via pattern review rather than raw count.
- Keep `scripts/**` in a separate low-priority queue; do not mix with production runtime security decisions.
