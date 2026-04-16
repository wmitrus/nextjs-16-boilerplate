# Vercel New Relic Incident Plan

- Task ID: 42
- Milestone ID: 41
- Date: 2026-04-08
- Status: in_progress

## Objective

Restore New Relic backend and browser telemetry for Vercel preview and production, identify the real regression chain, and land the minimum safe remediation with evidence.

## Investigation Notes

- Local New Relic agent connects successfully and reports to account `6443682`.
- Vercel preview and production currently serve an empty `/observability/new-relic-browser.js`.
- New Relic shows older events for preview and production, but no fresh `Transaction`, `PageView`, or `BrowserInteraction` events after the recent deployment window.
- The hosted failure spans preview `v1.22.0` and production `v1.23.0`, so the incident is not explained only by the later browser-fallback cleanup.
- The confirmed bootstrap issue is missing hosted preload of the Node agent: Next.js/Vercel should run with `NODE_OPTIONS=-r newrelic` when New Relic is enabled.

## Working Sequence

- Open Leantime milestone/task and record IDs here.
- Confirm the regression window from repo history, Vercel deployments, and New Relic event timelines.
- Validate the New Relic agent/browser-header behavior against official documentation and local package code.
- Implement the smallest safe fix and improve diagnostics where needed.
- Run focused verification and close the Leantime task with time logging.
