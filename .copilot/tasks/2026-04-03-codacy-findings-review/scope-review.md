# Scope Review

## Scope Objective

- Separate the authoritative Codacy findings inventory into repository review areas before per-finding triage.
- Preserve the workflow priority order so runtime and security surfaces are reviewed ahead of tests, scripts, and local tooling.
- Record scope-tuning candidates without classifying individual findings as real risk or false positive yet.

## Findings Count By Code Area

Total findings from `.codacy/reports/codacy-findings-preview.json`: 103

| Code area                | Findings | Severity mix        | Scope note                                                                                                                    |
| ------------------------ | -------: | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Security/auth runtime    |       14 | 14 warning          | `src/security/**/*`, `src/modules/auth/**/*`, `src/modules/authorization/**/*`, `src/app/auth/**/*` excluding test-only files |
| Production/runtime code  |       21 | 2 error, 19 warning | `src/core/**/*`, `src/app/api/**/*`, `src/shared/**/*`, `src/features/**/*`, non-auth runtime modules                         |
| Tests / E2E              |       38 | 4 error, 34 warning | `e2e/**/*`, `tests/**/*`, `**/*.test.*`, `**/*.spec.*`, `**/*.mock.ts`                                                        |
| Scripts / CLI            |       29 | 2 error, 27 warning | `scripts/**/*`                                                                                                                |
| Local tooling / dev-only |        1 | 1 warning           | `.vscode/extensions-dev/**/*`                                                                                                 |

These buckets are mutually exclusive and sum to the authoritative 103 findings.

## Disproportionate Noise Sources

### Directories

- `scripts/`: 29 findings
- `e2e/`: 20 findings
- `src/security/rsc/`: 12 findings
- `src/shared/lib/`: 10 findings
- `src/core/logger/`: 6 findings

### Individual files

- `e2e/provisioning-runtime.spec.ts`: 9 findings
- `src/security/rsc/data-sanitizer.ts`: 8 findings
- `e2e/clerk-auth.ts`: 6 findings
- `scripts/codacy-analyze.mjs`: 5 findings
- `scripts/check-e2e-auth-env.mjs`: 4 findings
- `scripts/codacy-install.mjs`: 4 findings
- `scripts/e2e/load-env.mjs`: 4 findings
- `src/core/logger/edge.ts`: 4 findings
- `src/modules/auth/infrastructure/drizzle/DrizzleExternalIdentityMapper.db.test.ts`: 4 findings
- `src/security/rsc/data-sanitizer.mock.ts`: 4 findings
- `src/shared/lib/security/sanitize-log-context.ts`: 4 findings

## Recommended Codacy Scope Tuning Follow-Up

- Keep `src/security/**/*`, `src/core/**/*`, `src/modules/**/*`, `src/app/**/*`, and runtime-supporting `src/shared/lib/**/*` in the primary remediation queue. Repeated rule noise is not sufficient justification to exclude these paths.
- Move `.vscode/extensions-dev/**/*` out of the normal remediation queue or into a dev-only Codacy scope. The single finding there is not repository runtime code.
- Evaluate a separate review lane or lower default priority for `e2e/**/*`, `tests/**/*`, `**/*.test.*`, `**/*.spec.*`, and `**/*.mock.ts` after Security & Auth triage confirms whether any patterns escape test-only context.
- Evaluate path-scoping of `security/detect-non-literal-fs-filename` for `scripts/**/*` and `e2e/**/*` only if later triage confirms the repeated findings are limited to repository-owned resolved paths rather than user-derived filenames.
- Evaluate path-scoping of `@next/next/no-img-element` away from `tests/setup.tsx` if that rule continues to target JSX test harness code rather than production delivery code.

## Repository Review Priority Order

1. Security/auth runtime paths: `src/security/**/*`, `src/modules/auth/**/*`, `src/modules/authorization/**/*`, `src/app/auth/**/*` excluding test-only files.
2. Remaining production/runtime paths: `src/core/**/*`, `src/app/api/**/*`, `src/shared/lib/**/*`, `src/features/**/*`, and non-auth runtime modules.
3. Tests and E2E paths: `e2e/**/*`, `tests/**/*`, `**/*.test.*`, `**/*.spec.*`, `**/*.mock.ts`.
4. Scripts and CLI tooling: `scripts/**/*`.
5. Local tooling and editor/dev-only paths: `.vscode/extensions-dev/**/*`.

## Deferred In This Step

- No per-finding real-risk or false-positive classification was performed beyond area separation.
- No rule keep/disable decision was finalized beyond identifying scope-tuning candidates.
- No code changes or suppressions were proposed in this step.
