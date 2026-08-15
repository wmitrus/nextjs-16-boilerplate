# Decision

## Accepted Model

- Preview: source upload and remote Vercel build.
- Production: CI `vercel build --prod`, validated prebuilt artifact, staged
  `deploy --prebuilt --prod --skip-domain`, smoke, then `vercel promote`.

This split is deliberate. Preview preserves Neon branching and exercises the
provider builder. Production preserves the prebuilt flow required after the
Vercel packaging change. Neither environment alone certifies the other path.

## Shared Controls

- automatic Next.js output file tracing with no repository-wide include or
  exclude overrides;
- Vercel CLI pinned to one lockfile version;
- successful machine-readable deploy output parsed before GitHub outputs;
- immutable git SHA provenance;
- anonymous hosted AuthJS runtime smoke;
- build worker cap of 16.

## Production-Only Controls

- `.vercelignore.prebuilt`;
- `.vercel/output` and `filePathMap` validation;
- dry-run upload closure and budgets;
- unique custom `deploymentId` for skew protection, sourced only from
  `VERCEL_PREBUILT_DEPLOYMENT_ID` and embedded during the build;
- a hard ban on manually assigning the reserved `NEXT_DEPLOYMENT_ID` in the
  prebuilt workflow and an artifact guard rejecting
  `runtimeServerDeploymentId: true`;
- staged deployment and promotion.

## Rejected Directions

- `getToken()` as an AuthJS root-cause fix;
- global `outputFileTracingExcludes` used for deployment size optimization;
- a manual `outputFileTracingIncludes` entry for pnpm-linked Next.js files;
- changing pnpm linker mode or patching Next.js for this incident;
- hand-editing or copying files into `.vercel/output`;
- returning to `vercel@latest`;
- converting every Preview to prebuilt;
- treating a successful build/deploy status as runtime proof;
- testing Production only after its domains have already moved.
- exporting `NEXT_DEPLOYMENT_ID` only for `vercel build`; this activates
  runtime resolution without providing the required runtime variable.

## 2026-08-14 Production Runtime Correction

Production deployment `dpl_A62Nfc7pBYjGhWchmfeZMjDqpwW4` built and deployed,
but both hosted smoke tests failed. Vercel function logs proved that every Node
function exited before AuthJS execution:

```text
process.env.NEXT_DEPLOYMENT_ID is missing but runtimeServerDeploymentId is enabled
```

The supported prebuilt model remains accepted. The incorrect implementation of
its custom deployment ID is replaced by a provider-documented top-level
`deploymentId` sourced from a non-reserved build variable. Preview remains
source-built and requires no equivalent workaround.

## 2026-08-15 Production Tenant Decision

The post-login failure is not another prebuilt or AuthJS workaround case.
Production runtime configuration pointed at a different tenant UUID than the
single complete tenant already stored in the production DB.

Accepted correction:

- align Production-only `DEFAULT_TENANT_ID` to the existing tenant;
- retain fail-closed provisioning behavior;
- run read-only tenant readiness after Production migrations and before prebuilt
  upload;
- keep Preview branch DB validation deployment-scoped rather than copying this
  Production-only GitHub preflight.

Rejected corrections are creating a duplicate tenant, changing auth routes,
making provisioning silently create single-tenant roots, or treating successful
schema migrations as proof of operational tenant data.
