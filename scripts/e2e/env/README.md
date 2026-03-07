# E2E Env Profiles

This directory contains tracked, non-secret E2E runtime profiles.

Layering order used by `scripts/e2e/run-scenario.mjs`:

1. `.env.local` (optional local app defaults)
2. `.env.e2e` (optional shared local E2E overlay)
3. `scripts/e2e/env/base.env`
4. scenario env (`single.env`, `personal.env`, `org-provider.env`, `org-db.env`)
5. optional variant env
6. `.env.e2e.local` (local secrets and Clerk fixtures)
7. shell env overrides

Put shared non-secret E2E overrides in `.env.e2e`.
Put secrets and Clerk test credentials in `.env.e2e.local`, not here.
