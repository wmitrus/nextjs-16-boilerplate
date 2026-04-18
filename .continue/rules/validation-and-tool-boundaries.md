# Validation And Tool Boundaries

Use Continue for semantic, repository-specific judgment calls. Do not duplicate deterministic tooling unless the PR is bypassing or weakening that tooling.

## Deterministic Owners In This Repository

- ESLint: static import restrictions, syntax-level anti-patterns, formatting, local security lint rules.
- TypeScript: type safety and many contract mistakes.
- Vitest: unit and integration behavior.
- Playwright: real browser and route-flow verification.
- `pnpm audit`: known vulnerability scanning.
- `depcheck`: unused dependency detection.
- `skott` and `madge`: dependency graph and cycle checks.
- `scripts/architecture-lint.sh`: repository boundary and runtime smell checks.

## Continue Should Focus On

- repo-specific auth-flow review
- request-time/runtime correctness that requires cross-file context
- subtle operational hazards such as missing `checkRateLimit(..., { path })`
- semantic drift against documented local guardrails

## Continue Should Usually Not Focus On

- generic test coverage opinions
- generic security review already covered by scanners and local SEC rules
- broad architecture lint already enforced by scripts and graph tools
- browser rendering checks already owned by Playwright

## Review Discipline

- If a deterministic tool would catch it reliably, prefer silence.
- If the issue is semantic and repo-specific, raise it with file-level evidence.
- If the changed code only touches docs, tests, or non-applicable config, early-exit.
