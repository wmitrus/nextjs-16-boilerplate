# Scanner Ignore Report

## Session: 870b0c22-0bb4-4e1d-9f10-c85886345462

| File                                                                          | Line | Rule / Finding                            | Classification | Action    | Rationale                                                            |
| ----------------------------------------------------------------------------- | ---- | ----------------------------------------- | -------------- | --------- | -------------------------------------------------------------------- |
| `scripts/load-env.ts`                                                         | 32   | `security/detect-object-injection`        | False positive | No action | Controlled input from known env var keys; established pattern        |
| `scripts/load-env.ts`                                                         | 75   | `security/detect-non-literal-fs-filename` | False positive | No action | Static literal path via `path.resolve(cwd, '<literal>')` — SEC-05    |
| `src/modules/feature-flags/infrastructure/static/StaticFeatureFlagService.ts` | 23   | `security/detect-object-injection`        | False positive | No action | Controlled input — established false positive in feature flag lookup |

## Resolved Findings

| Advisory            | Package     | Previous Version | Fixed Version | Status      |
| ------------------- | ----------- | ---------------- | ------------- | ----------- |
| GHSA-v2wj-q39q-566r | vite        | 7.3.1            | 7.3.2         | ✅ Resolved |
| GHSA-p9ff-h696-f583 | vite        | 7.3.1            | 7.3.2         | ✅ Resolved |
| GHSA-4w7w-66w2-5vf9 | vite        | 7.3.1            | 7.3.2         | ✅ Resolved |
| GHSA-gpj5-g38j-94v9 | drizzle-orm | 0.45.1           | 0.45.2        | ✅ Resolved |
