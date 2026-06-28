# Intake

## Source Request

User asked to verify each automated PR finding against the current code and only fix it if needed.

## Working Branch Context

- Target branch under review: `feat/authjs`
- Separate already-extracted branch exists: `pr1/continue-checks`

## Readiness Checklist

- [x] Current-code inspection started from referenced files
- [x] At least one falsifiable stale-finding hypothesis confirmed
- [x] Confirm remaining valid findings and patch smallest safe slice
- [x] Validate touched slices with focused tests

## Initial Findings

- Some bot findings target stale revisions and should not be implemented.
- The current `active-org` route trusts client-submitted organization IDs without server-side membership verification.
- Some AuthJS/UI findings were current and were patched after focused local confirmation.
- The invitation accept flow had a validate-then-update race because `markAccepted()` did not guard on `pending` status or report whether any row changed.
- The admin invitations client was reading `message` from failed responses even though the server error contract returns `error`, which masked duplicate-invitation `409` responses as generic status text.
- The migration reconciler still inserted missing journal rows outside a transaction, leaving the backfill path vulnerable to concurrent duplicate attempts.
