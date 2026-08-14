# Decision

## Accepted Model

- Preview: source upload and remote Vercel build.
- Production: CI `vercel build --prod`, validated prebuilt artifact, staged
  `deploy --prebuilt --prod --skip-domain`, smoke, then `vercel promote`.

This split is deliberate. Preview preserves Neon branching and exercises the
provider builder. Production preserves the prebuilt flow required after the
Vercel packaging change. Neither environment alone certifies the other path.

## Shared Controls

- exact `file-logger.js` trace include for every Next.js server route;
- Vercel CLI pinned to one lockfile version;
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
- hand-editing or copying files into `.vercel/output`;
- returning to `vercel@latest`;
- converting every Preview to prebuilt;
- treating a successful build/deploy status as runtime proof;
- testing Production only after its domains have already moved.
