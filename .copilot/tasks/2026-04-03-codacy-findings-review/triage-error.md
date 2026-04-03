# Error Triage

## Objective

- Triage all 8 Codacy error findings for security relevance and recommended next action.
- Distinguish security impact from general maintenance or compatibility debt.

## Classification Counts

- Real security risk: 0
- Latent security risk: 0
- Intentional compatibility coverage: 4
- Non-security type-safety debt: 2
- Non-security formatting drift: 2

## Rule Breakdown

- `@typescript-eslint/no-deprecated`: 4
- `@typescript-eslint/no-explicit-any`: 2
- `prettier/prettier`: 2

## E-01. Deprecated Compatibility Test Coverage

- Rule: `@typescript-eslint/no-deprecated`
- Affected files and lines: `src/modules/auth/infrastructure/drizzle/DrizzleExternalIdentityMapper.db.test.ts` at lines 38, 62, 72, 81
- Runtime context: Node test-only real-DB compatibility coverage for a deprecated read-only adapter.
- Classification: Intentional compatibility coverage.
- Rationale: The test file explicitly opts into deprecated usage to keep backward-compatible read-only resolution coverage alive while write paths have already moved to provisioning. This is not an auth bypass or trust-boundary issue.
- SEC-XX match if any: None.
- Recommended action: Keep the coverage until the deprecated adapter is removed. If the repository wants a cleaner Codacy queue, replace the compatibility test with the successor adapter once the deprecation window closes.

## E-02. Migration Helper Uses Any

- Rule: `@typescript-eslint/no-explicit-any`
- Affected files and lines: `src/core/db/migrations/run-migrations.ts` at lines 60 and 76
- Runtime context: Node-only migration runner for Drizzle migrators.
- Classification: Non-security type-safety debt.
- Rationale: The flagged casts weaken static typing around the migrator boundary, but they do not create an auth, authorization, or sensitive-data exposure issue by themselves.
- SEC-XX match if any: None.
- Recommended action: Tighten the migrator typing when implementation work is scheduled. This is maintenance debt, not a security block.

## E-03. Codacy Analyze Script Formatting Drift

- Rule: `prettier/prettier`
- Affected files and lines: `scripts/codacy-analyze.mjs` at lines 189 and 203
- Runtime context: Local Codacy CLI helper script.
- Classification: Non-security formatting drift.
- Rationale: These are formatter-only findings in local tooling. They do not affect auth flow, authorization, trust boundaries, or secret handling.
- SEC-XX match if any: None.
- Recommended action: Run the formatter or the repository-standard lint fix flow when this script is next touched.

## Security Conclusion

- No Codacy error finding in this task is a confirmed or latent security risk.
- All 8 error findings land in maintenance or compatibility categories outside the Security & Auth block/no-block threshold.
