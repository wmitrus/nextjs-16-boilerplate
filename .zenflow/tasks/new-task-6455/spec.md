# Technical Specification: Next.js 16 Project Scaffold

## Technical Context

### Environment
- **Runtime**: Node.js 18.17+ (required for Next.js 16)
- **Package Manager**: pnpm (latest)
- **Platform**: Cross-platform (Windows/macOS/Linux)
- **Working Directory**: `C:\Users\wmitr\.zenflow\worktrees\new-task-6455`

### Core Dependencies
- **next**: ^16.x (latest stable)
- **react**: ^19.x (compatible with Next.js 16)
- **react-dom**: ^19.x
- **typescript**: ^5.x
- **eslint**: ^9.x
- **tailwindcss**: ^3.x

### Dev Dependencies
- **@types/node**: Latest
- **@types/react**: Latest
- **@types/react-dom**: Latest
- **eslint-config-next**: Next.js ESLint configuration
- **postcss**: PostCSS for Tailwind
- **autoprefixer**: CSS vendor prefixing

## Implementation Approach

### Phase 1: Scaffolding
Use the official `create-next-app` CLI tool to generate the project structure:

```bash
pnpm create next-app@latest . --typescript --eslint --tailwind --src-dir --app --import-alias "@/*"
```

**CLI Flags Explained**:
- `.`: Create in current directory
- `--typescript`: Enable TypeScript
- `--eslint`: Configure ESLint
- `--tailwind`: Add Tailwind CSS
- `--src-dir`: Use `src/` directory structure
- `--app`: Use App Router (Next.js 13+ default)
- `--import-alias "@/*"`: Configure path alias

### Phase 2: Verification
After scaffolding, verify:
1. All dependencies installed successfully
2. TypeScript configuration is strict
3. ESLint runs without errors
4. Development server starts successfully
5. Project builds without errors

## Source Code Structure

The `create-next-app` command will generate the following structure:

```
C:\Users\wmitr\.zenflow\worktrees\new-task-6455\
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with metadata
│   │   ├── page.tsx                # Home page component
│   │   ├── globals.css             # Global styles with Tailwind directives
│   │   └── favicon.ico             # Default favicon
│   └── (additional directories created as needed)
├── public/
│   └── (static assets)
├── .gitignore                      # Node.js/Next.js gitignore
├── package.json                    # Project metadata and scripts
├── pnpm-lock.yaml                  # pnpm lockfile
├── tsconfig.json                   # TypeScript config with path aliases
├── next.config.ts                  # Next.js configuration (TypeScript)
├── tailwind.config.ts              # Tailwind configuration (TypeScript)
├── postcss.config.mjs              # PostCSS config for Tailwind
└── eslint.config.mjs               # ESLint flat config (ESLint 9+)
```

### Key Configuration Files

#### tsconfig.json
Expected configuration includes:
- `"strict": true` for strict type checking
- Path mapping: `"@/*": ["./src/*"]`
- Target: ES2017 or later
- Module: ESNext
- JSX: preserve

#### eslint.config.mjs
Next.js 16 uses ESLint 9+ flat config:
- `next/core-web-vitals` rules enabled
- TypeScript-aware linting
- React hooks rules

#### next.config.ts
TypeScript-based Next.js configuration:
- Default optimizations
- Image optimization enabled
- Strict mode enabled

## Data Model / API Changes

**N/A** - This is a new project scaffold with no existing data models or APIs.

## Delivery Phases

### Phase 1: Execute Scaffolding Command
**Task**: Run the `create-next-app` command with specified flags
- **Input**: CLI command with configuration flags
- **Output**: Complete Next.js project structure
- **Duration**: ~2-5 minutes (depends on network speed)

### Phase 2: Post-Scaffold Verification
**Task**: Verify the generated project meets requirements
- Check `.gitignore` includes common patterns
- Verify TypeScript strict mode in `tsconfig.json`
- Confirm `@/*` alias configuration
- Ensure pnpm lockfile exists
- Validate ESLint configuration

### Phase 3: Functional Testing
**Task**: Run the project to ensure it works
- Install dependencies (if not auto-installed)
- Start development server: `pnpm dev`
- Verify server runs on http://localhost:3000
- Check for TypeScript/ESLint errors: `pnpm lint`
- Test build process: `pnpm build`

## Verification Approach

### Pre-execution Checks
1. Verify current directory is empty or acceptable for project creation
2. Confirm pnpm is installed: `pnpm --version`
3. Confirm Node.js version: `node --version` (must be 18.17+)

### Post-execution Verification

#### 1. Structure Verification
```bash
# Verify key directories exist
ls src/app
ls public

# Verify configuration files
ls tsconfig.json next.config.ts tailwind.config.ts eslint.config.mjs
```

#### 2. TypeScript Verification
```bash
# Check for type errors
pnpm exec tsc --noEmit
```

Expected: No errors

#### 3. ESLint Verification
```bash
# Run linting
pnpm lint
```

Expected: No errors or warnings in scaffolded code

#### 4. Development Server Verification
```bash
# Start dev server
pnpm dev
```

Expected:
- Server starts successfully
- Accessible at http://localhost:3000
- No runtime errors in console

#### 5. Build Verification
```bash
# Create production build
pnpm build
```

Expected:
- Build completes successfully
- Generates `.next` directory
- No TypeScript or build errors

### Success Criteria Checklist
- [ ] `create-next-app` command executes successfully
- [ ] Project structure matches expected layout
- [ ] `tsconfig.json` has strict mode and `@/*` alias
- [ ] `eslint.config.mjs` exists with Next.js config
- [ ] `pnpm-lock.yaml` generated
- [ ] `pnpm dev` starts server successfully
- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm build` completes successfully
- [ ] `.gitignore` includes node_modules, .next, dist, build

## Risk Mitigation

### Potential Issues

1. **Directory Not Empty**: `create-next-app` may fail if directory has files
   - **Mitigation**: Check directory contents before running command
   
2. **Version Compatibility**: Next.js 16 may not be available yet
   - **Mitigation**: Use latest available version (likely 15.x if 16 not released)
   
3. **pnpm Not Installed**: Command will fail without pnpm
   - **Mitigation**: Install pnpm globally: `npm install -g pnpm`

4. **Node.js Version Mismatch**: Older Node.js may not support Next.js 16
   - **Mitigation**: Verify Node.js version before execution

## Implementation Notes

- The `create-next-app` tool handles all configuration automatically
- Minimal post-generation modification needed
- All requirements satisfied by official scaffolding command
- Generated code follows Next.js best practices and conventions
