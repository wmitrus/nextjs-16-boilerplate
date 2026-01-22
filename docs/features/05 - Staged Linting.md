# Staged Linting (lint-staged)

## Purpose

- **Efficiency**: Only run linting and formatting on files that are actually being committed.
- **Speed**: Significantly reduces the time spent on pre-commit checks.
- **Quality Assurance**: Ensures that every commit meets the project's quality standards.

## High-level behavior

- **Intercept Commits**: Triggered by Husky's `pre-commit` hook.
- **Filter Files**: Scans the staged changes and matches them against defined glob patterns.
- **Execute Tasks**: Runs ESLint and Prettier on matched files.
- **Auto-Fix**: If commands modify the files, `lint-staged` automatically re-stages them.

## Implementation in this boilerplate

- **Configuration**: Located in `package.json` under the `"lint-staged"` key.
- **Patterns and Commands**:
  - `**/*.{js,jsx,ts,tsx,mjs}`: Runs `eslint --fix` and `prettier --write`.
  - `**/*.{ts,tsx}`: Runs `tsc-files --noEmit` (staged typechecking).
  - `*.{json,css,scss,md,yml,yaml}`: Runs `prettier --write`.
- **Integration**: Called from `.husky/pre-commit` via `pnpm exec lint-staged`.

## Testing

- **Manual Run**: Stage some files and run `pnpm exec lint-staged` manually.
- **Commit Test**: Introduce a minor formatting error in a TS file, stage it, and run `git commit`. It should be fixed automatically.
