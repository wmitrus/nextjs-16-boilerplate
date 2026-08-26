# Security Follow-Ups

## Purpose

This document preserves time-bound repository security follow-ups that have not
yet been verified as resolved. It is not always-on context.

Load it only when:

- the active task touches the repository security surface;
- a security specialist or workflow requests pending follow-ups;
- the user asks to review unresolved security maintenance.

Linear is the canonical state for active follow-up work. This file preserves
the cross-session trigger, required evidence, and retirement criteria; it is not
a substitute for a tracked issue.

## Next.js Critical Security Release Follow-Up

**Trigger date:** 2026-08-26 — reached.

**Last recorded state (2026-08-22, not current evidence):** Next.js had publicly
announced a Critical security release targeted for 2026-08-26 and named
`16.3.2` and `15.5.24` as intended patched versions. At that time, repository
notes stated that the repository was already on `next@16.3.2`, but the official
advisory and affected-version range had not yet been published or verified.

Do not infer that the repository is patched from that historical version note.
The package manifest, lockfile, official advisory, and current release metadata
must be inspected again.

### Required Resolution Procedure

1. Check whether the official Next.js advisory has been published. Prefer the
   official Next.js security advisory and release sources.
2. Read the actual affected-version range and patched version. Do not rely on
   the pre-announced target versions.
3. Compare those ranges with the live repository version in `package.json` and
   the resolved lockfile.
4. If the repository is affected and below the real patched version, upgrade
   `next` and `eslint-config-next` together and update any pinned `@next/*` or
   minimum-release-age exclusions required by the live workspace policy.
5. Select the complete security-relevant validation set from live repository
   configuration. The previous planned evidence included:
   - frozen-lockfile installation;
   - package audit using the repository policy;
   - unit tests;
   - typecheck;
   - a real `CSP_SCRIPT_MODE=nonce-dynamic` production build;
   - the nonce-dynamic E2E scenario or owning CI workflow;
   - Preview deployment;
   - Preview runtime smoke evidence.
6. Do not declare production GO solely because the package version matches a
   previously announced target. Confirm advisory coverage and complete the
   applicable validation and deployment evidence.
7. If unresolved, ensure a canonical Linear issue exists and record the current
   evidence and blocker there.

Use `docs/ai/general/VALIDATION_AND_QUALITY_GATES.md` for validation selection
and `docs/ai/general/CI_CD_EVIDENCE_RETRIEVAL.md` for CI/deployment evidence.

### Retirement Criteria

Delete this subsection when one of these outcomes is verified and recorded in
the canonical Linear issue:

- the repository was affected, the patch was applied, and the required
  security-relevant validation and Preview evidence passed; or
- the official advisory proves that the live repository version is not in the
  affected range.

Do not leave a resolved dated alert in runtime roots or skills. Remove their
temporary pointers when this follow-up is retired.
