# GitHub Workflows

## Purpose

This directory contains the repository GitHub Actions workflows.

## E2E Workflow Split

The repository intentionally keeps Playwright CI execution in two separate workflows:

### Auth Matrix E2E

- file: `e2e-label.yml`
- triggers:
  - PR label `run-e2e`
  - manual dispatch from the Actions tab
- command:
  - `pnpm e2e:auth-matrix:ci`
- purpose:
  - collect focused auth/bootstrap/onboarding evidence
  - preserve server-side route and provisioning logs under `logs/playwright/...`

### Matrix E2E

- file: `e2e-matrix.yml`
- triggers:
  - PR label `run-e2e-matrix`
  - manual dispatch from the Actions tab
- command:
  - `pnpm e2e:ci`
- purpose:
  - run the broader Playwright scenario matrix outside the auth-only regression lane

## Artifact Behavior

Both workflows upload:

- `logs/playwright/`
- `playwright-report/`
- `test-results/`

The server-log evidence root is `logs/playwright/...` because `test-results/` is Playwright-managed output and is not a stable destination for app-owned server logs.

## Script Mapping

- `pnpm e2e:auth-matrix:ci`
  - runs `pnpm build && E2E_BACKEND_MODE=container pnpm e2e:auth-matrix`
- `pnpm e2e:ci`
  - runs `pnpm build && pnpm e2e:matrix`

## Operational Guidance

- use `run-e2e` when you need auth/bootstrap/onboarding evidence
- use `run-e2e-matrix` when you need the wider scenario matrix
- use manual dispatch when you want to rerun either workflow without modifying PR labels
