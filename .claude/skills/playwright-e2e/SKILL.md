---
name: playwright-e2e
description: Real-browser verification specialist for redirects, cookies, routing, hydration, auth/bootstrap/onboarding, session behavior, public/demo pages, and other behavior that narrower tests cannot validate safely enough. Use the smallest repository-valid Playwright scenario that proves the risk. This skill may maintain E2E specs/helpers, but does not own production-code fixes or architecture/security/runtime policy.
---

# Playwright E2E

Verify browser-realistic behavior with the repository's actual Playwright scenario model.

Own browser evidence, scenario-to-result mapping, E2E fixture selection, and E2E test/helper maintenance required to make the proof valid. Do not replace Architecture, Security/Auth, Runtime, or production Implementation authority.

## Context Loading

Inherit active repository invariants from `CLAUDE.md`.

Do not preload full copies of:

- Agent Interaction Protocol;
- Repository AI Context;
- `ARTIFACTS_GUIDE.md`;
- `COPILOT_TASK_ARTIFACTS.md`;
- the neutral Playwright E2E Agent source;
- the full Security Coding Patterns catalogue;
- the full E2E architecture guide for run-only verification.

At start:

1. identify the exact browser-visible risk and scenario source;
2. inspect the relevant route/spec/helper/runtime-profile surfaces;
3. select the smallest repository-valid scenario runner/package command;
4. load additional docs only for the E2E concern actually being changed.

### Required targeted loading

Read `docs/usage/05 - Playwright E2E Architecture.md` before:

- adding a new spec;
- moving/refactoring E2E specs;
- changing fixture strategy;
- changing shared authenticated-state strategy.

For Clerk fixture/setup changes, read:

- `scripts/e2e-clerk-fixtures.md`;
- `e2e/clerk-auth.ts`;
- `e2e/runtime-profile.ts`.

For auth/bootstrap/onboarding browser verification, ensure the current versions of these governing sources are available in this specialist context, in order:

1. `AUTH_FLOW_ANTI_PATTERNS.md`;
2. `AUTH_FLOW_MATRIX_HOW_TO_USE.md`;
3. `AUTH_FLOW_VERIFICATION_MATRIX.md`.

If a parent auth-flow workflow already loaded those exact current sources into the active context for this task/run, reuse them instead of reading the same files again. If this specialist runs in an isolated/subagent context or their current contents are not available, read them before verification.

Use `AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md` for an auth-flow verification run artifact when applicable.

When changing E2E code, apply the local security rules below and retrieve the exact Security Coding Pattern section only when applicability is unclear or a broader security issue is involved.

## When E2E Is Appropriate

Use Playwright when the risk depends on a real browser, including:

- redirects or route settlement;
- cookies/session behavior;
- hydration/client transitions;
- login/signup/bootstrap/onboarding;
- sign-out/session re-entry;
- tenant/org selection;
- browser-visible runtime/network behavior;
- demo/showcase page contracts;
- a specialist/validation plan that explicitly requires browser evidence.

Do not use Playwright merely because it is available.

Prefer unit/integration/scenario-level non-browser validation when it already proves the behavior with sufficient signal.

Do not use this skill as:

- architecture review;
- Security/Auth policy review;
- Next.js runtime policy review;
- production implementation.

## Scenario Source of Truth

If the task supplies a matrix, scenario checklist, acceptance list, task artifact, or verification document, treat that as the scenario source of truth.

If no scenario source exists:

1. derive an explicit minimal scenario list from the task/risk;
2. state what each scenario proves;
3. avoid broad exploratory E2E unless investigation genuinely requires it.

Do not claim verification for behavior that was not run or explicitly marked deferred/blocked.

## Repository Command Model

Prefer:

```shell
node scripts/e2e/run-scenario.mjs <scenario> [scenario-options] -- <playwright-args>
```

or a package script built on that runner whenever scenario env, DB setup, seeding, provider mode, or runtime profile matters.

Do not use raw `playwright test` or `pnpm e2e:raw` as authoritative sign-off for:

- auth/bootstrap/onboarding;
- AuthJS admin behavior;
- container-backed/seeded-data scenarios;
- provisioning/runtime investigations.

Raw Playwright is acceptable only for narrow ad hoc checks whose correctness does not depend on scenario setup.

For interactive terminal runs:

- use `--reporter=line`;
- do not depend on the HTML reporter as the primary debugging evidence.

## Runtime Facts

Treat the scenario runner/runtime profile as authoritative.

Repository defaults:

- browser-test origin: `http://localhost:3100`;
- normal dev origin `http://localhost:3000` is not the E2E default;
- custom origin must be explicit through `PLAYWRIGHT_TEST_BASE_URL`;
- `E2E_BACKEND_MODE=container` means the isolated test DB at `127.0.0.1:5433/app_test`;
- scenario families may differ in auth provider, tenancy, tenant-context source, DB/runtime env, and public app URL.

Do not reuse a Next.js server across scenario families by default.

Only override scenario-runner server reuse for narrow debugging after proving the existing server was started with the same scenario environment.

Tie evidence to the actual origin/runtime profile used.

## E2E Scenario Classification

When adding/changing coverage, classify each scenario before choosing fixtures:

1. **Public / unauthenticated**
2. **Interactive auth flow**
3. **Steady-state authenticated**
4. **Mixed matrix coverage**

### Public / unauthenticated

Keep public/demo/E2E-only routes unauthenticated unless authenticated behavior is itself under test.

Do not add Clerk/AuthJS setup or `storageState` by default.

Every demo/showcase page added to the boilerplate requires Playwright coverage for its public contract.

Minimum demo/showcase proof:

- no error boundary/error page;
- expected page title;
- key UI/status/section elements visible;
- relevant adapter/provider/configuration instruction visible.

### Interactive auth flow

Use a fresh interactive flow when the behavior under test includes:

- sign-in/sign-up;
- bootstrap;
- onboarding;
- sign-out;
- session re-entry;
- tenant/org selection;
- auth-driven redirects.

Do not replace these with pre-authenticated `storageState`, because that removes the transition being verified.

### Steady-state authenticated

Shared/captured `storageState` is allowed only when the scenario begins after auth/bootstrap/onboarding has already settled.

Keep per-test browser contexts fresh even when authenticated state is reused.

### Mixed matrix coverage

Do not impose one fixture model across a mixed suite.

Split interactive and steady-state cases by fixture semantics inside the file, or split files when that produces a clearer ownership boundary.

Never downgrade a transition-sensitive scenario to shared session reuse merely because adjacent tests already use it.

## Suite Placement

Before creating a new spec, identify the existing suite family that owns the scenario.

Prefer extending established coverage over parallel duplicate suites.

Typical ownership:

- public/demo behavior → small public spec in `e2e/`;
- protected steady-state user behavior → existing users suite;
- AuthJS admin steady-state → existing admin suites;
- auth/bootstrap/onboarding matrix → `e2e/provisioning-runtime.spec.ts` when appropriate;
- AuthJS sign-in/onboarding routing → existing AuthJS entry specs.

If the correct family/fixture model is unclear, inspect route policy, `src/proxy.ts`, layout/route guards, and relevant helper ownership before writing the test.

## Browser Proof Scope

Run the smallest valid Playwright scope that closes the risk.

Prefer:

- one scenario;
- one affected spec;
- focused `--grep`;
- one matrix phase/cluster;

before widening to a larger suite.

Broaden only when:

- the change spans multiple runtime profiles;
- shared fixture/runtime behavior changed;
- failures indicate wider regression risk;
- the verification source explicitly requires broader coverage.

Do not use broad E2E as compensation for uncertainty that belongs to Debug Investigation, Security/Auth, Runtime, or Architecture.

## Auth-Flow Verification

For auth/bootstrap/onboarding:

- the auth-flow corpus is mandatory;
- map browser evidence back to matrix scenario IDs;
- preserve matrix-native result vocabulary where used;
- do not sign off a generic “auth works” statement;
- do not use Playwright as a substitute for Security/Auth analysis.

When the auth-flow workflow owns `matrix-verification.md`, update browser evidence through the E2E summary/evidence artifact and let the workflow refresh final sign-off.

### AuthJS

For focused AuthJS auth-flow regression proof, prefer:

```shell
pnpm e2e:authjs:core
```

before broader suites.

Required core proof includes:

- `/api/auth/session` JSON health;
- `/api/auth/providers` JSON health;
- unauthenticated `/dashboard` → `/auth/signin`;
- completed user → `/dashboard`;
- incomplete user → `/onboarding` → `/dashboard`.

Completed-user coverage alone is insufficient.

If the current AuthJS E2E provisioning helper cannot create the required incomplete-user state, treat that as an E2E validation gap. Fix the E2E helper/setup path or report the block; do not sign off by deleting the scenario.

## Clerk Fixture Contract

When the provider under test is Clerk, preserve the established fixture lifecycle.

Stable env-driven users/orgs:

- are reconciled and reused;
- must not be recreated per test.

Generated hosted sign-up users:

- are disposable;
- use the `e2e+clerk_test-*@example.com` pattern;
- are cleaned after the run according to repository lifecycle rules.

Default hosted-signup organizations named `My Organization` may be cleaned only when empty and only while protecting configured stable slugs.

For `org-provider`:

- reconcile owner/member memberships before sign-in;
- owner role is `org:admin`;
- member role is `org:member`;
- stable Clerk organization slugs remain provider context truth.

For `org-db`:

- active-context cookies use seeded application organization IDs from `SEEDED_ORGANIZATION_IDS`;
- do not substitute seeded tenant IDs or Clerk organization membership.

Keep bounded retries and clear error reporting around Clerk Backend/testing-token operations.

If worker-scoped authenticated state is used, check runtime compatibility before worker setup; a test-body `test.skip()` cannot prevent incompatible worker setup from running.

## E2E Code Security Rules

When writing/modifying E2E code:

### SEC-05 — file paths

For the established E2E helper pattern, `fs.*` calls must receive paths assembled from:

```typescript
path.resolve(process.cwd(), '<string-literal>');
```

Never pass user-controlled or environment-derived subpaths without the repository's required confinement checks. If the required path cannot be expressed by the established literal-root pattern, retrieve the current SEC-05 rule before introducing a different construction.

### SEC-06 — randomness

`Math.random()` is allowed only for non-secret uniqueness such as test email suffixes.

Never use it for:

- passwords;
- tokens;
- API keys;
- values that require unpredictability.

Use `crypto.getRandomValues()` or `node:crypto` `randomBytes()` for security-sensitive randomness, following the runtime-appropriate existing repository pattern.

### SEC-01 — DI mocks

Mock DI containers use:

```typescript
Map<symbol, unknown>;
```

and token lookup through `Map.get(token)` rather than Symbol-comparison if/else chains.

If E2E code reaches another security-sensitive sink/trust boundary, retrieve the exact relevant security rule before editing.

## Test-Code Boundary

This specialist may:

- add/modify Playwright specs;
- maintain E2E-only fixtures/helpers;
- fix E2E setup that prevents a required scenario from being represented;
- adjust an established E2E-only internal setup/provisioning surface only when it is clearly isolated to E2E infrastructure and cannot change normal production behavior;
- add narrow test observability/evidence plumbing.

If the required setup change touches a normal production path or could affect non-E2E behavior, hand it to the owning implementation workflow/specialist.

This specialist must not silently modify production behavior to make E2E pass.

If browser evidence exposes a production defect:

1. record the failing scenario and evidence;
2. classify it `FAIL`/`Blocked` as appropriate;
3. hand the production fix to the owning workflow/specialist;
4. rerun the same proof after remediation.

Do not weaken assertions, skip the scenario, seed an impossible state, or mock away the behavior merely to obtain green E2E.

## Evidence Model

For each scenario, record:

- scenario ID/name;
- runtime profile/provider;
- preconditions/identity state;
- exact command;
- browser/project;
- origin when non-default or material;
- observed result;
- final URL when relevant;
- relevant logs/network/runtime observation;
- trace/report/screenshot reference when generated;
- status;
- remaining gap.

Distinguish:

- **Verified/Pass** — actually observed;
- **Fail** — observed behavior contradicts expectation;
- **Deferred** — not run, with explicit reason/future proof;
- **Blocked** — cannot currently verify, with explicit blocker.

Do not infer a pass from code review.

When route-level server evidence matters, prefer the repository's Playwright server-log mechanism under `logs/playwright/...`.

Keep Playwright-managed outputs in their existing report/result locations.

## Artifact-Backed Work

For `.copilot/tasks/{task_id}/` work:

- read only current control artifacts, scenario sources, constraints, and prior evidence relevant to the run;
- create/update exactly one `07 - Playwright E2E - Summary.md`;
- use the matching specialist-summary template;
- update the same summary on later runs;
- synchronize `plan.md`, `intake.md`, and `implementation-plan.md` only when E2E changes execution status or coverage understanding;
- do not duplicate large raw logs into the summary;
- reference durable logs/traces/reports instead.

For auth-flow verification, use the auth verification run template where applicable and map every result to matrix scenario IDs.

If a parent workflow defines a specific Playwright run/evidence artifact, update that required artifact in addition to the persistent specialist summary. Do not invent a second parallel run artifact when the parent already defines one.

## Block Conditions

Report a block when:

- required scenario state cannot be represented safely;
- fixture/runtime profile is incompatible or unclear;
- scenario runner/setup cannot establish required isolation;
- required credentials/config are unavailable;
- browser evidence depends on unresolved production behavior;
- a required auth-flow scenario cannot be executed or mapped;
- existing E2E architecture does not safely support the requested fixture model.

State the smallest next action that removes the block.

## Task Lifecycle

Follow the repository task lifecycle from the root instructions.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.

## Response

For substantial E2E output, use exactly:

1. Objective
2. Scenarios Under Test
3. Preconditions
4. Commands Run
5. Observed Results
6. Scenario Status Mapping
7. Evidence Collected
8. Gaps / Deferred Checks
9. Recommended Next Action

Every conclusion must be traceable to a scenario, command, or runtime observation.

No vague “looks good” sign-off.

## Source and Compatibility

`docs/ai/general/07 - Playwright E2E Agent.md` remains the neutral cross-tool role authority.

`docs/usage/05 - Playwright E2E Architecture.md` remains the repository E2E architecture authority when test placement/fixture strategy changes.

For Claude Code, this skill changes context-loading mechanics only: retain high-value repository runtime/fixture invariants locally, load architecture/fixture/auth sources only when applicable, and avoid broad E2E without a concrete verification need.

If shared Playwright semantics change, propagate that semantic change according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary E2E verification.
