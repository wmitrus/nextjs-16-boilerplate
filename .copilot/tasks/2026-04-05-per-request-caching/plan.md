# Task Plan: Per-Request DI Container Caching + New Relic Observability

**Task ID**: `2026-04-05-per-request-caching`
**Status**: ✅ Complete — Implemented And Validated
**Created**: 2026-04-05
**Approved**: 2026-04-05 (user)

---

## Objective

1. Introduce request-scoped memoization of the application DI container using `React.cache()` so all RSCs in the same render pass share one Container instance (Layer 1).
2. Integrate New Relic Node.js agent with targeted custom spans for DI container creation, identity/tenant resolution, and authorization/provisioning boundaries.
3. Layer 2 (read-model memoization helpers) — **deferred** to a future task after Layer 1 is validated.

---

## Classification

| Dimension        | Value                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| Type             | Infrastructure feature + Observability integration                               |
| Blast radius     | Medium — `getAppContainer()` has many call sites; wrapper pattern minimizes risk |
| Risk level       | Low — transparent wrapper; New Relic is opt-in via env var                       |
| Runtime target   | Node.js (RSC render path + instrumentation hook)                                 |
| Demo page needed | No                                                                               |
| Auth impact      | None                                                                             |
| Security impact  | None                                                                             |
| E2E required     | No                                                                               |

---

## Design Decisions (Approved)

| Decision                  | Choice                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| Mechanism                 | `React.cache()` wrapper                                                                  |
| Primary cached target     | DI Container itself                                                                      |
| Server Actions            | Fresh per invocation                                                                     |
| Edge runtime              | Unchanged                                                                                |
| Demo page                 | None                                                                                     |
| Layer 2                   | **Deferred**                                                                             |
| New Relic                 | Added to scope — free plan, Node.js agent, targeted spans                                |
| NR custom spans           | `di.container.create` only                                                               |
| NR attributes (not spans) | `container.created`, `container.instance_id`, `request.cache.scope`, `execution.context` |

---

## Workflow Steps

- [x] **Step 1 — Feature Intake** · `feature-intake.md`
- [x] **Step 2 — Architecture Design** · `architecture-review.md`
- [x] **Step 3 — Security Review** · _Skipped — no auth/tenancy surface_
- [x] **Step 4 — Runtime Review** · `runtime-review.md`
- [x] **Step 5 — Feature Constraints** · `constraints.md`
- [x] **Step 6 — Validation Strategy** · `validation-strategy.md`
- [x] **Step 7 — Implementation** · Code verified in repository
- [x] **Step 8 — Validation Run** · Final typecheck, lint, and targeted test evidence captured on 2026-04-05
- [x] **Step 9 — E2E Verification** · ⏭️ Skipped — infrastructure-only, no user-visible behavior
- [x] **Step 10 — Final Architecture Check** · Completed via `01 - Architecture Guard - Summary.md`

---

## Artifact Trail

| Artifact                 | Status                                                           |
| ------------------------ | ---------------------------------------------------------------- |
| `plan.md`                | ✅                                                               |
| `feature-intake.md`      | ✅                                                               |
| `architecture-review.md` | ✅                                                               |
| `runtime-review.md`      | ✅                                                               |
| Security review          | ⏭️ Skipped                                                       |
| `constraints.md`         | ✅                                                               |
| `validation-strategy.md` | ✅                                                               |
| `implementation-plan.md` | ✅                                                               |
| Implementation report    | ✅ Not required — implementation verified directly in repository |
| `validation-report.md`   | ✅                                                               |

---

## Current Status

**The repository code now implements per-request container caching and the New Relic browser follow-up. New Relic UI suggestions for uninstrumented third-party hosts were reviewed and intentionally rejected for this task. Final validation evidence was captured on 2026-04-05 and the task is closed.**

## New Relic Suggestion Review

Decision: **Do not add new instrumentation for the reviewed New Relic suggestions in this task.**

Reviewed suggestions intentionally ignored:

| Suggestion                              | Decision       | Reason                                                                                                                                 |
| --------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `api.logflare.app`                      | Ignore         | Log shipping sink; instrumentation would add observability-on-observability noise rather than business signal                          |
| `o4508840267612160.ingest.de.sentry.io` | Ignore         | Error telemetry sink; same low-signal issue as Logflare                                                                                |
| `api.clerk.com`                         | Ignore         | Provider-owned auth traffic should remain isolated behind auth boundaries, not instrumented as raw vendor HTTP                         |
| `communal-cub-55514.upstash.io`         | Ignore for now | Remote host is vendor-owned; only app-level rate-limit spans would be justified, and that is out of scope for this task                |
| `cdn.growthbook.io`                     | Ignore for now | Feature-flag provider traffic could justify targeted app-level spans, but broadening observability scope is out of scope for this task |

Accepted rule: instrument **app-owned boundaries** only. Do not add host-level instrumentation for vendor sinks or third-party SaaS endpoints unless a separate task justifies the operational value and defines the right contract-level span shape.
