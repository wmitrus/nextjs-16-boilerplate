# Intake

## Request

Check DB tests that are green locally but failing on CI, find only the valid root cause, and provide only the valid fix.

## Verified Evidence

- Historical failing CI merge commit: `4cff548b7fed9cc8bdd70252c5edd7b6b160d239`
- CI error reproduced locally on exact merge tree
- Reproduced DB error: `PostgresError: column "deactivated_at" of relation "users" does not exist`
- Failing SQL inserts into `users` include `deactivated_at`
- Exact merge tree lacks `src/core/db/migrations/generated/0012_users_deactivated_at.sql`
- Exact merge tree journal lacks the `0012_users_deactivated_at` entry
- Local workspace currently contains the missing migration artifacts as untracked / modified files

## Constraint

Do not propose speculative fixes. Only report a fix that was validated by reproduction.
