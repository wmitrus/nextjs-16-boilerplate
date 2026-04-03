# Security Patterns Update Report

## Session

Task: Production-readiness remediation — env validation gates, bootstrap coupling, SDD doc drift.

## Assessment

This session produced two potential candidates for the security patterns catalogue:

### Candidate 1 — Deploy-Gate Pattern for Cross-Field Env Requirements

**Finding**: Cross-field env requirements (e.g., `TENANCY_MODE=single` requires `DEFAULT_TENANT_ID`) must be enforced in CI/CD gates before build, not only at runtime.

**Classification**: Architecture/process rule — not a code-level security scanner pattern.

**Decision**: This is an operational/process rule, not a code pattern for `SECURITY_CODING_PATTERNS.md`. It belongs in the deployment runbook or production-readiness checklist, not the living security catalogue which focuses on scanner-visible code patterns.

**Action**: No addition to `SECURITY_CODING_PATTERNS.md`. Document in `docs/ai/general/` if a deployment readiness checklist does not already exist.

### Candidate 2 — RSC Bootstrap Error Containment Pattern

**Finding**: RSC pages that call `getAppContainer()` or any composition root entrypoint must wrap that call in try/catch and render a controlled degraded UI rather than allowing the RSC to throw uncaught.

**Classification**: Architectural coding pattern — related to error containment at the delivery layer.

**Decision**: This is an architectural coding convention, not a security-scanner-triggered pattern. It is important but belongs in an architectural ADR or component-level coding standard rather than `SECURITY_CODING_PATTERNS.md`.

**Action**: No addition to `SECURITY_CODING_PATTERNS.md`. Add an inline comment in `security-showcase/page.tsx` explaining the pattern for future maintainers.

## Result

**No new entries added to `docs/ai/general/SECURITY_CODING_PATTERNS.md`.**

The existing patterns (SEC-01 through SEC-06) remain accurate and current. None were contradicted or extended by this session.

## AGENTS.md Propagation Check

The two candidates above are operational/architectural rules, not security coding rules. They do not qualify for:

- `AGENTS.md` always-on rules table (which covers coding-level patterns like SEC-01 through SEC-06)
- `SECURITY_CODING_PATTERNS.md` scanner-focused catalogue

If a deploy-readiness production checklist document is created in the future, it should capture:

- `TENANCY_MODE=single` requires `DEFAULT_TENANT_ID` (valid UUID) — validated by `pnpm env:validate`
- `AUTH_PROVIDER=clerk` requires `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — validated by `pnpm env:validate`
- Any RSC page calling `getAppContainer()` must wrap the call in try/catch with a degraded UI path
