# ESLint Security Signal Implementation Plan

## Decision Summary

- Do not force a 1:1 migration of remaining Codacy findings into local ESLint.
- Use ESLint for selected recurring patterns with stable AST signal and acceptable local noise.
- Keep Codacy as the backstop for broad heuristic scanning and false-positive triage.

## Candidate Matrix

| Finding Family                                                                               | Current Local Viability | Decision              | Reasoning                                                                                                        |
| -------------------------------------------------------------------------------------------- | ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Dynamic `process.env[key]` access in scripts / helpers                                       | High                    | Roll out now          | Stable AST pattern, easy to explain, already validated locally                                                   |
| Bare identifier paths at `fs.*Sync(...)` sinks in scripts / E2E helpers                      | High                    | Roll out now          | Stable AST pattern, maps to repeated path-provenance review, and stays narrower than Codacy's broad fs heuristic |
| `security/detect-object-injection` in safe-map / `Object.create(null)` / finite-key patterns | Low                     | Do not mirror broadly | High false-positive risk in accepted repo patterns                                                               |
| `security/detect-non-literal-fs-filename` in sink-confined helpers                           | Low                     | Do not mirror broadly | Current accepted patterns already rely on confinement at the sink                                                |
| Codacy `unsafe-regex` warnings in current E2E regexes                                        | Low                     | Defer                 | `eslint-plugin-regexp` spike did not reproduce useful findings                                                   |
| `detect-child-process` in dev-only tooling                                                   | Medium                  | Consider later        | Could be a narrow tooling-only rule if this finding recurs                                                       |

## Rollout Phases

### Phase 1: Proven Local Signal

- Keep the scoped `no-restricted-syntax` rule in `eslint.config.mjs` for dynamic `process.env[key]` access under `scripts/**` and `e2e/**`.
- Treat this as the initial proof that recurring Codacy review can be shifted left when the AST signal is stable.
- Use targeted lint commands in follow-up PRs to confirm the warning remains visible in local workflows.

### Phase 2: Second Proven Signal

- Keep the scoped `no-restricted-syntax` rule in `eslint.config.mjs` for bare identifier paths at `fs.*Sync(...)` sinks under `scripts/**` and `e2e/**`.
- Treat this as a review-visibility rule, not as proof that every flagged sink is exploitable.
- Use targeted lint commands in follow-up PRs to confirm that dynamic fs sink review happens locally before Codacy triage.

### Phase 3: Governance, Not Parity

- Add future repo-specific rules only when all three conditions hold:
  - the pattern recurs in Codacy findings,
  - the AST signal is stable enough for low-noise local lint,
  - the warning message points to a preferred repository pattern.
- Reject rule proposals that merely recreate known false positives in `src/**`.

### Phase 4: AI Docs Propagation

- Update `docs/ai/general/SECURITY_CODING_PATTERNS.md` with local-lint-backed patterns for dynamic env access and fs sink visibility.
- Update `AGENTS.md` so later implementation work treats these as approved shift-left patterns rather than ad hoc one-off task logic.
- Add a short note to the relevant AI workflow docs that selected Codacy classes are intentionally shifted left via ESLint and others remain scanner-only by design.

### Phase 5: PR Gain Tracking

- Baseline metrics for the next PRs:
  - count of Codacy findings in classes already covered by local lint
  - count of local ESLint warnings from the same classes before PR review
  - count of newly introduced inline suppressions for security rules
  - count of local fs-sink warnings that result in hardening versus justified no-change decisions
- Success condition: covered finding classes should increasingly appear in local lint before Codacy review, reducing manual triage time.
- Failure condition: if local rules create repeated false positives or are ignored, remove or narrow them instead of accumulating noise.

## Recommended Next Additions

1. Consider a third narrow rule only if future PR data shows repeated `child_process` or suppression-governance issues in tooling files.
2. Do not add a broad object-injection rule to `src/**` without new evidence that the false-positive rate is materially lower than today.
3. Do not keep experimental dependencies or plugins that fail to produce actionable diagnostics.
