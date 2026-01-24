# Technical Specification - Chromatic Integration

## Technical Context

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Framework**: Next.js 16 (App Router)
- **UI Tooling**: Storybook ^10.2.0
- **CI/CD**: GitHub Actions

## Implementation Approach

1. **Dependencies**:
   - Install `chromatic` as a `devDependency`.
   - Use the latest version to ensure compatibility with Storybook 10.
2. **Scripts**:
   - Add a `chromatic` script to `package.json`: `chromatic --project-token=$CHROMATIC_PROJECT_TOKEN`.
3. **GitHub Actions**:
   - Update `.github/workflows/deployChromatic.yml` to use modern actions and best practices.
   - Ensure it uses Node.js 22 and pnpm 10 as per project standards.
   - Use `chromaui/action@v1` for deployment.
4. **Environment Variables**:
   - Access `CHROMATIC_PROJECT_TOKEN` from GitHub Secrets.
   - Integrate with `src/core/env.ts` if needed for local development (though typically it's a CLI/CI secret).
5. **Documentation**:
   - Create `docs/features/09 - Chromatic Integration.md`.
   - Document how to obtain the token and set up the GitHub secret.

## Source Code Structure Changes

- `package.json`: New script and dependency.
- `.github/workflows/deployChromatic.yml`: Improved workflow configuration.
- `docs/features/09 - Chromatic Integration.md`: New documentation file.

## Verification Approach

- Run `pnpm chromatic` locally (with a dummy or real token) to verify the script.
- Push to a branch to trigger the GitHub Action (if possible in this environment, otherwise verify the YAML syntax).
- Run `pnpm lint` and `pnpm typecheck` to ensure no regressions.
