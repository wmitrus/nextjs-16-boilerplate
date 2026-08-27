# 05 - Validation Strategy - Summary

## Task Context

- Task ID: OZI-77
- Task Objective: contain sibling-organization administration for non-platform actors
- Current Run Scope: minimum falsifying validation before implementation
- Mode: CHANGE VALIDATION
- Status: COMPLETED
- Last Updated: 2026-08-27
- Related Control Artifacts: `plan.md`, `intake.md`, `constraints.md`, `implementation-plan.md`

## Scope Handled

- change surfaces assessed: access helper, scope factory, Drizzle read/mutation services, routes/pages
- validation questions in scope: sibling/cross-tenant isolation, explicit platform path, UUID boundary, regression gates
- excluded validation areas: browser UI, provider auth flows, migrations, production rollout

## Inputs Reviewed

- code paths reviewed: affected services/routes/pages and current tests
- tests / configs / workflows reviewed: companion DB tests, route tests, package scripts, real PostgreSQL test support
- earlier task artifacts reviewed: Security/Auth, Runtime, Architecture, constraints

## Actions Performed

- validation posture review performed: yes
- risk analysis performed: yes
- test-level recommendations prepared: yes
- command recommendations prepared: yes

## Current-State Findings

- Confirmed: current DB tests cover cross-tenant status mutation but not sibling organizations.
- Confirmed: current read-service DB test covers only a happy-path role ID.
- Risks: mocked route tests alone cannot prove SQL scope; DB tests alone do not prove platform scope construction or malformed UUID short-circuit.
- Drift: existing tests describe parent-tenant scope as trusted for non-platform callers.

## Validation-Risk Assessment

- primary risks: sibling reads/mutations remain possible; platform behavior regresses; caller omits/widens scope; malformed UUID reaches DB
- confidence gaps: no current sibling fixture and no route assertion for explicit scope kind
- over-validation or under-validation concerns: browser E2E adds little signal for a server/SQL boundary; real DB plus route tests are mandatory

## Recommended Validation Scope

- minimum required validation: focused route tests; companion read/mutation DB tests with sibling and cross-tenant fixtures; PGlite and PostgreSQL execution; static platform-admin guard; changed-file lint; architecture lint; typecheck; repository phase-close lint/test gates
- optional additional validation: focused admin browser smoke only if route/page tests reveal a delivery mismatch
- validation explicitly not required: auth-flow matrix, provider E2E, schema migration validation, production canary

## Validation Commands / Checks

- commands to run: focused Vitest route tests; focused `pnpm test:db`; PostgreSQL-backed `pnpm test:db:local`; targeted ESLint with `--fix`; `pnpm arch:lint`; `pnpm typecheck`; phase-close `pnpm lint --fix` and relevant broader tests
- environment prerequisites: local dependencies installed; PostgreSQL test service for the real-DB run
- expected evidence: sibling/cross-tenant denial, unchanged rows, platform sibling success, malformed UUID short-circuit, no new lint/type/architecture failures

## Artifact Synchronization

- `plan.md` updates: Validation Strategy phase complete
- `intake.md` updates: readiness marked complete
- `implementation-plan.md` updates: scenario-command mapping recorded
- specialist artifact updates: initial Validation summary created

## Open Questions / Blockers

- unresolved questions: availability of the local PostgreSQL test service will be checked during validation
- blockers: none before implementation
- dependencies on architecture / security / runtime decisions: all upstream decisions are GO

## Handoff Notes

- what the next agent should rely on: both route-level and real-DB evidence are mandatory
- what should not be re-decided without new evidence: browser E2E does not replace SQL isolation tests
- recommended next specialist or step: Implementation Agent

## Update Log

### 2026-08-27 — Initial Strategy

- Trigger: stabilized remediation constraints
- Summary of change: defined minimum falsifying evidence for the CRITICAL incident
- Sections refreshed: all
