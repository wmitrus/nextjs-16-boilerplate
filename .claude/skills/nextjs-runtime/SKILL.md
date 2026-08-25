---
name: nextjs-runtime
description: Next.js runtime review specialist for this repository. Use whenever work involves App Router behavior, Server/Client Component placement, route handlers, server actions, request interception in `src/proxy.ts`, caching/revalidation, Cache Components, request-time vs build-time behavior, Edge/Node constraints, Vercel runtime assumptions, instrumentation, or server/client environment exposure.
---

# Next.js Runtime

Protect framework/runtime correctness for this repository's Next.js App Router.

This skill owns Next.js runtime semantics and placement. It does not own broad modular-monolith architecture or security policy, but it must preserve established security constraints at runtime boundaries.

## Context Loading

Inherit active repository invariants from `CLAUDE.md`.

Do not preload full copies of:

- `AGENTS.md`;
- `docs/ai/general/00 - Agent Interaction Protocol.md`;
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`;
- `docs/ai/general/03 - Next.js Runtime Agent.md`;
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`.

Before concluding:

1. Inspect the affected live runtime code.
2. Inspect `next.config.ts` when caching/rendering/runtime configuration can affect the answer.
3. Inspect `package.json` and, when exact framework behavior depends on the resolved patch version, the lockfile or installed package metadata.
4. Classify the affected boundary: Server/Client Component, route handler, server action, proxy, cache/rendering, instrumentation, env exposure, or deployment runtime.
5. When `src/proxy.ts` is affected, inspect matcher behavior, request/response header propagation, rewrites/redirects, request-scoped behavior, and Proxy runtime compatibility.
6. Retrieve only the relevant `AGENTS.md`, Runtime Agent, security, auth-flow, or validation sections for that boundary.
7. For version-sensitive framework behavior, verify against version-appropriate official Next.js documentation or repository runtime evidence instead of relying on remembered framework behavior.
8. Expand to broader/full runtime source only when targeted context cannot safely resolve the runtime question.

Repository code/config and observed runtime behavior are authoritative. If a neutral prompt or historical rule conflicts with current live config or version-matched framework behavior, report the drift rather than silently preserving a stale assumption.

## Live Repository Runtime Facts

- The repository uses Next.js 16; verify the exact resolved version when patch-level behavior matters.
- Middleware-style request interception lives in `src/proxy.ts`. Do not treat absence of `middleware.ts` as a finding.
- `next.config.ts` currently derives `cacheComponents` from the CSP build mode:
  - cache-compatible/default build → Cache Components enabled;
  - `CSP_SCRIPT_MODE=nonce-dynamic` build → Cache Components disabled.
- Never assume Cache Components are enabled or disabled without checking the active build/config context when that distinction affects the answer.
- In Next.js 16, `src/proxy.ts` uses the Node.js Proxy runtime; the `runtime` config option is not available in Proxy files. Do not carry historical Middleware/Edge assumptions into Proxy review.

### Route Segment Config

When `cacheComponents` is enabled, do not introduce App Router Route Segment Config options that Next disables under the Cache Components model, including `dynamic`, `runtime`, `revalidate`, or `fetchCache`.

Treat `export const dynamic` / `export const runtime` under an active Cache Components build as a blocking runtime error.

When `cacheComponents` is disabled, do not carry the Cache-Components ban over mechanically. Route Segment Config semantics become available again, but do not add or change them unless the task requires it and current Next.js behavior plus repository conventions justify the choice.

### Request-Time Rendering and `connection()`

Use `connection()` when code must defer to an incoming request and no already-required Dynamic API establishes request-time execution.

For async RSC paths that call `getAppContainer()`:

- establish request-time access before the container/infrastructure call;
- use `await connection()` when the component does not otherwise need a request-bound API;
- if `headers()`, `cookies()`, or page `searchParams` are genuinely required, their request-time access can establish the boundary instead;
- do not add `connection()` merely as ceremony when an existing required Dynamic API already provides the request boundary.

Place the request-time boundary before non-deterministic/request-sensitive/container work that must not execute during prerendering.

Do not use `connection()` inside cached scopes where current Next.js caching semantics prohibit it.

### New Relic Browser Injection

Do not pass `allowTransactionlessInjection: true` to `nr.getBrowserTimingHeader()`.

Preserve the repository's connected-agent/transaction-aware browser timing-header pattern. Treat reintroducing transactionless injection as a runtime regression.

Retrieve the neutral Runtime Agent's New Relic section when modifying this code path.

## Auth-Flow Runtime Changes

For Clerk/bootstrap/onboarding/auth-routing work, including auth middleware/proxy behavior or post-auth routing:

1. read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`;
2. read `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`;
3. use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory checklist for affected scenarios;
4. preserve already-working scenarios;
5. do not mark the runtime change complete until affected required scenarios are checked or explicitly blocked/deferred.

Do not load the auth-flow corpus for unrelated runtime work.

## Security-Sensitive Runtime Boundaries

For redirects, proxy behavior, route handlers, server actions, sensitive caching, or server/client data exposure, retrieve the applicable Security/Auth constraints and SEC rules.

For `redirect_url` or equivalent forwarded redirect-style input, retrieve and apply the relevant redirect rules, especially SEC-02/SEC-03, and require `sanitizeRedirectUrl()` at the established intake/forwarding boundary.

Do not let runtime convenience weaken server-side authorization or tenant isolation.

## Artifact-Backed Work

For work under `.copilot/tasks/{task_id}/`:

- read only the current control artifacts and specialist outputs relevant to the runtime decision;
- create or update exactly one `03 - Next.js Runtime - Summary.md`;
- use the matching specialist-summary template;
- update the same summary on later runs rather than creating duplicates;
- keep `plan.md` and `intake.md` synchronized when runtime review changes task direction or confirmed constraints.

Do not load unrelated historical task artifacts.

## Review Contract

Explore read-only first.
Do not implement unless the user explicitly asks for implementation.

Always reason about:

1. App Router behavior;
2. Server vs Client Component boundaries;
3. server actions;
4. route handlers;
5. proxy responsibilities;
6. caching/revalidation and static/request-time behavior;
7. Edge vs Node compatibility;
8. Vercel/runtime deployment assumptions;
9. server/client bundle and environment exposure;
10. instrumentation when relevant.

Do not approve runtime behavior based on framework folklore or a historical repository prompt when live config, code, build evidence, or current official docs say otherwise.

## Hard Runtime Guardrails

Always flag or block:

- server-only utilities leaking into Client Components or client bundles;
- client-only hooks used in Server Components;
- sensitive logic moved client-side without an established need;
- non-public environment variables referenced by client-executed code;
- auth-/tenant-sensitive data cached or reused across scopes without proof of isolation;
- route handlers or server actions relying on `src/proxy.ts` as the sole protection for sensitive operations;
- mutating server actions that omit the server-side input validation or established identity/permission enforcement required at their boundary;
- node-only APIs imported into code that actually executes in an incompatible runtime;
- imports that unintentionally change runtime compatibility;
- request-time code assumed to be build-time safe, or build-time behavior assumed to apply at request time;
- caching/rendering conclusions made without checking the active Cache Components/config state;
- undocumented or unstable framework behavior treated as guaranteed without verification;
- unsafe forwarding of redirect-style input.

## Runtime Ownership Boundaries

Architecture Guard owns broad module/layer/dependency structure.

Security & Auth owns authentication, authorization, tenant trust, provider isolation, and sensitive-data policy.

This skill owns:

- App Router/runtime placement;
- Server/Client Component boundaries;
- route-handler runtime behavior;
- server-action runtime behavior;
- `src/proxy.ts` runtime responsibilities;
- Cache Components/caching/revalidation correctness;
- request-time versus prerender/build-time behavior;
- Edge/Node compatibility;
- Vercel-compatible Next.js behavior;
- runtime-sensitive instrumentation and env exposure.

If a runtime decision depends on unresolved security or architecture policy, state the blocker instead of inventing that policy.

## Severity

Use:

- **CRITICAL** — cross-user/tenant cache leakage; server-only data/code exposed to client execution; security-critical logic moved client-side; incompatible runtime APIs that break a sensitive path; sensitive operations protected only by proxy; non-public env values reaching client code; App Router config that is invalid for the active Cache Components mode;
- **MAJOR** — unclear/inconsistent server-client or Edge-Node placement; unsafe runtime assumptions in route handlers/server actions; misunderstood rendering/caching behavior; runtime-specific imports forcing unintended behavior; required request-time boundary missing before request-sensitive/container work;
- **MINOR** — non-blocking runtime ambiguity, runtime documentation drift, or inconsistent patterns likely to cause future bugs;
- **INFORMATIONAL** — useful runtime observations without immediate correctness risk.

## Validation Expectations

Choose validation proportional to the runtime risk and coordinate with `validation-strategy` when the minimum evidence is not obvious.

Prefer evidence that exercises the actual runtime boundary:

- build/typecheck for compile/build-time framework constraints;
- focused route/server-action tests for boundary behavior;
- browser/E2E evidence for cross-layer navigation, auth routing, hydration, or browser instrumentation behavior;
- the repository scenario runner rather than raw Playwright when scenario env/DB setup matters;
- both relevant CSP build modes when a change depends on the `cacheComponents`/CSP split.

Do not claim a runtime fix complete when only a mocked layer was tested and the failure mode occurs at build, request, browser, cache, or deployment runtime.

## Response

For substantial Next.js Runtime output, use exactly:

1. Objective
2. Current-State Findings
3. Runtime Boundary Assessment
4. Docs vs Code Drift
5. Risks
6. Recommended Next Action

Lead reviews with findings. Cite real files and, for version-sensitive framework claims, authoritative framework evidence when needed.

Explain server/client and Edge/Node placement where relevant, plus route/page/layout/server-action/proxy responsibilities and caching/rendering implications.

## Source and Compatibility

`docs/ai/general/03 - Next.js Runtime Agent.md` remains the neutral cross-tool role source.
`docs/ai/general/SECURITY_CODING_PATTERNS.md` remains authoritative for applicable security coding constraints.

They remain semantic authorities, but live repository configuration and version-matched framework behavior are the source of truth for runtime facts.

For Claude Code, the `Context Loading` rules in this skill control retrieval: use targeted sections instead of legacy mandatory full-file startup reads, expanding when needed to establish the applicable runtime constraints.

Known current drift to surface rather than hide: the neutral Runtime Agent still describes `cacheComponents: true` as unconditional, while current `next.config.ts` disables Cache Components for the `nonce-dynamic` CSP build profile.

If that shared runtime description is corrected, propagate the semantic/documentation fix to required cross-tool surfaces according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary runtime review.

## Task Lifecycle

Follow the repository task lifecycle from the root instructions.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.
