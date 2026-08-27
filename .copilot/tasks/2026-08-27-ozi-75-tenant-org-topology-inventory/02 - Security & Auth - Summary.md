# 02 - Security & Auth - Summary

## Task Context

- Task ID: OZI-75
- Task Objective: read-only tenant/organization topology and
  identifier-integrity inventory (local/schema pass)
- Current Run Scope: read-only enforcement, redaction, evidence handling
  for the new diagnostic tooling
- Status: COMPLETED
- Last Updated: 2026-08-27
- Related Control Artifacts: `plan.md`, `intake.md`, `01 - Architecture Guard - Summary.md`

## Scope Handled

- `scripts/tenancy-inventory/readonly-db.ts` (enforcement mechanism)
- `scripts/tenancy-inventory/evidence-store.ts` (evidence handling)
- `scripts/tenancy-inventory/topology-queries.ts` (query shape, PII surface)
- `scripts/tenancy-inventory/cli.ts` (logging)

## Pre-Implementation Decisions

1. **Pseudonymization**: committed/example output must use fully synthetic
   placeholder identifiers, never a hash or transform of real local data —
   avoids any correlation risk entirely rather than relying on a salt to
   protect. Raw local evidence (outside the repo) may contain real local
   dev/test UUIDs since that data is already non-production/synthetic seed
   data.
2. **Aggregates**: local dev/test aggregate counts are safe to print/store
   as exact values this pass (non-production data, kept outside the repo
   regardless). Bucketing/rounding for a later staging/production pass is
   noted as an open question in `intake.md`, not decided here.
3. **Read-only mechanism sufficiency**: the Postgres `READ ONLY` transaction
   is necessary but not by itself sufficient — required a second,
   independent control: the tool accepts no arbitrary connection URL at
   all, only `--target=dev|test` mapped to two fixed, hardcoded local
   constants. This means the tool cannot reach any database other than the
   two authorized local ones regardless of transaction mode.
4. **Logging**: mirror `scripts/db-ops.mjs`'s `logTarget` — only
   `host:port/database`, never credentials.

## Current-State Findings (post-implementation)

- Confirmed: `withReadOnlyDb` never accepts a caller-supplied URL; the only
  inputs are the closed `LocalTarget` union (`'dev' | 'test'`), enforced by
  TypeScript and by the CLI's own `--target` validation before any
  connection is attempted.
- Confirmed: every topology query in `topology-queries.ts` is a `count()`/
  aggregate/bucket — no query ever selects an email, name, token, or other
  PII column. There is nothing to redact from the tool's own output because
  PII was never fetched in the first place.
- Confirmed: `evidence-store.ts` writes only under
  `~/.local/share/nextjs-16-boilerplate/ozi-75/local/` (outside any git
  working tree), confined at the filesystem sink via
  `scripts/lib/fs-guards-shared.ts`'s `assertPathWithinBase`-backed
  helpers (SEC-16); a path-escape attempt is rejected before any write
  (proven by `evidence-store.test.ts`).
- Confirmed: `describeLocalTarget` (used for all logging) prints only
  `host:port/database`, never the connection string's credentials —
  verified by `readonly-db.db.test.ts`.
- Confirmed: `tenantIdShapeCounts`'s table name is a closed, hardcoded
  TypeScript union (`'feature_flags' | 'audit_log_settings' |
  'audit_events'`), never a caller-supplied string — the one place this
  tool interpolates a SQL identifier is not a dynamic-access risk (SEC-18).

## Trust Boundary Assessment

- where identity is established: N/A — this is an operator-run local CLI,
  not a request-serving surface; no end-user identity crosses this
  boundary
- where authorization is enforced: the target allowlist (`--target=dev|test`
  only) plus the Postgres `READ ONLY` transaction are the two independent
  enforcement layers; both must be satisfied for any query to run at all
- what claims are trusted: none from outside the operator's own CLI
  invocation; there is no network-facing or client-facing input surface

## Sensitive Data And Exposure Notes

- logging/telemetry: host:port/database only, never credentials; full
  query findings are aggregate-only and safe to print, since no PII was
  ever selected
- response exposure: N/A (no HTTP surface)
- committed-artifact exposure: only synthetic example data will be
  committed (`example-report.md`); actual local scan output stays outside
  the repo per the evidence-storage constraint

## Security Decisions / Constraints

- approved: Postgres-native `READ ONLY` transaction as primary
  enforcement + hardcoded local-only target allowlist as secondary,
  independent enforcement
- approved: aggregate-only query shape as the mechanism that makes
  redaction a non-issue, rather than fetching raw rows and redacting after
  the fact
- rejected: any form of `--url`/arbitrary `DATABASE_URL` override for this
  tool in this pass
- rejected: hashing real local identifiers into committed example output
- security status: **GO**

## Artifact Synchronization

- `plan.md`: Security/Auth phase marked complete
- `intake.md`: no change required

## Open Questions / Blockers

- None for this pass. Bucketing policy for staging/production aggregates
  is deferred to that future, separately authorized handoff.

## Handoff Notes

- what the next agent should rely on: the target allowlist and read-only
  transaction are both load-bearing; do not relax either without a new
  Security/Auth review
- what should not be re-decided without new evidence: no arbitrary
  connection URL, no raw-row PII queries

## Update Log

### 2026-08-27 — Initial Review

- Trigger: OZI-75 local/schema tooling design and implementation
- Summary of change: approved the read-only enforcement mechanism, target
  allowlist, aggregate-only query shape, and evidence-storage boundary;
  confirmed all four in the finished implementation
- Sections refreshed: all
