# Intake

## Request

Repair the failing `pnpm audit` professionally: inspect findings first, review
the existing override policy, then apply correct dependency updates.

## Confirmed Findings

- Resolvable floors: `undici@7.29.0`, `fast-uri@3.1.5`,
  `brace-expansion@1.1.18`, `brace-expansion@2.1.4`,
  `brace-expansion@5.0.9`, `js-yaml@4.3.1`, and `nanoid@3.3.18`.
- `image-size` is only present through the dev-only path
  `@storybook/nextjs-vite -> vite-plugin-storybook-nextjs -> image-size@2.0.2`.
  The audit database requests `>=2.0.3`, but npm publishes no such version.
- pnpm 11 supports advisory-scoped exceptions through `audit.ignore`. The two
  `image-size` GHSAs are the only exceptions permitted for this task; every
  published fix remains subject to normal audit enforcement.

## Acceptance Criteria

- Apply verified published fixes without unrelated dependency churn.
- Refresh `pnpm-lock.yaml`.
- Re-run `pnpm audit` and report the final vulnerability count and any blocker.
