# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-08-22-authjs-login-abuse-control`
- Task Objective: Verify the new modules (`login-abuse-control.ts`, `turnstile.ts`, `TurnstileWidget.tsx`) don't introduce module-boundary or dependency-direction drift.
- Current Run Scope: `src/shared/lib/rate-limit/login-abuse-control.ts`, `src/shared/lib/captcha/turnstile.ts`, `src/shared/components/captcha/TurnstileWidget.tsx`, and their consumers in `src/modules/auth/**` and `src/app/**`.
- Status: COMPLETED
- Last Updated: 2026-08-22
- Related Control Artifacts: `02 - Security & Auth - Summary.md`, `04 - Implementation Agent - Summary.md`

## Scope Handled

- modules / layers reviewed: `shared/lib/rate-limit`, `shared/lib/captcha`, `shared/components/captcha`, `modules/auth/infrastructure/authjs`, `app/api/auth/[...nextauth]`, `app/auth/signin`
- change surface reviewed: new shared-layer modules consumed by the `auth` module and by an `app`-layer client component
- architecture questions in scope: does `modules/auth` importing new `shared/lib/*` modules respect `modules -> shared/core`; is a new `shared/components/*` UI component (rather than something under `modules/auth/ui`) the right ownership call

## Inputs Reviewed

- code paths reviewed: as listed above; `src/shared/lib/rate-limit/rate-limit.ts` (the pre-existing `redis` client, now also exported for reuse)
- docs / ADRs / prompts reviewed: `docs/ai/general/REPOSITORY_AI_CONTEXT.md` Module Structure table; Case 1's `01 - Architecture Guard - Summary.md` for the established reasoning style
- earlier task artifacts reviewed: as above

## Actions Performed

- repository inspection performed: confirmed `login-abuse-control.ts` and `turnstile.ts` depend only on `@/core/env`, `@/core/logger/di`, and (for the former) the existing `shared/lib/rate-limit/rate-limit.ts` module — no import from `@/modules/**`, satisfying `shared -> core` (rate-limit and captcha are both `shared/lib`, `core` is a valid dependency).
- boundary checks performed: `TurnstileWidget.tsx` (`shared/components/captcha`) has zero non-React, non-browser-API dependencies — a maximally reusable, provider-generic-shaped UI primitive, correctly placed in `shared/components` rather than `modules/auth/ui` (it isn't AuthJS-specific; nothing about it assumes Credentials-based login).
- dependency / DI review performed: `modules/auth/infrastructure/authjs/auth.ts` now imports `@/shared/lib/captcha/turnstile` and `@/shared/lib/rate-limit/login-abuse-control` — both `shared/lib`, so this is `modules -> shared`, an explicitly allowed edge. Confirmed no new edge in the other direction (neither new module imports anything from `modules/auth`). Verified via `pnpm skott:check:only` (no circular dependencies) after the change.
- docs-vs-code checks performed: none of this task's file placements conflict with `docs/ai/general/REPOSITORY_AI_CONTEXT.md`'s module table; `shared/lib/rate-limit` already existed as a location for exactly this kind of cross-cutting security primitive (rate limiting), and `shared/lib/captcha` follows the same convention for a second, related cross-cutting concern.

## Current-State Findings

- Confirmed: zero new cross-module dependency edges beyond the already-allowed `modules -> shared`. `rate-limit.ts` exporting its `redis` client (previously module-private) is a widened _export surface_ within the same file/module, not a new dependency direction.
- Confirmed: the choice to make `login-abuse-control.ts`'s public functions take an arbitrary `accountKey: string` (rather than an AuthJS-specific type) keeps the module reusable for any future password-verification endpoint, consistent with `shared/lib`'s ownership charter (cross-cutting, not feature-specific).
- Risks: none identified.
- Drift: none.

## Boundary And Dependency Assessment

- module ownership assessment: `shared/lib/rate-limit` now owns both the generic API rate limiter (pre-existing) and the login-specific progressive abuse counter (new) — a reasonable single home for "rate-limiting concerns," not a scope violation.
- dependency direction assessment: `modules/auth -> shared/lib/{rate-limit,captcha}` and `app/auth/signin -> shared/components/captcha` both match `modules -> shared` / `app -> shared`, per the repo's dependency table.
- DI / composition assessment: neither `login-abuse-control.ts` nor `turnstile.ts` is DI-registered — both are plain function modules imported directly, consistent with how `rate-limit.ts`/`rate-limit-helper.ts` already work (this repo's rate-limiting primitives are not container-resolved services).
- cross-module coupling assessment: none introduced.

## Architectural Decisions / Constraints

- approved architectural constraints: new cross-cutting security primitives belong in `shared/lib/*`, keyed by generic parameters (not feature-specific types), so they can be reused by any future feature needing the same shape of control. New generic UI primitives (a CAPTCHA widget) belong in `shared/components/*`, not inside the feature module that happens to be their first consumer.
- rejected directions: none proposed that conflicted with these placements.
- follow-up architectural guardrails: none new — this task reuses, rather than establishes, the `shared/lib` / `shared/components` placement convention.

## Artifact Synchronization

- `plan.md` updates: architecture review step marked complete.
- `intake.md` updates: none required.
- `implementation-plan.md` updates: not used for this workflow.
- specialist artifact updates: none beyond this file.

## Open Questions / Blockers

- unresolved questions: none.
- blockers: none.
- evidence still needed: none — `pnpm skott:check:only` and `pnpm depcheck` both pass clean after the change.

## Handoff Notes

- what the next agent should rely on: the `shared/lib/rate-limit/login-abuse-control.ts` pattern (generic `accountKey`-keyed progressive counter) is safe to reuse for any future password-verification endpoint without architectural review.
- what should not be re-decided without new evidence: the placement of the CAPTCHA widget in `shared/components`, not `modules/auth/ui`.
- recommended next specialist or step: none for this case.

## Update Log

### Update Entry

- Date: 2026-08-22
- Trigger: Conditional architecture review for this security incident (new shared-layer modules).
- Summary of change: Confirmed no new cross-module dependency edges; confirmed correct `shared/lib` / `shared/components` placement for the new reusable primitives.
- Sections refreshed: all.
