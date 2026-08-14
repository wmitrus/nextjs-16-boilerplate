# Vercel Prebuilt Trace Investigation Plan

## Objective

Identify the source layer responsible for production `vercel deploy --prebuilt` `ENOENT` failures and establish evidence for a root-cause remediation.

## Progress

- [x] Remove the tracked `logs/server.log` artifact using an exact-path Git operation.
- [x] Identify the remote symptom and its deployment phase.
- [x] Trace `logs/server.log` from raw Next NFT trace to Vercel function metadata.
- [x] Determine whether production file logging creates the file.
- [x] Verify whether the file is present in a clean Git worktree.
- [x] Complete an isolated clean production build after removing the tracked artifact.
- [x] Separate tracked-artifact contamination from Next Proxy trace exclusions.
- [x] Hand off runtime and implementation decisions with evidence.
- [x] Align the production prebuilt profile and validator with required `filePathMap` source closure.
- [x] Validate a fresh production prebuilt artifact and authenticated upload dry-run.

## Constraints

- Preserve preview E2E helper exceptions in `.vercelignore`.
- Do not solve trace dependencies with upload allowlist exceptions.
- Do not expose environment values or credentials in task artifacts.
- Do not mutate generated Vercel output as a remediation.

## Next Step

The production prebuilt artifact and upload plan have been validated. Do not add another file-specific upload exception.
