# Dependency Upgrade Safety Policy

## Purpose

Provide a low-risk, repeatable process for dependency updates with clear rollback points.

## Baseline (current project policy)

- Runtime target: Node `24.x` (local, CI, Vercel aligned).
- Security baseline: `pnpm audit` must be green before and after each batch.
- Quality baseline: all required gates must pass before merge.

## Upgrade strategy

1. Start with visibility:
   - `pnpm outdated`
   - `pnpm audit`
2. Split updates into **small batches**:
   - Patch-only first.
   - Minor updates next.
   - Major updates last, one ecosystem at a time.
3. Use one branch/PR per batch.
4. Validate after each batch.
5. Merge only green batches.

## Mandatory validation after each batch

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

For higher-risk batches (major lint/runtime/tooling), also run:

- `pnpm test:integration`
- `pnpm e2e`
- `pnpm skott:check:only`
- `pnpm madge`
- `pnpm depcheck`
- `pnpm env:check`

## Major upgrades policy

### ESLint ecosystem

Treat as one compatibility group:

- `eslint`
- `eslint-config-next`
- `eslint-plugin-react`
- `eslint-plugin-react-hooks`
- `eslint-plugin-jsx-a11y`
- `eslint-plugin-import` / `eslint-plugin-import-x`
- `eslint-plugin-jsonc`
- `jsonc-eslint-parser`
- `typescript-eslint`

Rule: do not upgrade `eslint` major alone. Upgrade/check plugin compatibility first.

### Node and runtime types

Treat as one compatibility group:

- Node runtime (local/CI/Vercel)
- `@types/node`
- test/runtime polyfills

Rule: align runtime first, then update `@types/node`, then verify typecheck + tests.

## Rollback procedure (required)

If a batch fails:

1. Restore dependency files:
   - `git restore package.json pnpm-lock.yaml`
2. Reinstall:
   - `pnpm install`
3. Re-run baseline checks:
   - `pnpm typecheck && pnpm lint && pnpm test`

Do not continue to next batch until current batch is green.

## Quick execution template

```bash
# 1) inspect
pnpm outdated
pnpm audit

# 2) update one safe batch (example)
pnpm add -D <packages...>

# 3) validate
pnpm typecheck && pnpm lint && pnpm test

# 4) if batch is major/high-risk
pnpm test:integration && pnpm e2e
pnpm skott:check:only && pnpm madge && pnpm depcheck && pnpm env:check
```
