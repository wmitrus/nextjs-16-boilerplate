# 01 - Architecture Guard - Summary

## Task Context

- Task ID: OZI-79 Phase A
- Task Objective: `RemoteTarget` plumbing for `scripts/tenancy-inventory/`
- Current Run Scope: structural separation from `LocalTarget`, module
  shape, evidence-store extension
- Status: COMPLETED
- Last Updated: 2026-08-27
- Related Control Artifacts: `plan.md`

## Scope Handled

- `scripts/tenancy-inventory/readonly-db-remote.ts` (new module)
- `scripts/tenancy-inventory/evidence-store.ts` (`EvidenceEnvironment`
  extension, `writeLocalEvidence` -> `writeEvidence` rename)
- `scripts/tenancy-inventory/cli.ts` (deliberately NOT touched)

## Architectural Decisions / Constraints

- approved: a wholly separate module (`readonly-db-remote.ts`), not an
  extension of `readonly-db.ts` -- `LocalTarget`'s allowlist, constants,
  and `withReadOnlyDb` function are untouched; `RemoteTarget` has its own
  credential-resolution function, its own connection construction, its
  own transaction wrapper. No shared code path exists that a `LocalTarget`
  value could travel through to reach a remote credential, or vice versa.
- approved: `EvidenceEnvironment` widened to include `staging`/
  `production` now, since the confinement/permission logic in
  `evidence-store.ts` is already environment-agnostic and this is
  additive/inert until something actually calls `writeEvidence('staging',
  ...)` -- no CLI command does yet.
- approved: `writeLocalEvidence` renamed to `writeEvidence` -- the old
  name became inaccurate once the function could legitimately write
  `staging`/`production` evidence too; a still-accurate name matters more
  here than avoiding a one-file rename.
- approved: no DI/container involvement, matching the established
  `LocalTarget` precedent and every other `scripts/**` DB tool in this
  repo.
- rejected: unifying `LocalTarget`/`RemoteTarget` into one target type or
  one connection-construction function -- the whole point of this
  separation is that a bug or careless edit in the tested, already-merged
  local path cannot newly become a way to reach a remote database, and
  vice versa. Keeping them structurally independent is the safety
  property, not an inefficiency to clean up.
- architecture status: **GO**

## Risks

- None blocking for Phase A. The one real open structural question --
  what a future `scan --target=staging|production` CLI command should
  look like, and how the "approved query subset" is expressed and
  enforced in code -- is deliberately deferred: building that now would
  create a working remote-execution command before the user has decided
  which environments are authorized and how credentials are provisioned.
  Recommend: when that authorization exists, express the query subset as
  an explicit, hardcoded array of query names (mirroring
  `tenantIdShapeCounts`'s closed table-name union), not a free-form
  `--queries=` flag accepting arbitrary strings.

## Handoff Notes

- what the next agent should rely on: `readonly-db-remote.ts`'s structural
  isolation from `readonly-db.ts` is load-bearing; do not introduce a
  shared helper between them without a fresh review
- recommended next step: Security/Auth review (see
  `02 - Security & Auth - Summary.md`), then the user's own review of
  `runbook.md`

## Update Log

### 2026-08-27 — Initial Review

- Trigger: OZI-79 Phase A design
- Summary of change: approved the separate-module structural shape,
  `EvidenceEnvironment` extension, and the `writeEvidence` rename;
  confirmed all three in the finished implementation
- Sections refreshed: all
