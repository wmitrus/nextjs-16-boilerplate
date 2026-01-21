# Quality Tools (skott, depcheck, madge)

## Purpose

Maintain codebase health by detecting:

- **Circular Dependencies**: Prevent complex dependency cycles.
- **Unused Dependencies**: Keep `package.json` lean.
- **Unused Files/Exports**: Clean up the source tree.

## Tools

### 1. skott

- **Purpose**: A minimalist graph analysis tool to visualize and analyze dependencies.
- **Usage**: `pnpm run skott:check:only`
- **Goal**: Identify circular dependencies and provide a file-tree view of the project structure.

### 2. depcheck

- **Purpose**: Analyzes the dependencies in a project to see how each dependency is used, which dependencies are useless, and which dependencies are missing from `package.json`.
- **Usage**: `pnpm run depcheck`
- **Goal**: Keep dependencies clean and minimize bundle size.

### 3. madge

- **Purpose**: Generates a visual graph of your module dependencies, finds circular dependencies, and gives you other useful info.
- **Usage**: `pnpm run madge`
- **Goal**: Specifically focused on identifying circular dependencies in the `src` directory.

## Integration

These tools are integrated into the **Husky `pre-push` hook** to ensure no code with circular dependencies or unused packages is pushed to the repository.

```bash
pnpm run typecheck && pnpm run skott:check:only && pnpm run depcheck && pnpm run madge
```

## Testing

Run the individual commands to verify the current state of the project:

- `pnpm run skott:check:only`
- `pnpm run depcheck`
- `pnpm run madge`
