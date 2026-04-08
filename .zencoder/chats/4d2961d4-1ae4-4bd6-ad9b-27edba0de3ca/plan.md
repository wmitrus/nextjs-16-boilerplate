# Incident Investigation Workflow

## Configuration

- **Artifacts Path**: `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/4d2961d4-1ae4-4bd6-ad9b-27edba0de3ca` → `.zenflow/tasks/{task_id}`
- **Step Agent Presets**: this workflow uses Zenflow's documented `<!-- agent: preset-name -->` step binding pattern.
- **Required Saved Presets**: create matching presets in Zenflow Settings → Agents, or rename the inline `agent:` comments below to match your actual preset names:
  - `debug-investigation-agent`
  - `nextjs-runtime-agent`
  - `architecture-guard-agent`
  - `validation-strategy-agent`
  - `implementation-agent`

---

## Before Running

Before starting this workflow, read:

- `AGENTS.md` (repository root) — primary always-applied context; `.zencoder/rules/repo.md` deprecated April 20, 2026.
- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

Repository note:
In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
Do not treat the absence of `middleware.ts` as a finding.

---

## Artifact Execution Rule

For every workflow step:

- the file shown under `Output:` is mandatory
- the active agent must create or overwrite that markdown file
- the artifact file must contain the full result for the step
- the agent must not respond only in chat without writing the artifact
- after writing the artifact, the agent should give only a short completion summary in chat

---

## Leantime Integration

**This workflow must include Leantime steps at task open and close.**

Read: `docs/ai/general/LEANTIME_AUTOMATION.md`

At workflow start, invoke `10 - Leantime Integration Agent` to:

- Check for existing tasks and milestones.
- Create milestone and main task with HTML description.
- Patch status to W toku (4).
- Record task ID in the workflow intake artifact.

At workflow end, invoke `10 - Leantime Integration Agent` to:

- Patch status to Zrobione (0).
- Log time with `pnpm lt -- run time.log`.
- Update wiki if findings should persist.

---

## Workflow Steps

### [x] Step: Incident Intake

<!-- agent: debug-investigation-agent -->

Collect the initial report and environment details.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/4d2961d4-1ae4-4bd6-ad9b-27edba0de3ca/incident-intake.md

Include:

- symptom
- environment
- reproduction steps
- logs or screenshots

---

### [x] Step: Flow Trace Investigation

<!-- agent: debug-investigation-agent -->

Trace the execution path through the system.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/4d2961d4-1ae4-4bd6-ad9b-27edba0de3ca/flow-trace.md

Include:

- entry points
- state transitions
- identity/tenant context
- redirect flow
- likely divergence points

---

### [x] Step: Runtime Behavior Review

<!-- agent: nextjs-runtime-agent -->

Analyze runtime behavior and framework interaction.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/4d2961d4-1ae4-4bd6-ad9b-27edba0de3ca/runtime-review.md

Focus on:

- server vs client boundaries
- server actions
- redirects
- middleware / proxy behavior
- caching / rendering

---

### [x] Step: Architecture Impact Review

<!-- agent: architecture-guard-agent -->

Verify that the suspected fix does not violate architecture rules.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/4d2961d4-1ae4-4bd6-ad9b-27edba0de3ca/architecture-review.md

Confirm:

- module boundaries respected
- DI usage correct
- no security or auth regressions
- runtime placement correct

---

### [x] Step: Remediation Plan

<!-- agent: debug-investigation-agent -->

Define the smallest safe fix.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/4d2961d4-1ae4-4bd6-ad9b-27edba0de3ca/remediation-plan.md

Include:

- change scope
- affected files
- expected behavior change
- risks

---

### [x] Step: Validation Strategy

<!-- agent: validation-strategy-agent -->

Run **Validation Strategy Agent** to determine the minimum safe validation scope for the remediation.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/4d2961d4-1ae4-4bd6-ad9b-27edba0de3ca/validation-strategy.md

Include:

- change risk classification
- minimum required validation
- optional additional validation
- validation not required
- validation commands or checks

---

### [x] Step: Implementation

<!-- agent: implementation-agent -->

Apply the fix and update tests if needed.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/4d2961d4-1ae4-4bd6-ad9b-27edba0de3ca/implementation-report.md

Include:

- files changed
- logic changes
- tests updated

---

### [x] Step: Validation

Run repository validation commands.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/4d2961d4-1ae4-4bd6-ad9b-27edba0de3ca/validation-report.md

Commands:

- pnpm typecheck
- pnpm lint
- pnpm arch:lint
- pnpm test

# Incident Plan — NR Browser Monitoring: Production Not Reporting

**Task ID**: 4d2961d4-1ae4-4bd6-ad9b-27edba0de3ca
**Date**: 2026-04-08
**Status**: ✅ Complete — awaiting deploy verification

## Checklist

- [x] Step 1 — Debug Investigation: Root cause analysis
- [x] Step 2 — Implementation: All fixes applied
- [ ] Step 3 — Validation: Confirm production browser data appears after deploy
- [x] Step 4 — Documentation: Feature doc, AGENTS.md, and plan updated

## Changes Deployed

### Fix 1 — EROFS crash (blocked all NR data on Vercel)

`newrelic.js`: Added `logging.filepath: 'stdout'` — NR agent logs to stdout instead of crashing on read-only `/var/task/` filesystem.

### Fix 2 — NR SPA hook (soft-nav tracking was missing)

`src/instrumentation-client.ts`: `onRouterTransitionStart` now calls both Sentry and `window.newrelic?.interaction()?.setName(url)?.save()` so App Router client-side navigations are tracked in NR Browser.

### Fix 3 — Window type declarations (required for Fix 2)

`src/types/globals.d.ts`: Added `NewRelicBrowserInteraction`, `NewRelicBrowserAgent`, `Window.newrelic?` types.

### Fix 4 — Snippet env vars removed (dead code cleanup)

Removed `NEW_RELIC_BROWSER_SNIPPET` and `NEW_RELIC_BROWSER_SNIPPET_BASE64` and all supporting code:

- `src/core/env.ts`: schema entries removed
- `src/core/observability/new-relic.ts`: `readRawSnippetFromEnvFiles()`, `resolveBrowserSnippetSource()`, `getBrowserSnippetSafe()`, `resolveBrowserAgentScriptSource()` removed; `getBrowserAgentScriptSafe()` simplified to delegate to `getBrowserTimingHeaderSafe()`
- `src/testing/infrastructure/env.ts`: stale mock defaults removed
- `.env.example`: snippet var entries removed
- `.env.local`: commented snippet vars removed
- `AGENTS.md`: code examples and references updated
- `docs/features/26 - New Relic Server & Browser Integration.md`: section rewritten

### Fix 5 — Diagnostic logging

`src/app/observability/new-relic-browser.js/route.ts`: Logs `[NR Browser] Returning empty browser script.` with `{ agentLoaded, agentConnected }` when the snippet is empty (only when `NEW_RELIC_ENABLED=true`).

## Remaining User Action Required

**In NR UI**: Verify production entity `nextjs-16-boilerplate` has browser monitoring **enabled** and set to **Pro + SPA** (APM → Applications → nextjs-16-boilerplate → Settings → Application).

After deploying, check Vercel production logs for `[NR Browser]` warn — `agentConnected: false` indicates cold start timing; `agentConnected: true` means browser monitoring not enabled in NR UI.
