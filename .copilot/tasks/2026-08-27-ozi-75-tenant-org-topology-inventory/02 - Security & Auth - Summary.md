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

## Formal Post-Implementation Review — 2026-08-27

Requested explicitly by the user before this checkpoint is handed off for
future production-execution scoping. Verified against five specific
criteria; production execution itself is out of scope for this review.

### 1. Are all 8 topology queries bounded and aggregate-only?

**Initially: 6 of 8 were.** Two (`tenantOrganizationCounts`,
`usersInMultipleOrganizationsCount`) and half of a third
(`providerOrganizationMappingAnomalies`'s duplicate-mapping count) used
Drizzle's query builder with `.groupBy()`/`.having()` and a `MAX_ROWS`
`.limit()`, fetching per-entity rows (tenant ids, user ids, organization
ids) into the Node process before collapsing them to a `.length`. Bounded,
yes; but not aggregate-only at the SQL level — raw ids transiently existed
in process memory even though the function's return value never exposed
them.

**Fixed during this review**: all three now compute the count entirely
inside Postgres via a `count(*)` over a subquery — no per-entity row, and
so no id, crosses out of the database into this process at all. Re-ran
the full dry-run against `dev-db` after the change: identical output to
before (confirms the rewrite is behaviorally equivalent, not just
structurally different). `MAX_ROWS`/`.limit()` is no longer needed
anywhere in `topology-queries.ts` and was removed — every one of the 8
functions is now a single-row aggregate query, with no row-listing shape
left to bound. All 8 now satisfy this criterion at the query level, not
just at the output level.

### 2. Can PII/raw UUIDs/provider IDs be recovered from any output?

**No.** Confirmed by re-reading every function's return type after the
fix above: every one returns only `number`/aggregate objects of numbers.
No function signature, in either its parameters (only `Tx` and a closed
table-name union) or its return type, carries an identifier, email, or
token. This is stronger than "the report happens not to print PII" — the
functions cannot express returning it.

### 3. Does the ownership matrix cover all real tables, no gaps/duplicates?

**Confirmed programmatically**, not just asserted: the new
`ownership-matrix.completeness.db.test.ts` derives the live table list
from `pg_catalog.pg_tables` (independent of the Drizzle schema files the
matrix was hand-built from) and diffs it against `TABLE_OWNERSHIP` for
missing entries, stale entries, and duplicates. Passes against real
`test-db`. This is the durable guard against future drift the user asked
for — a 22nd table added later fails this test instead of the tool
silently reporting a stale matrix as complete.

### 4. Are the owner classifications actually justified by live schema/code?

Spot-checked the borderline cases directly against schema/repository code
(not re-asserted from memory):

- `policies.organization_id` (nullable, classified `organization`, not
  `ambiguous`): a null value means "no organization scope on this row",
  which is a valid state of an organization-owned resource (a
  system/global policy), not an identifier-*shape* ambiguity like the four
  `ambiguous` rows. `policiesWithNullOrganizationCount` exists precisely
  to quantify how often this actually happens. Classification stands.
- The four `ambiguous` rows (`waitlist_entries`, `feature_flags`,
  `audit_log_settings`, `audit_events`): each has a documented,
  code-verified reason in `ownership-matrix.ts` — `waitlist_entries` was
  checked directly against `DrizzleWaitlistRepository`'s actual field list
  (confirmed no `tenantId` anywhere in `CreateWaitlistEntryData`); the
  other three were checked against their schema files' own doc comments
  (`tenant_id` is `text`, explicitly because `TenantContext.tenantId` can
  hold either an internal uuid or an external provider id depending on
  `TENANT_CONTEXT_SOURCE`). Not asserted — traced to the actual field
  definitions and repository code in every case.
- All other 16 rows have an unambiguous `NOT NULL uuid` FK (or no scope
  column at all for platform-owned tables) — no judgment call was
  required for those.

### 5. Design note: could production layer a real read-only DB role on top?

**Yes, cleanly, and it should — not implemented here, per explicit scope.**
The current `withReadOnlyDb` already isolates "how a connection is
obtained" from "what queries run" behind one function boundary; a future
production path would need only:

- a new, distinct credential belonging to a Postgres role granted `SELECT`
  only (no `INSERT`/`UPDATE`/`DELETE`/`CREATE`/`DROP` on any table, ideally
  also no `pg_catalog` write privileges) — provisioned and rotated through
  whatever secrets process staging/production already use, not hardcoded
  like the local constants;
- a new target type distinct from `LocalTarget` (e.g. a `RemoteTarget`)
  that this tool does **not** currently define, so that no accidental
  code path can reach it without a deliberate, reviewed addition;
- the same `db.transaction(fn, { accessMode: 'read only' })` wrapper
  reused unchanged as the second, independent layer.

Two independent controls (DB-role grants AND transaction read-only) is a
materially stronger posture than either alone: even a bug in this tool
that somehow issued a write would be rejected twice, once by the
transaction and — even if that layer were ever somehow bypassed —
again by Postgres's own grant system, which trusts nothing this
application-level code asserts about itself.

### Verdict

**Safe as-is for local use; confirmed evidence-grade for its own output.**
No PII/raw-identifier exposure risk in any function. Ownership matrix
completeness is now enforced by a real-DB test, not just claimed. The one
substantive finding from this review (weaker-than-necessary query shape
in 3 of 8 functions) was fixed in place before this sign-off, not deferred.
Nothing here proposes or authorizes a production execution mechanism —
that remains a separate, explicit future authorization per the user's own
sequencing, with the DB-role requirement above recorded as its design
input.

## Update Log

### 2026-08-27 — Initial Review

- Trigger: OZI-75 local/schema tooling design and implementation
- Summary of change: approved the read-only enforcement mechanism, target
  allowlist, aggregate-only query shape, and evidence-storage boundary;
  confirmed all four in the finished implementation
- Sections refreshed: all

### 2026-08-27 — Formal Post-Implementation Review

- Trigger: user-requested formal Security/Auth review against 5 specific
  criteria, before handing this checkpoint off for review
- Summary of change: found and fixed a query-shape weakness in 3 of 8
  topology queries (row-level ids transiting into process memory despite
  never being exposed); confirmed ownership-matrix completeness via a new
  real-DB test; confirmed classification rationale for every table;
  recorded the design input for a future production read-only-role layer
- Sections refreshed: Formal Post-Implementation Review (new)
