# Constraints

## Hard Constraints

- Do not require any Vercel dashboard changes as part of the refactor.
- Do not require any change to the long-standing Preview Build Command as a prerequisite for restoring compatibility.
- Keep the migration safety property that DDL must not run through a pooled / PgBouncer URL.
- Do not reintroduce automatic preview admin bootstrap into `.github/workflows/preview-deploy.yml`.
- Keep the fix low-blast-radius and scoped to migration execution behavior.

## Non-Goals

- Redesign the full preview deployment workflow.
- Redesign production deployment ownership.
- Reopen bootstrap ownership decisions already captured in `2026-05-05-admin-bootstrap-deploy-design`.
- Update broad deployment docs before code behavior is proven.

## Acceptance Criteria

- `pnpm db:migrate:prod` succeeds when the effective migration URL is direct, even if the shell temporarily overrides `DATABASE_URL`.
- `pnpm db:migrate:prod` still fails when the effective migration URL is pooled / PgBouncer.
- The refactor does not depend on preview workflow bootstrap steps.
- Focused validation proves both the compatible legacy shape and the intentionally invalid pooled shape.
