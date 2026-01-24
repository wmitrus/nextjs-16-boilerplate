# Technical Specification - Component Library (Storybook 10 + Vite)

## Technical Context

- **Framework**: Next.js 16.1.4
- **Runtime**: React 19.2.3
- **Styling**: Tailwind CSS 4
- **Storybook**: Storybook 10
- **Builder**: Vite (via `@storybook/nextjs-vite`)
- **Package Manager**: pnpm

## Implementation Approach

### 1. Installation

The user will run the official Storybook initialization script:

```bash
pnpm dlx storybook@latest init
```

_Note: During initialization, the user should ensure the Vite builder is selected if prompted, though `@storybook/nextjs-vite` is the target._

### 2. Configuration

- `.storybook/main.ts`:
  - Framework: `@storybook/nextjs-vite`
  - Core Builder: `@storybook/builder-vite`
- `.storybook/preview.ts`: Import `src/app/globals.css` for Tailwind CSS 4.
- **Vite Integration**: Leverage Vite's native support for absolute imports and optimized asset handling.

### 3. Source Code Structure

- `.storybook/`: Configuration files.
- `src/shared/components/Button/`: Example component.
  - `Button.tsx`: Component implementation.
  - `Button.stories.tsx`: Story definition.
  - `Button.test.tsx`: Interaction test.

### 4. Integration with Next.js 16/React 19

- **Vite-Specific**: Enhanced support for Next.js features like Image/Font optimization and Routing within the Vite-based Storybook environment.
- **React 19**: Standard CSF3 stories with `play` functions for interaction testing.

## Delivery Phases

### Phase 1: Guided Initialization

- Provide the user with the command to run the official Storybook script.
- Confirm successful initialization.

### Phase 2: Configuration for Vite & Next.js 16

- Update `.storybook/main.ts` to use `@storybook/nextjs-vite`.
- Configure `preview.ts` for Tailwind CSS 4.

### Phase 3: Example Component

- Implement `Button` component with stories and tests.

### Phase 4: Verification

- Run `pnpm storybook`.
- Run `pnpm lint` and `pnpm typecheck`.

## Verification Approach

- **Linting**: `pnpm lint`
- **Type Checking**: `pnpm typecheck`
- **Functional**: Manual verification of Storybook UI.
- **Automated**: `vitest` for interaction tests.
