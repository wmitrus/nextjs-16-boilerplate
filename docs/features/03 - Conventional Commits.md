# Conventional Commits & Commitizen

## Purpose

- **Standardized Versioning**: Enable automated versioning and changelog generation.
- **Project History Clarity**: Maintain a clean, readable, and predictable git history.
- **Improved DX**: Provide interactive CLI tools to help developers write compliant commit messages.
- **Automated Quality Gates**: Prevent non-compliant commit messages from being pushed.

## High-level behavior

- **Commitizen**: Provides the `pnpm commit` command (aliased to `cz`), an interactive prompt that guides developers through creating a conventional commit message.
- **Commitlint**: Validates the commit message format during the `commit-msg` git hook. If the message doesn't follow the convention, the commit is rejected.

## Implementation in this boilerplate

- **Tools**:
  - **Commitizen**: CLI for interactive commit creation.
  - **cz-conventional-changelog**: The standard adapter for Conventional Commits.
  - **Commitlint**: The linter for commit messages.
  - **@commitlint/config-conventional**: Standard shared configuration for commitlint.
- **Configuration**:
  - `package.json` (`config.commitizen`): Points to the `cz-conventional-changelog` adapter.
  - `commitlint.config.mjs`: Custom rules and extensions.
- **Git Hooks**:
  - `.husky/commit-msg`: Runs `pnpm exec commitlint --edit "$1"`.

## Usage

- **Interactive Commit**: Run `pnpm commit` and follow the prompts.
- **Manual Compliance Check**: Try to commit a message that violates the convention: `git commit -m "bad message"`. It should be blocked by Husky and Commitlint.

## Next.js 16 / React 19.2 Notes

- **Example Scopes**:
  - `feat(rsc): ...`
  - `refactor(server-actions): ...`
  - `fix(types): ...`
