# Readiness Audit Constraints

## Enforced Invariants

- Every generated Vercel `filePathMap` source must either be an explicitly allowed source uploaded by the production dry-run or cause the pipeline to fail.
- Forbidden source metadata is a hard failure. It must not be ignored merely because the dry-run profile omits it.
- The Vercel Project Build Command is the only owner of the Production database migration. The GitHub Actions workflow must not run `pnpm db:migrate:prod` separately.
- Production deploy completion requires Vercel inspection with `--wait --json` and a `READY`, `production`, prebuilt deployment result.
- Preview remains a source upload with a remote Vercel build. It must not switch to `vercel build` or `deploy --prebuilt` while Neon Preview Branching is in use.

## Evidence Boundaries

- Local validator and dry-run evidence prove generated artifact and planned-upload closure only.
- A current-SHA protected Production workflow and inspected hosted deployment are required before declaring an unconditional production readiness GO.
- No production build or deployment is run locally merely to create audit evidence because the verified external Build Command performs the production migration.
