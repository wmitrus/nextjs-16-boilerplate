# Git Hooks (Husky)

## Purpose

- **Automation**: Execute scripts automatically at specific points in the Git lifecycle.
- **Guardrails**: Prevent bad code from being committed or pushed by enforcing quality checks locally.
- **Commit Standardization**: Validate commit messages against the Conventional Commits specification.

## High-level behavior

- **Pre-commit**: Triggers `lint-staged` to lint and format only the changed files.
- **Commit-msg**: Runs `commitlint` to ensure the commit message follows the required format.
- **Pre-push**: Runs heavyweight checks like `typecheck`, `skott`, `depcheck`, and `madge` to ensure the overall codebase health before pushing.

## Implementation in this boilerplate

- **Manager**: Husky (v9).
- **Hooks Directory**: `.husky/`
- **Active Hooks**:
  - `pre-commit`: Invokes `lint-staged`.
  - `commit-msg`: Invokes `commitlint`.
  - `pre-push`: Runs `pnpm run typecheck`, `pnpm run skott:check:only`, `pnpm run depcheck`, and `pnpm run madge`.
- **Scripts**:
  - `pnpm prepare`: Automatically installs Husky hooks when running `pnpm install`.

## Usage

- **Bypassing**: Use the `--no-verify` flag with `git commit` to bypass hooks in exceptional circumstances.
- **Testing**: Stage a file with a lint error and try to commit. It should be blocked.
