# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-04-05-per-request-caching`
- Task Objective: Confirm the correct architectural fix for the broken New Relic browser snippet injection in the root layout after the per-request caching and observability work.
- Current Run Scope: Review all task artifacts in `.copilot/tasks/2026-04-05-per-request-caching`, compare them to live repository code, and correct the browser snippet integration shape for Next.js 16.
- Status: REVIEW COMPLETE — ONLY VALIDATION EVIDENCE REMAINS
- Last Updated: 2026-04-05
- Related Control Artifacts: `plan.md`, `feature-intake.md`, `implementation-plan.md`, `validation-report.md`

## Scope Handled

- modules / layers reviewed: `src/app`, `src/core/observability`, task artifacts under `.copilot/tasks/2026-04-05-per-request-caching`
- change surface reviewed: root layout script injection path, env-backed browser snippet normalization, task artifact drift
- architecture questions in scope: correct Next.js 16 injection mechanism, boundary placement, docs-vs-code drift

## Inputs Reviewed

- code paths reviewed: `src/app/layout.tsx`, `src/core/observability/new-relic.ts`, `src/security/middleware/with-headers.ts`, `src/instrumentation.ts`, `src/core/env.ts`, `.env.example`, `docs/newrelic-agent-snippet.js`
- docs / ADRs / prompts reviewed: `AGENTS.md`, `docs/ai/general/00 - Agent Interaction Protocol.md`, `docs/ai/general/REPOSITORY_AI_CONTEXT.md`, `docs/ai/general/SECURITY_CODING_PATTERNS.md`
- earlier task artifacts reviewed: `architecture-review.md`, `constraints.md`, `feature-intake.md`, `implementation-plan.md`, `plan.md`, `runtime-review.md`, `validation-report.md`, `validation-strategy.md`

## Actions Performed

- repository inspection performed: verified the live code path still injected the snippet via `next/script` and did not normalize full HTML snippets at the core facade boundary
- boundary checks performed: confirmed the fix belongs in `src/core/observability/new-relic.ts` and `src/app/layout.tsx`; no module boundary expansion required
- dependency / DI review performed: confirmed no DI or module ownership changes are needed; this is a focused delivery-layer and core-observability correction
- docs-vs-code checks performed: confirmed task artifacts claimed browser monitoring was complete while live code still used the structurally incorrect injection path

## Current-State Findings

- Confirmed:
  - `src/core/runtime/bootstrap.ts` implements the module-level `React.cache()` wrapper and preserves the `getAppContainer()` API.
  - `src/core/runtime/bootstrap.test.ts` contains the expected MR-1, MR-2, and MR-3 coverage.
  - `getBrowserSnippetSafe()` in `src/core/observability/new-relic.ts` returned raw env content without stripping optional `<script>` wrappers.
  - `src/app/layout.tsx` now injects the snippet with a native `<script>` in `<head>`, which is the correct Next.js 16 delivery shape.
  - The active `.env.local` transport issue was addressed by preferring `NEW_RELIC_BROWSER_SNIPPET_BASE64` and retaining raw-line recovery logic.
  - `src/instrumentation.ts`, `src/core/env.ts`, `next.config.ts`, `src/security/middleware/with-headers.ts`, and `newrelic.js` all reflect the intended integration shape.
  - `src/core/runtime/bootstrap.ts` and `src/core/observability/new-relic.ts` now include explicit `server-only` guards.
  - Task control artifacts were tightened so final closure no longer depends on missing ad hoc report artifacts.
  - The only remaining unproven area is fresh validation evidence for the final code state.
- Risks:
  - Marking the task production ready before rerunning validation would still overstate proof coverage.
- Drift:
  - Remaining drift has been reduced to missing rerun evidence only.

## Boundary And Dependency Assessment

- module ownership assessment: browser snippet normalization belongs to `src/core/observability/new-relic.ts`; root-level script placement belongs to `src/app/layout.tsx`
- dependency direction assessment: `app -> core` remains valid; no reverse dependency introduced
- DI / composition assessment: unaffected; this change does not touch container composition or request scoping
- cross-module coupling assessment: no new coupling introduced; New Relic SDK remains isolated behind the core observability facade

## Architectural Decisions / Constraints

- approved architectural constraints:
  - Normalize the env-backed browser snippet in `src/core/observability/new-relic.ts` by stripping optional outer `<script>` wrappers.
  - Inject the sanitized JavaScript via a native `<script>` in the root layout `<head>`, not through `next/script` bootstrap serialization.
  - Support a transport-safe snippet source for local env files because raw unquoted `.env` transport is not structurally reliable for the New Relic SPA loader payload.
  - Keep `getBrowserTimingHeaderSafe()` for non-layout use cases; do not restore it as a layout fallback.
  - Ignore New Relic UI suggestions to instrument third-party vendor sinks or host-level vendor traffic within this task.
- rejected directions:
  - Do not keep `next/script strategy="beforeInteractive"` for this snippet path.
  - Do not push New Relic SDK calls back into the layout to synthesize the browser header at render time.
  - Do not add instrumentation for `api.logflare.app`, `o4508840267612160.ingest.de.sentry.io`, or raw `api.clerk.com` traffic.
  - Do not broaden this task to cover Upstash or GrowthBook host-level instrumentation.
- follow-up architectural guardrails:
  - Treat third-party HTML snippets as opaque operator input at the facade boundary, but normalize transport wrappers before delivery.
  - Keep task artifacts synchronized with the live code when follow-up fixes invalidate prior “complete” claims.
  - When future dependency instrumentation is considered, instrument app-owned boundaries or contracts, not vendor-owned hosts.

## Artifact Synchronization

- `plan.md` updates: status corrected from effectively complete to in-progress for the browser injection follow-up
- `intake.md` updates: no standalone `intake.md` exists for this task; `feature-intake.md` remains valid for the broader task scope
- `implementation-plan.md` updates: added explicit browser injection correction steps under the New Relic phase
- specialist artifact updates: created this persistent `01 - Architecture Guard - Summary.md`

## Open Questions / Blockers

- unresolved questions: none at the architectural level
- blockers: fresh validation evidence is still needed before calling the task production ready
- evidence still needed: rerun and capture typecheck, lint, and test evidence against the final browser follow-up state

## Handoff Notes

- what the next agent should rely on: the correct fix shape is `core` snippet normalization plus native `<head>` script injection in the root layout
- what should not be re-decided without new evidence: do not reintroduce `next/script` for this snippet path and do not restore an APM header fallback in the layout
- recommended next specialist or step: focused validation of the updated browser injection path

## Update Log

### Update Entry

- Date: 2026-04-05
- Trigger: final repository review requested to confirm implementation and task completion state
- Summary of change: aligned code with the explicit server-only constraint, tightened task artifacts so only validation reruns remain open, and kept production-readiness blocked on proof rather than process drift
- Sections refreshed: all
