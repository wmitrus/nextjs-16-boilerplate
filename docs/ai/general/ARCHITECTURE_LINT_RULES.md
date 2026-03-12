# Architecture Lint Rules

## Purpose

These rules define the repository-specific architecture lint baseline for this codebase.

They are used by:

- `scripts/architecture-lint.sh`
- AI agents
- manual architecture review
- PR governance

Repository code is the source of truth.
If docs and code differ, trust code and report the drift.

This lint layer is intentionally practical:

- strict on clear dependency and provider-boundary violations
- explicit about approved exceptions
- warning-oriented for repo-known architectural smells that still need human review

---

## Repository model verified in code

Current top-level source layout:

- `src/app` = delivery and framework entrypoints
- `src/core` = contracts, DI container, env, logger, stable foundation
- `src/features` = product-facing feature composition
- `src/modules` = isolated business and provider modules
- `src/security` = centralized security runtime and enforcement
- `src/shared` = neutral reusable building blocks
- `src/testing` = test infrastructure

Expected dependency direction:

- `app -> features/modules/security/shared/core`
- `features -> modules/security/shared/core`
- `modules -> shared/core`
- `security -> shared/core`
- `shared -> core`
- `core` must not depend on `app/features/security/modules`

Approved exception:

- composition-root registration inside `src/core/container/*`

Repo-specific realities encoded into linting:

- Clerk usage is currently allowed only in:
  - `src/modules/auth/**`
  - `src/proxy.ts`
  - delivery/UI integration boundaries under `src/app/**` for Clerk UI/provider wiring
  - test and testing-support files
- global `container` usage in request-sensitive flows exists today and is treated as a warning smell, not a hard failure, so the linter stays usable on the current baseline
- `src/core/logger/di.ts` is an intentional global container integration point and is not treated as a request-sensitive container smell

---

## Severity model

- `CRITICAL`: must fail lint
- `MAJOR`: should fail lint when detectable with low false-positive risk
- `WARNING`: should be surfaced for review but not fail on the current baseline
- `INFO`: documentation-only or review-oriented signal

---

## Rule A1 - Core reverse dependency ban

Forbidden inside `src/core/**`:

- imports from `src/app/**`
- imports from `src/features/**`
- imports from `src/security/**`
- imports from `src/modules/**`

Allowed exception:

- `src/core/container/**` may import module registrars for composition-root registration

Current repo exception encoded:

- only `src/core/container/**` is excluded from this check

Severity:

- `CRITICAL`

---

## Rule A2 - Shared neutrality

Forbidden inside `src/shared/**`:

- imports from `src/app/**`
- imports from `src/features/**`
- imports from `src/modules/**`
- imports from `src/security/**`

Shared code must remain neutral:

- no authorization decisions
- no tenancy ownership logic
- no business policy logic
- no provider SDK usage

Allowed:

- imports from `src/core/**`
- shared-local imports
- neutral UI, hooks, utility, type, and API helper code

Severity:

- direct forbidden imports: `CRITICAL`
- suspected domain/security logic leakage: `WARNING` unless proven by review

---

## Rule A3 - Modules isolation

Forbidden inside `src/modules/**`:

- imports from `src/app/**`
- imports from `src/features/**`
- imports from `src/security/**`

Allowed:

- `src/core/**`
- `src/shared/**`
- module-local imports

Rationale:

- modules must not depend on delivery or security runtime details

Severity:

- `CRITICAL`

---

## Rule A4 - Security direct coupling ban

Forbidden inside `src/security/**`:

- imports from `src/app/**`
- imports from `src/features/**`
- imports from `src/modules/**`

Expected pattern:

- security consumes contracts and security-owned abstractions
- delivery/runtime composition may wire security to modules, but security itself must not reach back into modules directly

Severity:

- `CRITICAL`

---

## Rule A5 - Provider isolation

Provider SDK usage must stay inside approved boundaries.

Currently approved Clerk boundaries:

- `src/modules/auth/**`
- `src/proxy.ts`
- auth/delivery UI wiring under `src/app/**`
- test files and `src/testing/**`

Forbidden:

- provider SDK imports in `src/core/**`
- provider SDK imports in `src/shared/**`
- provider SDK imports in `src/modules/authorization/**`
- provider SDK imports in `src/security/**`
- provider SDK imports in unrelated feature modules

Severity:

- `CRITICAL`

---

## Rule A6 - Suspicious global container usage in request-sensitive flows

Flag global container usage in:

- server actions
- route handlers
- auth-sensitive page/layout logic
- tenant-sensitive flows

Patterns of interest:

- `container.resolve(...)`
- `container.register(...)`
- broad service-locator usage instead of request-scoped composition

Current repo treatment:

- warning-only by default, because current baseline includes known cases such as onboarding
- request-scoped `createContainer()` usage is not itself a smell and should not be flagged as a violation
- `src/core/logger/di.ts` is an approved global logger integration point

Severity:

- `WARNING`
- escalate to `MAJOR` or `CRITICAL` in review when auth/tenant/runtime guarantees are weakened

---

## Rule A7 - Domain logic leakage outside owned layers

Flag:

- business policy logic in `src/app/**`
- business policy logic in `src/shared/**`
- authz/tenant decisions in generic UI components

This is only partially automatable.
The script may surface suspicious files by pattern, but human review is required.

Severity:

- `WARNING`
- escalate in review if enforcement or ownership is clearly broken

---

## Rule A8 - Runtime-sensitive architecture smells

Flag:

- server-only imports inside `'use client'` files
- node-only imports in `src/proxy.ts` or `src/security/middleware/**`
- middleware/proxy assumed to be the sole protection for sensitive server operations
- cache-sensitive auth/tenant behavior that lacks explicit handling

Automatable subset in the script:

- client components importing clearly server-only modules
- edge-sensitive files importing obvious node-only modules

Severity:

- detectable hard violations: `MAJOR`
- broader runtime smell assessment: specialist review required

---

## Rule A9 - Docs vs code drift classification

Docs are allowed to drift, but the drift should be classified explicitly.

Categories:

- wording drift
- stale file reference
- stale flow description
- architecture drift

Lint script behavior:

- does not fail on docs drift by default
- rules document should record known drift classes when relevant

Current known drift relevant to linting:

- some prompts may refer to `docs/ai/AGENT_PROTOCOL.md` or `docs/ai/00 - Agent Interaction Protocol.md`, but the live canonical file is `docs/ai/general/00 - Agent Interaction Protocol.md`

Severity:

- `INFO` to `MAJOR` depending on impact

---

## Rule A10 - Low blast radius principle

Flag changes that:

- cross multiple layers without clear need
- combine behavioral changes with broad cleanup
- add unnecessary abstractions
- widen coupling

This is primarily a review rule, not a strict script rule.

Severity:

- `WARNING`

---

## Script scope

`scripts/architecture-lint.sh` is expected to enforce or surface at least:

- core reverse dependency violations
- shared neutrality violations
- modules isolation violations
- security direct coupling violations
- provider leakage outside approved boundaries
- suspicious global container usage in request-sensitive flows
- obvious client/server and edge/node architecture smells
- existing graph/cycle checks through repository commands where practical

The script should stay readable, explicit, and maintainable.
