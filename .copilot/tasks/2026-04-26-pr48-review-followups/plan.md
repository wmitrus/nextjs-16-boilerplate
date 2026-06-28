# PR48 Review Follow-Ups Plan

## Objective

Verify each automated PR finding against current `feat/authjs` code and fix only findings that remain valid.

## Checklist

- [x] Identify highest-risk findings and inspect current code paths
- [x] Mark clearly stale findings before any edits
- [x] Patch confirmed security/auth/runtime issues with minimal blast radius
- [x] Update affected focused tests for behavior changes
- [x] Run focused validation for touched slices
- [x] Record final triage outcome and residual follow-ups

## Current Triage Notes

- Stale already confirmed: missing `/auth/signin` page, missing App Router NextAuth handler wiring, missing waitlist barrel exports, missing waitlist repository interface file, missing handoff file in workspace.
- Stale in this pass: the referenced `src/modules/invitations/infrastructure/DrizzleInvitationRepository.test.ts` relocation finding no longer applies because that file does not exist in current code.
- Fixed in this pass: `src/app/api/auth/active-org/route.ts`, `src/modules/auth/ui/authjs/AuthJsWorkspaceSwitcher.tsx`, `src/modules/auth/infrastructure/authjs/auth.ts`, `src/app/auth/signin/sign-in-client.tsx`, waitlist service/repository coverage.
- Fixed in this pass: invitation accept TOCTOU in `DefaultInvitationService`/`DrizzleInvitationRepository`, admin invitation client `409` error rendering, and per-decision migration journal backfills now wrapped in `SERIALIZABLE` transactions.
- Verified and left unchanged: `src/modules/auth/ui/hooks/useSignOut.ts` (current call-site path remains Clerk-only), `src/app/auth/signup/sign-up-client.tsx` (no current-code correctness or security defect confirmed from reviewed findings).

## Constraints

- Do not touch `pr1/continue-checks`.
- Keep changes narrowly scoped to real current-code issues.
- Prefer focused tests over broad suite expansion.
