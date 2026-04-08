# 02 - Security & Auth - Summary

## Task Context

- Task ID: 870b0c22-0bb4-4e1d-9f10-c85886345462
- Task Objective: Fix pnpm audit vulnerabilities, review overrides, fix coverage threshold failure
- Current Run Scope: Dependency vulnerability triage and remediation guidance
- Status: COMPLETED
- Last Updated: 2026-04-08
- Related Control Artifacts: incident-intake.md, constraints.md

## Scope Handled

- auth surfaces reviewed: N/A — no auth logic changes
- authorization surfaces reviewed: N/A — no authorization changes
- trust-boundary questions in scope: drizzle-orm SQL injection (production data layer), vite dev-only attack surface

## Inputs Reviewed

- code paths reviewed: package.json (overrides), pnpm-lock.yaml (installed versions), vitest.unit.config.ts (coverage config)
- security/auth docs reviewed: SECURITY_CODING_PATTERNS.md
- earlier task artifacts reviewed: incident-intake.md

## Actions Performed

- identity flow tracing performed: N/A
- authorization enforcement review performed: N/A
- tenant / org context review performed: N/A
- sensitive-data exposure review performed: N/A — drizzle-orm SQL injection assessed

## Current-State Findings

### Finding 1: drizzle-orm SQL Injection (HIGH — Production Risk)

- **Advisory**: GHSA-gpj5-g38j-94v9
- **Vulnerable**: `<0.45.2` — installed: `0.45.1`
- **Risk**: SQL injection via improperly escaped SQL identifiers in Drizzle ORM
- **Runtime exposure**: Production — drizzle-orm is the database access layer
- **Fix**: Update to `>=0.45.2` — available as `^0.45.1` already covers this (SemVer patch)
- **Action**: `pnpm update drizzle-orm` — no breaking changes expected between 0.45.1 → 0.45.2

### Finding 2: vite Vulnerabilities (HIGH/MODERATE — Dev-Only)

- **Advisories**: GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583, GHSA-4w7w-66w2-5vf9
- **Vulnerable**: `>=7.0.0 <=7.3.1` — installed: `7.3.1`
- **Risk**: `server.fs.deny` bypass, arbitrary file read via WebSocket, path traversal in `.map` handling
- **Runtime exposure**: **Dev environment only** — vite is a devDependency used for Vitest and Storybook. It is NOT in the production bundle and NOT deployed.
- **Practical threat**: An attacker would need access to the developer's local machine or CI environment running the vite dev server to exploit these. No production exposure.
- **Fix**: Update to `>=7.3.2` via `pnpm update vite`

### Finding 3: Override Review

Each existing override must be validated against what the currently-installed transitive dependency tree actually requires. Stale overrides add maintenance burden and can mask real version conflicts.

**Overrides needing validation:**

- `rollup: ^4.59.0` — used by vite. After updating vite to 7.3.2, check if rollup version is still forced or now satisfied natively.
- `esbuild: >=0.25.0` — used by vite/drizzle-kit. Check after update.
- `undici: >=7.24.0` — Node.js HTTP client. Check if still needed.
- `picomatch: >=4.0.4` and scoped variants — check if transitive consumers now satisfy naturally.
- `effect: >=3.20.0` — check if drizzle-kit or other deps still require this override.
- `@typescript-eslint/utils: ^8.56.1` — check if ESLint or TypeScript config now satisfies naturally.
- `minimatch: >=10.2.3`, `brace-expansion: >=5.0.5`, `@isaacs/brace-expansion: ^5.0.1` — check if still needed.
- `cosmiconfig>yaml`, `docker-compose>yaml`, `lint-staged>yaml` — YAML overrides for security. Check if upstream has patched.

## Trust Boundary Assessment

- where identity is established: N/A (no auth changes)
- where authorization is enforced: N/A (no auth changes)
- where tenant or org context is derived: N/A (no auth changes)
- what claims or inputs are trusted: N/A (no auth changes)

## Sensitive Data And Exposure Notes

- drizzle-orm SQL injection: any user-controlled input passed to Drizzle identifier-escaping is at risk in 0.45.1. Patched in 0.45.2. No workaround needed after update.
- vite: no sensitive data exposure in production — dev-only tool.

## Security Decisions / Constraints

- **APPROVED**: Update `vite` to `>=7.3.2` — trivial semver patch, dev-only, zero production risk
- **APPROVED**: Update `drizzle-orm` to `>=0.45.2` — production-critical security fix, expected to be non-breaking (patch release)
- **APPROVED**: Audit and remove stale overrides after updates; run `pnpm audit` to confirm clean
- **REJECTED**: Override-based workaround for vite vulnerabilities — direct update is correct and available
- **REQUIRED**: Run `pnpm audit` again after fixes to confirm all 4 findings are resolved

## SECURITY_CODING_PATTERNS.md Assessment

- No new SEC patterns introduced by this incident
- The drizzle-orm SQL injection is a transitive vulnerability fixed by package update — no code pattern to document
- The vite dev-server vulnerabilities are environment-local — no code pattern to document
- Existing pattern catalogue remains accurate

## Residual Risks

- After drizzle-orm update: run integration tests (`pnpm test:integration`) to confirm no behavioral regression in database layer
- Override cleanup: removing a still-needed override would downgrade a transitive dep — each removal must be verified by running `pnpm audit` + build check

## Artifact Synchronization

- `incident-intake.md`: Security findings confirmed as documented
- `constraints.md`: Will receive security constraints from this summary
