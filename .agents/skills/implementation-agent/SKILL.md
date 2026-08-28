---
name: implementation-agent
description: Implementation specialist for this repository. Use when code should be changed after the relevant architecture, security, runtime, and validation constraints are established, including focused patches, test updates, and small supporting-file wiring. Do not use this skill to re-decide unresolved architecture, trust-boundary, runtime, or validation policy.
---

# Implementation Agent

Implement the smallest correct production-grade change inside already-established repository guardrails.

This skill owns concrete code edits, test updates, focused validation, and required supporting-file wiring. It does not own architecture, security policy, Next.js runtime semantics, or validation strategy.

## Context Loading

Inherit active repository invariants from `AGENTS.md`.

Do not preload full copies of:

- `docs/ai/general/00 - Agent Interaction Protocol.md`;
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`;
- `docs/ai/general/IMPLEMENTATION_ANTI_PATTERNS.md`;
- `docs/ai/general/04 - Implementation Agents.md`;
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`.

Before editing:

1. Inspect the live affected code and identify the owning module/layer and changed runtime or trust boundaries.
2. Confirm that required architecture, security, and runtime decisions are established. Reuse any validation constraints already defined by the parent workflow; do not require a separate Validation Strategy pass when the minimum validation scope is intentionally determined after implementation.
3. Retrieve only the neutral role and applicable implementation, database,
   script, runtime, security, and validation pattern sections relevant to the
   actual change.
4. Classify each changed surface before loading detailed implementation/security guidance.
5. If applicability of a mandatory rule is uncertain, search the relevant catalogue by concept/rule ID and expand context until the uncertainty is resolved. Do not guess.

Use targeted context by change shape:

- normal JSON App Router route handler → ResponseService / `with-error-handler` guidance; UUID-param rules when UUID path segments exist; redirect rules when redirect-style inputs exist;
- auth, Clerk/AuthJS, bootstrap, onboarding, tenant/org, or trust-boundary change → relevant `AUTH_FLOW_ANTI_PATTERNS.md` sections plus applicable Security/Auth rules; do not implement if security constraints are unresolved;
- Next.js runtime placement, caching, RSC, route-handler runtime, server action, or `src/proxy.ts` behavior → use established `nextjs-runtime` constraints; route back to that specialist if the decision is unresolved;
- Drizzle adapter/repository or schema-sensitive persistence change → relevant schema/DB-adapter patterns, including required `*.db.test.ts` guidance;
- script/tooling or E2E helper using filesystem/env/network access → relevant script patterns and SEC rules for path confinement, env handling, and outbound URL validation;
- external HTTP adapter → relevant HTTP-safety rules and MSW adapter-test pattern;
- React/UI state or handlers → relevant sparse-state, finite-schema, and async-handler rules;
- DI/unit-test mocks → relevant `Map<symbol, unknown>` and `vi.Mocked<Interface>` guidance;
- Playwright-required behavior → relevant E2E rules and scenario-runner guidance only when browser validation is actually needed.

Use `IMPLEMENTATION_ANTI_PATTERNS.md` by affected category or suspected pattern. Read it in full only for a broad implementation-shape audit or when targeted retrieval cannot safely determine applicable anti-patterns.

`SECURITY_CODING_PATTERNS.md` remains mandatory semantic authority for all applicable rules. Load relevant rule IDs/sections by the actual sink or trust boundary; expand to broader/full catalogue context only when necessary to determine applicability safely.

## Artifact-Backed Work

For work under `.copilot/tasks/{task_id}/`:

- read the current control artifacts needed to execute the approved change, normally `plan.md`, `intake.md`, `constraints.md`, and `implementation-plan.md` when present;
- read specialist summaries only when they contain constraints relevant to the implementation;
- create or update exactly one `04 - Implementation Agent - Summary.md`;
- use the matching specialist-summary template;
- update the same summary on later runs rather than creating duplicates;
- keep control artifacts synchronized when implementation materially changes task status or confirmed scope.

Do not load unrelated historical task artifacts.

## Implementation Contract

Always:

- inspect live code before editing;
- implement only what is required for the confirmed task;
- preserve module ownership and dependency direction;
- preserve public APIs unless an intentional contract change is approved;
- preserve centralized security enforcement and server/client boundaries;
- prefer existing repository abstractions, utilities, and dependencies;
- prefer a narrow reviewable diff over cleanup or speculative refactoring;
- keep DB-backed truth authoritative where the repository already depends on it;
- surface blockers or contradictory constraints instead of improvising around them.

Never:

- move business logic into `src/shared/*`;
- move security-critical enforcement into client components;
- use `src/proxy.ts` as the only protection for sensitive operations;
- introduce provider-specific concepts into core contracts;
- bypass the owning module for convenience;
- fix only a build/deploy stage while leaving a required deployed runtime env contract incorrect;
- widen scope with unrelated cleanup;
- weaken tests, validation, authorization, tenancy isolation, or defensive controls to make the patch pass.

## High-Value Mandatory Patterns

Apply these when their code shape is present:

- normal JSON App Router handlers use shared `response-service.ts` helpers plus `with-error-handler.ts`; a protocol-specific exception must be recorded in the repository's existing guard/exemption mechanism with its reason;
- sanitize forwarded redirect-style inputs with `sanitizeRedirectUrl()`;
- validate App Router UUID path params with `z.uuid()` or the existing UUID schema before DB/repository/mutation use; use only parsed data and add a malformed-ID `400` regression test proving DB/repository/mutation calls are not reached;
- use `Map<symbol, unknown>` for DI mock token resolution;
- use `Partial<Record<string, T>>` or `Map<string, T>` for genuinely sparse dynamic state;
- wrap Promise-returning JSX handlers with `void` at the JSX boundary while retaining real error handling;
- use `vi.Mocked<Interface>` object mocks instead of repeated unbound method references;
- use typed finite schemas such as `z.enum(...)` for finite domain options;
- use explicit `Record<AllowedKeys, fn>` dispatch or `switch` instead of dynamic method dispatch;
- use `Object.entries()` / `Object.fromEntries()`, `Map`, or explicit helpers instead of repeated dynamic object mutation chains in runtime helpers;
- resolve dynamic filesystem paths with `path.resolve()` and enforce confinement at the sink; prefer shared reviewed fs wrappers when the same pattern repeats;
- parse and validate protocol/hostname before passing env-derived or user-controlled URLs to HTTP clients;
- never use `Math.random()` for security-sensitive values;
- fail fast when deployed runtime configuration is required instead of masking it with a build-only fallback.
- for user-controlled plain-object lookups, do not treat `key in object` as
  sufficient authorization to read the value; use `Object.hasOwn`, a
  null-prototype record, or `Map` before lookup;
- do not treat a successful action-level ABAC/RBAC check as authorization for a
  client-supplied tenant or resource scope; derive scope from the server-verified
  access context and reject mismatches unless an explicitly established
  unscoped platform-admin path applies;

These bullets are a fast local guardrail, not a replacement for more specific applicable SEC rules.

## High-Risk Implementation Protocol

Apply only to high-risk work; do not run for routine low-risk changes. A change is high-risk when it materially involves production-facing tooling; security/auth/trust boundaries; credentials or remote connections; persisted evidence, integrity, approval, or compatibility artifacts; migrations or data safety; tenancy/resource isolation; CI/deployment safety gates; external-tool semantics load-bearing for a correctness/security claim; or a broad refactor where preserving existing behavior is itself the main invariant.

- **Pre-code invariant/trust-boundary map.** Before writing high-risk code, trace each invariant the change introduces or touches: source/input -> validation -> authoritative enforcement -> side effect -> persisted representation -> later consumer/compatibility -> logs/errors/docs. Classify relevant values as trusted, untrusted, secret, or safe-printable where useful. Keep the map proportional — a compact internal plan, not a permanent artifact — so the complete affected contract is discovered before implementation, not one review finding at a time.
- **Pre-close falsification pass.** Before declaring high-risk implementation complete, actively try to break the invariants just changed: malformed/runtime-untrusted input, missing/extra/duplicate state, alternate environment/tenant/target, stale/persisted state, ordering/concurrency changes, partial failure, failure before/after a dangerous side effect, producer/consumer compatibility, disclosure through errors/logs/docs, and external-tool behavior the safety proof depends on — apply the applicable classes, not all mechanically on every task. Fix and regression-cover any real gap found before completion.
- **External-tool evidence rule.** When a high-risk claim depends materially on the actual semantics of Git, a database client, the filesystem, a parser/runtime, or CI/deployment tooling, mocked tests alone are not sufficient evidence for that claim when a narrow real-behavior test is practical (a disposable repository for Git state, a real test database for transaction semantics). Match the test to the load-bearing assumption; this is not a directive to integration-test everything, and a pure internal function stays fine with a unit test.
- **Review-fix invariant rule.** When addressing substantive review feedback, do not patch only the cited line: state the invariant the finding protects, inspect sibling producers/consumers/helpers sharing that invariant, identify the smallest applicable adjacent-negative-case matrix, fix the invariant, regression-test the reported failure plus meaningful adjacent paths, then rerun the falsification pass on the changed contract before requesting another review. Distinguish an executable/security finding from a behavior/documentation-contract finding from a cosmetic/bookkeeping finding, and scale review depth accordingly.

## Change-Specific Repository Patterns

Retrieve the relevant section of `docs/ai/general/04 - Implementation Agents.md` when the change touches one of these established production patterns:

- UUID-vs-text persistence identifiers;
- required `*.db.test.ts` coverage for Drizzle adapters;
- MSW handlers for external HTTP adapters;
- `isMain` guards for exported side-effectful scripts;
- `load-env.ts` requirements for `tsx` scripts;
- `vi.mock('next/server')` with standalone `vi.importActual()`;
- `event.preventDefault()` in global browser error handlers that fully own the error;
- AuthJS E2E provisioning that must cover incomplete onboarding state.

Do not load unrelated pattern sections.

## Validation

Use focused validation during implementation and expand with risk.

- Update/add tests at the level that can falsify the changed behavior.
- Do not treat mocked/unit-only evidence as sufficient for a schema-, runtime-, security-, or cross-layer risk.
- For substantial phase close, run repo-wide `pnpm lint --fix` (never plain `pnpm lint`) and `pnpm typecheck`.
- Before reporting implementation complete, lint the changed JS/TS files (targeted, not repo-wide) and confirm no new ESLint errors or warnings versus the pre-change baseline.
- Fix each finding on a changed file, or report it explicitly as a verified false positive/pre-existing finding — never leave it unaddressed or silence it with a new suppression or disabled rule.
- For Playwright where scenario env/DB setup matters, use `node scripts/e2e/run-scenario.mjs ...` or a package script built on it, not raw `playwright test`.
- `E2E_BACKEND_MODE=container` means the isolated test DB profile `127.0.0.1:5433/app_test`.
- Use `--reporter=line` for interactive Playwright terminal evidence.
- For focused AuthJS auth-flow regressions, prefer `pnpm e2e:authjs:core`; do not sign off onboarding fixes without an incomplete-user path.
- If validation cannot be run, report exactly what was not run and why.

Inspect the final diff before completion and verify only intended changes are present.

## Response

At implementation close, report:

1. solution;
2. files changed;
3. behavior change;
4. validation performed;
5. residual risks or follow-up.

Keep the close-out concrete and proportional to the task.

## Source and Compatibility

`docs/ai/general/04 - Implementation Agents.md` remains the neutral cross-tool role source.
`docs/ai/general/IMPLEMENTATION_ANTI_PATTERNS.md` remains the repository anti-pattern authority.
`docs/ai/general/SECURITY_CODING_PATTERNS.md` remains the security coding authority.

They remain semantic authorities. For Codex, the `Context Loading` rules in this skill control retrieval: use targeted sections/rules instead of legacy mandatory full-file startup reads. This changes context-loading mechanics, not shared implementation or security semantics.

If shared role semantics or mandatory patterns change, propagate the semantic change to required cross-tool surfaces according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary implementation work.

## Task Lifecycle

Follow the repository task lifecycle from the root instructions.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.
