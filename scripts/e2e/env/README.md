# E2E Env Profiles

This directory contains tracked, non-secret E2E runtime profiles.

Layering order used by `scripts/e2e/run-scenario.mjs`:

1. `.env.local` (optional local app defaults)
2. `scripts/e2e/env/base.env`
3. scenario env (`single.env`, `personal.env`, `org-provider.env`, `org-db.env`)
4. optional variant env
5. `.env.e2e.local` (local secrets and Clerk fixtures)
6. shell env overrides

Put secrets and Clerk test credentials in `.env.e2e.local`, not here.
