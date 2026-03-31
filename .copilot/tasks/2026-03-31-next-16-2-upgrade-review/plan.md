# Task Plan

## Objective

Review the existing requirements and workflow for upgrading this repository from Next.js 16.1.7 to 16.2.x, validate them against the live codebase, record architecture-level findings and drift, and prepare a clean handoff to the next specialist without editing the source planning artifacts under `.zencoder/chats/`.

## Progress Checklist

- [x] Task workspace initialized
- [x] `plan.md` completed
- [x] `intake.md` completed
- [x] `01 - Architecture Guard - Summary.md` completed
- [x] `03 - Next.js Runtime - Summary.md` completed
- [x] `04 - Implementation Agent - Summary.md` completed
- [x] `validation-report.md` completed

## Likely Affected Areas

- `package.json`
- `pnpm-lock.yaml`
- `next.config.ts`
- `postcss.config.mjs`
- `postcss.config.ts`
- `src/app/error.tsx`
- `src/app/global-error.tsx`
- `src/app/users/error.tsx`
- `src/app/e2e-error/error.tsx`
- `src/app/error.test.tsx`
- `src/app/global-error.test.tsx`
- `.github/labeler.yml`
- `AGENTS.md`
- `docs/tanstack-migration/02-foundation.md`

## Task Classification

- non-trivial
- architecture review first
- runtime-contract-sensitive
- framework minor upgrade
- low implementation blast radius
- docs-vs-code drift present

## Expected Specialist Sequence

1. Artifact initialization and intake normalization
2. `01 - Architecture Guard` review of requirements vs live code
3. `03 - Next.js Runtime` review of App Router contract impact and minimum runtime verification
4. `04 - Implementation Agent` execution within the approved runtime and architectural constraints
5. Focused validation and final report

## Sequence Checklist

- [x] Artifact initialization completed
- [x] Architecture review completed
- [x] Next.js Runtime review completed
- [x] Implementation completed
- [x] Focused validation recorded

## Specialist Status

- `01 - Architecture Guard`: completed
- `03 - Next.js Runtime`: completed
- `02 - Security & Auth`: not required for the baseline upgrade; required only if SRI or auth-sensitive cache experiments move into scope
- `05 - Validation Strategy`: not required yet; use only if validation scope expands beyond the obvious framework-upgrade checks
- `04 - Implementation Agent`: completed
- `07 - Playwright E2E`: optional for the baseline version bump; useful only if browser-observable runtime regressions need proof beyond build/test evidence

## Known Risks / Unknowns

- the implementation must update the full in-scope App Router error-boundary surface, not only root/global
- the implementation must include `pnpm build`, which was omitted from the original task package
- the PostCSS rename is not isolated; repository docs and metadata still reference `postcss.config.mjs`
- the final `next/error` typing surface must be validated after the upgrade because the current local `16.1.7` install does not prove the new contract
- experimental runtime flags remain intentionally deferred from the baseline upgrade

## Planned Artifacts

- `plan.md`
- `intake.md`
- `01 - Architecture Guard - Summary.md`
- `03 - Next.js Runtime - Summary.md`
- `04 - Implementation Agent - Summary.md`
- `validation-report.md`

## Artifact Checklist

- [x] `plan.md`
- [x] `intake.md`
- [x] `01 - Architecture Guard - Summary.md`
- [x] `03 - Next.js Runtime - Summary.md`
- [x] `04 - Implementation Agent - Summary.md`
- [x] `validation-report.md`

## Current Status Note

- Requirements and planning inputs were reviewed from `.zencoder/chats/24831770-bfc2-4f10-8aa2-570f93f3a0db/requirements.md` and `.zencoder/chats/24831770-bfc2-4f10-8aa2-570f93f3a0db/plan.md`.
- Live code review confirmed the baseline version bump is architecturally safe.
- Live code review also confirmed that the current task package misses route-level error-boundary files and repository drift tied to the PostCSS config rename.
- Runtime review is now complete and confirms that route-level `error.tsx` files are in scope, `pnpm build` is mandatory, and `16.2.1` is the correct target to record.
- The recommended next step is `04 - Implementation Agent`.
