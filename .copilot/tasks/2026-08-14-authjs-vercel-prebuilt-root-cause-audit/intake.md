# Intake

## Objective

Establish the evidence-backed root cause of the hosted AuthJS sign-in
`Connection closed.` failure and independently re-audit the Vercel Preview
source-build / Production prebuilt deployment model before accepting or changing
either implementation.

## Problem Statement

The current AuthJS task contains a proposed RSC change from
`getServerSession(authOptions)` to cookie/header-backed `getToken()`, but the
exact hosted Flight response that closes has not been identified. Preview was
reported working before the latest fixes, so source history, generated build
output, deployment identity, and stale/cached artifact behavior must be compared
before the patch can be called causal.

Separately, recent Vercel tasks introduced split source/prebuilt upload profiles,
artifact guards, and dry-run validation after a Vercel CLI behavior change. That
model must be checked against current provider documentation, observed CLI
behavior, and the files actually deployed.

## Scope

- Reconstruct the source, build, deployment, and runtime timeline for the
  affected AuthJS Preview and Production deployments.
- Identify which exact document, RSC/Flight, AuthJS, or bootstrap request fails.
- Compare the deployed commit and generated output with the current working tree.
- Re-audit Preview source builds and Production `--prebuilt` deploys against the
  current Vercel Build Output contract.
- Decide whether the current `getToken()` patch and `experimental.cpus` setting
  are correct, incidental, incomplete, or should be replaced.
- Produce one provider-aligned implementation and verification path only after
  the evidence distinguishes competing hypotheses.
- At completion, update the earlier Copilot task artifacts with the final,
  reusable conclusions for both cases.

## Non-Goals

- No speculative auth refactor.
- No global suppression of `Connection closed.` telemetry.
- No mutation of generated `.vercel/output` metadata to make a deploy pass.
- No deployment, secret, cookie, database, or provider-policy change without
  causal evidence and an explicit implementation phase.

## Evidence Standard

- Repository code and immutable git history are authoritative for source.
- Vercel deployment IDs, commit SHAs, build logs, Build Output metadata, upload
  dry-runs, request IDs, and browser traces are authoritative for hosted behavior.
- Official Vercel, Next.js, and Auth.js documentation is authoritative for
  provider contracts; community patterns are corroborating evidence only.
- A passing local unit test cannot prove a hosted RSC transport or prebuilt
  deployment contract.

## Acceptance Criteria

- The AuthJS symptom is tied to an exact failing request and failure boundary, or
  the remaining missing hosted evidence is stated precisely without claiming a
  root cause.
- The last known working Preview and first affected deployment are compared by
  commit, build mode, effective environment class, generated output, and runtime
  request behavior.
- The Vercel prebuilt design is classified as supported, conditionally supported,
  or incorrect with primary-source and controlled-artifact evidence.
- The final remediation does not depend on stale output, hidden local files, or
  hand-edited generated artifacts.
- Focused build/artifact, type, unit, and browser validation is defined before
  implementation.

## 2026-08-15 Production Bootstrap Follow-Up

After the prebuilt runtime corrections, Production sign-in succeeded but the
post-login bootstrap redirected to `?error=tenant_config`. The follow-up scope
is to distinguish route packaging, migrations, incomplete bootstrap data, and
Vercel tenant-env drift using HAR, runtime logs, and read-only production DB
evidence. No auth or tenant mutation is permitted before that evidence identifies
one safe correction.

## Leantime

- Auth incident milestone/task: `99` / `100` (`W toku`).
- Vercel prebuilt incident milestone/task: `97` / `98` (reopened to `W toku`).
- No duplicate umbrella ticket was created; this task workspace coordinates the
  two existing incident records.
