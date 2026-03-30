# Commit message rules

Use Conventional Commits.

Format:
`<type>[optional scope]: <description>`

Classify the primary intent of the staged diff first.

## Types

- `feat`: new functionality
- `fix`: bug fix / behavior correction
- `refactor`: restructuring without behavior change
- `test`: tests only
- `docs`: docs only
- `style`: formatting / non-semantic style only
- `build`: dependencies / bundler / compiler / build tooling
- `ci`: CI/CD workflows and automation
- `perf`: performance improvement
- `chore`: maintenance not covered above
- `revert`: revert of previous commit

## Rules

- Never use `feat` for test-only changes.
- Never use `refactor` if behavior changes.
- Never use `chore` when a more specific type fits.
- Classify by actual diff, not filenames alone.
- If production code and tests both change, classify by the production change.
- If unrelated changes are staged together, prefer separate commits.

## Scope

Use scope only when one module clearly dominates:
`auth`, `onboarding`, `users`, `billing`, `api`, `ui`, `db`, `infra`, `shared`, `tests`, `ci`

## Style

- imperative mood
- subject under 72 chars
- lowercase type and scope
- body only if useful
