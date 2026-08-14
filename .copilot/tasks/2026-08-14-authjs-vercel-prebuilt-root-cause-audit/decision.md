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
- unique custom `deploymentId` for skew protection;
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
