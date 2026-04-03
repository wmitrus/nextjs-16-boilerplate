# Warning Triage

## Objective

- Triage all 95 Codacy warning findings for real risk, latent hardening need, false positive status, or scope noise.
- Preserve a clear proof trail for where all warnings landed.

## Classification Counts

- Real security risk: 0
- Latent risk: 3
- False positive: 90
- Scope noise or dev-test-only lint noise: 2

## Rule Breakdown

- `security/detect-object-injection`: 63
  - Latent risk: 1
  - False positive: 62
- `security/detect-non-literal-fs-filename`: 22
  - Latent risk: 2
  - False positive: 20
- `security/detect-unsafe-regex`: 8
  - False positive: 8
- `security/detect-child-process`: 1
  - Scope noise: 1
- `@next/next/no-img-element`: 1
  - Scope noise: 1

## Repeated False-Positive Themes

- Object-injection warnings are dominated by three safe patterns: finite-union record lookup, own-key enumeration over `Object.keys` or `Object.entries` into null-prototype accumulators, and test-only mock scaffolding.
- Fs-path warnings are dominated by repository-owned paths resolved from `process.cwd`, `path.resolve`, or fixed tool directories in E2E and scripts. The only two findings that still merit hardening are the logger helper calls because the helper does not enforce confinement at the point of fs access.

## W-01. Bootstrap Reason Map Reads an Untrusted Query Key Through a Plain Object

- Rule: `security/detect-object-injection`
- Affected files and lines: `src/app/auth/bootstrap/page.tsx` at line 44
- Runtime context: Auth bootstrap Server Component resolving an error reason from untrusted search params.
- Classification: Latent risk.
- Rationale: The code guards with `reason in ERROR_BY_REASON` and then reads `ERROR_BY_REASON[reason]`. Because `ERROR_BY_REASON` is a normal object, the `in` operator walks the prototype chain. Inputs like `toString` satisfy the guard even though they are not intended reasons. This is not an auth bypass today, but it is a trust-boundary bug pattern on untrusted input.
- SEC-XX match if any: Closest to `SEC-04`, but the current implementation does not meet the explicit own-key or dispatch-map discipline.
- Recommended action: Replace the current pattern with `Object.hasOwn`, a null-prototype record, a `Map`, or an explicit switch over known reasons before indexing.

## W-02. Logger Directory Helper Uses Dynamic Paths Without Point-of-Use Confinement

- Rule: `security/detect-non-literal-fs-filename`
- Affected files and lines: `src/core/logger/utils.ts` at lines 18 and 21
- Runtime context: Node server logger startup path that creates the local log directory.
- Classification: Latent risk.
- Rationale: Current call sites pass static values through `src/core/logger/streams.ts`, but the helper accepts a dynamic `logDir` string and uses `path.join` with `fs.existsSync` and `fs.mkdirSync` without a point-of-use `path.resolve` plus confinement guard. That leaves a future hardening gap if any non-literal value reaches the helper.
- SEC-XX match if any: Closest to `SEC-05` and `SEC-12`, but the current helper does not fully implement the confinement pattern those entries expect.
- Recommended action: Resolve the final path with `path.resolve`, confine it to an allowed base directory, and perform the confinement check inside the helper before fs access.

## W-03. Logger Dispatch and Level Lookup Use Finite Typed Unions

- Rule: `security/detect-object-injection`
- Affected files and lines: `src/app/api/logs/route.ts` at line 150; `src/core/logger/edge.ts` at lines 110, 118, 128, 145
- Runtime context: Runtime logging infrastructure and log-ingest route.
- Classification: False positive.
- Rationale: All lookups are bounded by explicit level unions or Zod-validated `LOG_LEVELS` and read from static `Record` maps. This is exactly the bounded-dispatch shape the repository already treats as safe.
- SEC-XX match if any: `SEC-04`.
- Recommended action: No security change required. Keep the explicit dispatch-map pattern and, if desired, tune Codacy expectations around this bounded lookup pattern.

## W-04. Runtime Read-Only Map Lookups With Controlled Keys

- Rule: `security/detect-object-injection`
- Affected files and lines: `src/app/auth/bootstrap/bootstrap-error.tsx` at line 59; `src/features/security-showcase/lib/env-diagnostics.ts` at line 31; `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts` at line 22; `src/modules/authorization/domain/policy/ConditionEvaluator.ts` at line 36; `src/modules/feature-flags/infrastructure/static/StaticFeatureFlagService.ts` at line 23
- Runtime context: Production runtime auth, authorization, diagnostics, and feature-flag helpers.
- Classification: False positive.
- Rationale: These are read-only lookups keyed by hardcoded env names, Clerk claim-name allowlists, ABAC attribute keys already controlled by policy authors, or static flag records. They are not arbitrary method dispatch or unbounded object mutation.
- SEC-XX match if any: None.
- Recommended action: No security change required. Keep the current bounded lookup patterns and reserve code changes for cases where untrusted input crosses into mutation or method dispatch.

## W-05. Script and E2E Env Alias Lookups Use Controlled Key Sets

- Rule: `security/detect-object-injection`
- Affected files and lines: `e2e/clerk-auth.ts` at lines 104, 128, 139, 341, 348, 349; `scripts/check-e2e-auth-env.mjs` at lines 18, 58, 270, 303; `scripts/check-env-consistency.mjs` at line 45; `scripts/codacy-install.mjs` at line 38; `scripts/e2e/run-scenario.mjs` at line 32
- Runtime context: Script, E2E, and local tooling helpers.
- Classification: False positive.
- Rationale: These reads are driven by hardcoded alias arrays, static platform maps, or known scenario names. They do not expose runtime request trust boundaries and do not perform unbounded method dispatch.
- SEC-XX match if any: None.
- Recommended action: No auth or security code change required. Keep the current guards and consider Codacy scope tuning for script-heavy object lookup noise.

## W-06. Runtime Sanitizers and Error Wrappers Enumerate Own Keys Into Controlled Accumulators

- Rule: `security/detect-object-injection`
- Affected files and lines: `src/security/actions/action-audit.ts` at lines 62, 100; `src/security/rsc/data-sanitizer.ts` at lines 28, 30, 33, 50 with multiple column-level hits; `src/shared/lib/api/with-action-handler.ts` at lines 25, 27, 30; `src/shared/lib/api/with-error-handler.ts` at lines 33, 35, 38; `src/shared/lib/security/sanitize-log-context.ts` at lines 30, 40, 47, 54
- Runtime context: Production sanitization, audit logging, and API error-shaping code.
- Classification: False positive.
- Rationale: The flagged writes are all own-key enumeration patterns into null-prototype or fresh accumulator objects after sensitive-key filtering. These helpers are reducing exposure, not creating a code-injection sink.
- SEC-XX match if any: None.
- Recommended action: No security change required. Keep the current sanitization and redaction logic intact.

## W-07. Test and Tooling Accumulators Build Fresh Objects From Controlled Inputs

- Rule: `security/detect-object-injection`
- Affected files and lines: `e2e/global.setup.ts` at line 30; `scripts/e2e/load-env.mjs` at lines 67, 125; `scripts/load-env-files.ts` at line 45; `scripts/load-env.ts` at lines 32, 47; `src/core/env.test.ts` at lines 21, 24; `src/security/rsc/data-sanitizer.mock.ts` at lines 9, 23 with multiple column-level hits
- Runtime context: E2E bootstrapping, script env loading, and test or mock scaffolding.
- Classification: False positive.
- Rationale: These are local accumulators fed from repository-owned env files, test fixtures, or mock data. They do not sit on a production trust boundary and are not dynamic method dispatch.
- SEC-XX match if any: None.
- Recommended action: No security change required. Prefer scope tuning over churn in test or tooling code.

## W-08. Test-Only Mock Chains and Header-Cookie Helpers Use Fixed Method Names

- Rule: `security/detect-object-injection`
- Affected files and lines: `src/modules/authorization/infrastructure/drizzle/DrizzleMembershipRepository.test.ts` at line 15; `src/modules/authorization/infrastructure/drizzle/DrizzlePolicyRepository.test.ts` at line 16; `src/modules/authorization/infrastructure/drizzle/DrizzleRoleRepository.test.ts` at line 15; `src/modules/authorization/infrastructure/drizzle/DrizzleTenantAttributesRepository.test.ts` at line 15; `src/modules/provisioning/infrastructure/request-context/CookieActiveTenantSource.test.ts` at line 9; `src/modules/provisioning/infrastructure/request-context/HeaderActiveTenantSource.test.ts` at line 8; `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.test.ts` at line 15
- Runtime context: Unit tests only.
- Classification: False positive.
- Rationale: The flagged keys come from static literal method-name arrays or test-supplied header and cookie names. They do not create production attack surface.
- SEC-XX match if any: None.
- Recommended action: No security change required. If queue reduction matters, deprioritize test-only object-injection findings.

## W-09. E2E and Env Readers Use Repository-Owned Paths Resolved Under the Working Tree

- Rule: `security/detect-non-literal-fs-filename`
- Affected files and lines: `e2e/global.setup.ts` at lines 8, 12; `e2e/runtime-profile.ts` at lines 36, 41; `scripts/e2e/load-env.mjs` at lines 37, 42; `scripts/load-env-files.ts` at lines 28, 31
- Runtime context: E2E startup and env bootstrap utilities.
- Classification: False positive.
- Rationale: These paths are anchored to `process.cwd` or `path.resolve` for repository-owned env files. They are not arbitrary user-supplied filenames and align with the repository’s accepted static-path pattern.
- SEC-XX match if any: `SEC-05`.
- Recommended action: No security change required. Leave the current guards and comments in place.

## W-10. CLI, Compose, and Codacy Helpers Use Fixed Repository-Owned Paths

- Rule: `security/detect-non-literal-fs-filename`
- Affected files and lines: `scripts/codacy-analyze.mjs` at lines 49, 158, 179; `scripts/codacy-install.mjs` at lines 64, 97, 99; `scripts/compose-db-local.mjs` at lines 89, 99; `scripts/e2e/run-scenario.mjs` at line 345
- Runtime context: Local CLI and developer tooling.
- Classification: False positive.
- Rationale: The findings hit fixed binary paths, fixed report paths, fixed compose-file candidates, and a pre-confined scenario output directory. These are repository-owned paths, not request-driven file access.
- SEC-XX match if any: `SEC-05`.
- Recommended action: No security change required. Consider Codacy path-scoping for local tooling if these dominate the review queue.

## W-11. Operator-Provided Flag File Paths Are Already Confined Before Access

- Rule: `security/detect-non-literal-fs-filename`
- Affected files and lines: `scripts/flags/export.ts` at line 78; `scripts/flags/import.ts` at line 75
- Runtime context: Operator-invoked feature-flag import and export scripts.
- Classification: False positive.
- Rationale: Both scripts resolve the input or output path and then enforce confinement with `assertPathWithinBase` before fs access. That matches the intended script hardening model even though the scanner still flags non-literal filenames.
- SEC-XX match if any: `SEC-05` and `SEC-12`.
- Recommended action: No security change required. Keep the point-of-use confinement guard.

## W-12. Provisioning E2E Spec Reads a Controlled Test Artifact

- Rule: `security/detect-non-literal-fs-filename`
- Affected files and lines: `e2e/provisioning-runtime.spec.ts` at line 255
- Runtime context: Playwright E2E spec reading a known test artifact.
- Classification: False positive.
- Rationale: The spec reads a controlled repository test file rather than an attacker-chosen path. This is test-only and outside production runtime.
- SEC-XX match if any: `SEC-05`.
- Recommended action: No security change required.

## W-13. Playwright Assertion Regexes Are Test-Only and Not Used as Runtime Parsers

- Rule: `security/detect-unsafe-regex`
- Affected files and lines: `e2e/provisioning-runtime.spec.ts` at lines 436, 710, 730, 829, 851, 1076, 1079, 1142
- Runtime context: Playwright URL and UI assertions.
- Classification: False positive.
- Rationale: These regular expressions run only in test assertions against bounded browser state. They are not exposed as production request parsers or untrusted input validators, so the ReDoS concern does not materialize here.
- SEC-XX match if any: None.
- Recommended action: No security change required. Scope tuning is preferable to rewriting readable assertion patterns.

## W-14. Child Process Warning Is Isolated to a Dev Extension

- Rule: `security/detect-child-process`
- Affected files and lines: `.vscode/extensions-dev/parent-branch-status/parent-branch-status.js` at line 20
- Runtime context: Local editor extension under the repository, not application runtime.
- Classification: Scope noise or dev-only lint noise.
- Rationale: The finding is outside the production Next.js, auth, and script execution paths reviewed for this task.
- SEC-XX match if any: None.
- Recommended action: Remove this path from the primary remediation queue or isolate it into a dev-only Codacy scope.

## W-15. Img Element Warning Targets the Test Harness Mock

- Rule: `@next/next/no-img-element`
- Affected files and lines: `tests/setup.tsx` at line 118
- Runtime context: Vitest test harness mocking `next/image`.
- Classification: Scope noise or dev-test-only lint noise.
- Rationale: This is intentional test scaffolding, not production delivery code. It does not affect auth, authorization, or sensitive data handling.
- SEC-XX match if any: None.
- Recommended action: Exclude test harness mocks from this rule or keep it outside the main remediation queue.

## Security Conclusion

- Confirmed real risks: 0
- Confirmed latent risks: 3
- Non-risk landings proved above: 92
- Security-relevant follow-up should focus narrowly on `src/app/auth/bootstrap/page.tsx` line 44 and `src/core/logger/utils.ts` lines 18 and 21.
- All remaining warnings are either false positives under existing repository patterns or non-runtime scope noise.
