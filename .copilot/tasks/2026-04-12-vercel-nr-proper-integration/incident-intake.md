# Incident Intake

**Task ID**: 43 (Leantime)
**Task Workspace**: `.copilot/tasks/2026-04-12-vercel-nr-proper-integration/`
**Date**: 2026-04-12
**Workflow**: Incident Investigation Workflow
**Status**: in_progress

---

## Symptom

New Relic telemetry (backend APM transactions, browser monitoring, custom attributes) is absent from Vercel preview and production deployments. Two prior remediation attempts have failed:

1. **Attempt 1** (`2026-04-05-nr-browser-spa`): Browser SPA snippet approach via env var — rejected because the NR Browser SPA snippet is ~88 KB, exceeding Vercel's 64 KB per-variable limit.
2. **Attempt 2** (`2026-04-08-vercel-newrelic-incident`): Preloading the agent via `NODE_OPTIONS=-r newrelic` — documented as **rejected** because it crashes the remote preview build before dependencies are installed. Repo-local preload file paths are not resolved reliably by Vercel's remote builder bootstrap.

Current observed behavior on Vercel:

- `/observability/new-relic-browser.js` returns `200` with **empty body**
- No fresh `Transaction`, `PageView`, or `BrowserInteraction` events in New Relic since recent Vercel deploys
- Backend APM also produces no fresh transactions from Vercel
- Historical NR entities remain (`nextjs-16-boilerplate`, `nextjs-16-boilerplate-preview`, `nextjs-16-boilerplate-local`)
- Local development connects to NR successfully and reports to account `6443682`

---

## Environment

| Property              | Value                                                 |
| --------------------- | ----------------------------------------------------- |
| Platform              | Vercel (preview + production)                         |
| Runtime               | Node.js 24, Next.js 16 (Turbopack)                    |
| NR Agent package      | `newrelic` npm (version from package.json)            |
| NR Account            | `6443682`                                             |
| Prior task (browser)  | `.copilot/tasks/2026-04-05-nr-browser-spa/`           |
| Prior task (incident) | `.copilot/tasks/2026-04-08-vercel-newrelic-incident/` |

---

## Official Documentation Reference

**URL reviewed**: https://docs.newrelic.com/docs/logs/forward-logs/vercel-integration/

**Summary of official approach**:

The New Relic Vercel Integration uses **Vercel Log Drains** (not the Node.js APM agent). Steps:

1. Open the Vercel New Relic integration page and click "Add integration"
2. Connect the Vercel account
3. Select which projects to send logs from
4. Allow permissions (read and write for log drains)
5. Set the New Relic license key in the integration settings

**Optional (Beta)**: OpenTelemetry traces from Vercel functions — toggled on in the "Traces (Beta)" section of the configuration dialog.

**Post-setup**: Install the Vercel quickstart dashboard in New Relic Instant Observability for pre-built dashboards and alerts.

---

## Key Architectural Gap

The current repository integration and the official Vercel integration are **fundamentally different**:

| Concern                 | Current Repo Approach                               | Official Vercel Integration                   |
| ----------------------- | --------------------------------------------------- | --------------------------------------------- |
| Bootstrap               | `require('newrelic')` in `instrumentation.ts`       | Vercel log drain (no agent needed)            |
| Log forwarding          | stdout logs captured by Vercel, not forwarded to NR | Log drain sends logs to NR Logs automatically |
| APM transactions        | NR Node.js agent (broken on Vercel)                 | Not part of log drain integration             |
| Browser monitoring      | `getBrowserTimingHeader()` via APM agent            | Not part of log drain integration             |
| Distributed traces      | APM agent traces                                    | OpenTelemetry (Beta) via Vercel integration   |
| `NODE_OPTIONS` required | Yes (fails on Vercel)                               | No                                            |

---

## What the Vercel Integration Does NOT Provide

- APM-style transaction tracing (requires Node.js agent with proper preload)
- `getBrowserTimingHeader()` browser injection (requires connected APM agent)
- Custom NR attributes via `addCustomAttribute()` (requires Node.js agent)
- DI container span tracking via `startSegment()` (requires Node.js agent)

---

## Reproduction Steps

1. Deploy to Vercel with current `NEW_RELIC_ENABLED=true` and `NEW_RELIC_LICENSE_KEY` set
2. Observe `/observability/new-relic-browser.js` returns empty body
3. Check Vercel function logs for `[New Relic] Server init loaded connected=false`
4. Check NR account for new Transaction/PageView events — none arrive

---

## Open Questions (Decision Points)

These require user input before the remediation plan can be finalized:

1. **Telemetry goal**: Is the primary goal **log forwarding** (simpler, Vercel-native), **APM transaction tracing** (more complex, agent-dependent), or **both**?

2. **Browser monitoring**: If the APM agent can't be reliably preloaded on Vercel, should browser monitoring be reconsidered (e.g., via the NR Browser standalone agent snippet)?

3. **OpenTelemetry**: Is the OpenTelemetry traces (Beta) option acceptable, or is production APM tracing required?

4. **Scope of change**: Is this investigation limited to making the official Vercel integration work (log drains + optional OTel), or should it also attempt to resolve APM agent preloading via a documented Vercel workaround?

---

## Current Files Involved

| File                                                           | Role                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/instrumentation.ts`                                       | Registers NR agent via `require('newrelic')` at Node bootstrap                           |
| `src/monitoring/server-init.ts`                                | Validates NR enabled/license state, logs diagnostics                                     |
| `src/core/observability/new-relic.ts`                          | Facade: `getBrowserTimingHeaderSafe()`, `withContainerCreationSpan()`, custom attributes |
| `src/app/observability/new-relic-browser.js/route.ts`          | Serves browser loader at request time                                                    |
| `newrelic.js`                                                  | NR agent config (app_name, license_key, logging to stdout)                               |
| `src/core/env.ts`                                              | T3-Env schema: `NEW_RELIC_ENABLED`, `NEW_RELIC_LICENSE_KEY`                              |
| `.env.example`                                                 | Documents `NODE_OPTIONS=` (blank), `NEW_RELIC_*` vars                                    |
| `docs/features/26 - New Relic Server & Browser Integration.md` | Design doc: constraints and guardrails                                                   |
