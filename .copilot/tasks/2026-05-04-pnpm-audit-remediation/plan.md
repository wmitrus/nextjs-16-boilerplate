# Plan

## Objective

Reduce current `pnpm audit` failures with the smallest safe dependency change set in `authjs/pr2`.

## Checklist

- [x] Confirm current audit blockers and dependency paths
- [x] Apply minimal dependency and override remediation in `package.json`
- [x] Refresh lockfile and verify dependency resolution
- [x] Re-run focused `pnpm audit` validation
- [x] Record residual risk and remaining advisories

## Notes

- Working anchor: `package.json`
- Current blockers verified before edits: Clerk, PostCSS, uuid
- Goal is to reduce audit failures with low blast radius, not to perform a broad dependency refresh
- Outcome: `pnpm audit --json` reports zero vulnerabilities after the patch
- Residual risk: `next-auth@4.24.14` still reports an unmet peer for `nodemailer@^7.0.7` while the repo uses `nodemailer@8.0.5`
