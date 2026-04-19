# Codacy Warning Triage

## Decision Summary

- No remaining warning group currently justifies a broad global rule disable.
- The remaining warning set is dominated by false positives or low-signal findings.
- The only area that still deserves targeted code review attention is `src/**`, but even there the current sample findings look like safe patterns, not active vulnerabilities.
- Path-scoped exceptions are justified for clearly non-product areas.

## Rule Review

### `security/detect-object-injection`

Primary areas:

- `src/security/rsc/data-sanitizer.ts`
- `src/shared/lib/security/sanitize-log-context.ts`
- `src/core/logger/edge.ts`
- `src/shared/lib/api/with-action-handler.ts`
- `src/shared/lib/api/with-error-handler.ts`
- multiple `scripts/*`
- `e2e/clerk-auth.ts`

Classification:

- `src/**`: mostly false positives
- `scripts/**`: false positives / tooling noise
- `e2e/**`: tooling noise

Rationale:

- Findings are concentrated on safe own-property enumeration, null-prototype accumulators, typed finite-key lookups, or local static-key env access.
- The reviewed runtime code does not show user-controlled arbitrary property execution or unguarded prototype-chain lookups.

Decision:

- Keep the rule enabled.
- Do not add a broad repository-wide exception.
- If noise remains operationally expensive after a second pass, consider path-scoped narrowing for `scripts/leantime/**` and selective test paths, not for `src/**`.

### `security/detect-non-literal-fs-filename`

Primary areas:

- `src/core/logger/utils.ts`
- `scripts/codacy-analyze.mjs`
- `scripts/load-env-files.ts`
- `e2e/global.setup.ts`
- `e2e/runtime-profile.ts`

Classification:

- `src/core/logger/utils.ts`: false positive with sink confinement
- `scripts/**`: mostly false positives, but worth preserving on production-facing reusable helpers
- `e2e/**`: false positives / tooling noise

Rationale:

- Reviewed cases use repository-owned paths, `process.cwd()`-relative confinement, or path validation before the sink.
- `src/core/logger/utils.ts` matches the repository's SEC-16 pattern: sink-side confinement is already present.

Decision:

- Keep the rule enabled for production code.
- Do not globally suppress it.
- Path-scope suppression is reasonable for `e2e/**` and possibly selected dev-only scripts if Codacy churn remains high.

### `security/detect-unsafe-regex`

Primary area:

- `e2e/provisioning-runtime.spec.ts`

Classification:

- likely false positive / low-impact test-only finding

Rationale:

- Reviewed regexes are simple URL assertions used in Playwright expectations.
- They are not exposed on untrusted, attacker-controlled production inputs in a server runtime.

Decision:

- Do not disable the rule globally.
- Prefer small regex simplifications in test code later if we want to reduce noise.
- If we want immediate noise reduction without test churn, an `e2e/**` path-scope exception is acceptable.

### `security/detect-child-process`

Primary area:

- `.vscode/extensions-dev/parent-branch-status/parent-branch-status.js`

Classification:

- tooling noise / out of scope

Decision:

- exclude `.vscode/extensions-dev/**` from Codacy scope

### `@next/next/no-img-element`

Primary area:

- `tests/setup.tsx`

Classification:

- intentional test-only false positive

Decision:

- exclude `tests/setup.tsx` or `tests/**` from this rule in scanner scope

## Security Impact Verdict

- Reviewed remaining findings do not currently indicate a high-impact unresolved security issue.
- The current risk is mostly signal quality, not latent exploitability.
- The only bucket worth continued manual review is `src/**`, but based on reviewed samples it still looks like scanner mismatch rather than a hidden vulnerability cluster.

## Recommended Config Direction

### Add Exceptions Now

- `.vscode/extensions-dev/**`
- `tests/setup.tsx` or `tests/**` for `@next/next/no-img-element`

### Consider Scoped Exceptions After One More Pass

- `e2e/**` for `security/detect-non-literal-fs-filename`
- `e2e/**` for `security/detect-unsafe-regex`
- selective `scripts/leantime/**` for `security/detect-object-injection` if the team decides the remaining findings are permanently low-signal

### Do Not Add Broad Exceptions Yet

- `src/**` for `security/detect-object-injection`
- `src/**` for `security/detect-non-literal-fs-filename`

Reason:

- Those rules still have value in production runtime code when they catch real unchecked dynamic lookups or unconstrained file paths.
