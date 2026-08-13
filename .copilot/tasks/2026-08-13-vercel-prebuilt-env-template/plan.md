# Plan

## Objective

Correct the production prebuilt deploy contract without treating the tracked public `.env.example` template as a secret env file.

## Progress

- [x] Reproduce and isolate the CI failure.
- [x] Trace the generated Vercel function metadata.
- [x] Identify the validator policy mismatch.
- [x] Update the narrow validator policy and production upload profile.
- [x] Run focused tests and a production prebuilt dry-run.

## Constraints

- `.env.example` is a tracked public template, not a credential file.
- Actual environment files remain excluded from production upload.
- The production prebuilt upload must include every source path required by `filePathMap`.
- Preview source-upload behavior must remain unchanged.
