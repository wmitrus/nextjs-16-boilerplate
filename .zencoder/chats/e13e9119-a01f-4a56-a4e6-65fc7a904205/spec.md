# Technical Specification - Structured Logging (Pino)

## 1. Technical Context

- **Language**: TypeScript
- **Runtime**: Node.js, Browser, Edge
- **Dependencies**: `pino`, `pino-pretty`, `pino-logflare`
- **Framework**: Next.js 16.2

## 2. Implementation Approach

### 2.1 Location

The logger will be moved to `src/core/logger` as it is a foundational utility used across all features and shared components.

### 2.2 Environmental Splitting

Instead of large `if/else` blocks in a single file, we will use a strategy pattern or environmental modules:

- `src/core/logger/index.ts`: Public API and environment selection.
- `src/core/logger/server.ts`: Node.js specific configuration (transports, files).
- `src/core/logger/browser.ts`: Browser specific configuration (lightweight).
- `src/core/logger/edge.ts`: Edge runtime specific configuration.
- `src/core/logger/streams.ts`: Logic to build streams declaratively.

### 2.3 Declarative Stream Preparation

We will use an array-based approach to collect streams and filter out falsy values, avoiding nested `if` statements.

```typescript
const streams = [
  createConsoleStream(),
  shouldLogToFile && createFileStream(),
  shouldLogToLogflare && createLogflareStream(),
].filter(Boolean);
```

### 2.4 Security

The logger will use Pino's `redact` option to prevent sensitive keys from being logged.

## 3. Source Code Structure Changes

- **Delete**: `src/shared/lib/logger/*`
- **Create**:
  - `src/core/logger/index.ts`
  - `src/core/logger/server.ts`
  - `src/core/logger/browser.ts`
  - `src/core/logger/edge.ts`
  - `src/core/logger/streams.ts`
  - `src/core/logger/utils.ts` (helper functions)

## 4. Environment Variables (`src/core/env.ts`)

Add the following to the schema:

- `LOG_LEVEL`: `z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')`
- `LOG_DIR`: `z.string().default('logs')`
- `LOG_TO_FILE_DEV`: `z.coerce.boolean().default(false)`
- `LOG_TO_FILE_PROD`: `z.coerce.boolean().default(false)`
- `LOGFLARE_INTEGRATION_ENABLED`: `z.coerce.boolean().default(false)`
- `LOGFLARE_API_KEY`: `z.string().optional()`
- `LOGFLARE_SOURCE_TOKEN`: `z.string().optional()`

## 5. Delivery Phases

1. **Phase 1: Setup**: Install dependencies and update `src/core/env.ts`.
2. **Phase 2: Core Implementation**: Create the new logger structure in `src/core/logger`.
3. **Phase 3: Cleanup**: Remove old files and update references.
4. **Phase 4: Verification**: Run tests and lint.

## 6. Verification Approach

- **Unit Tests**: Test stream creation and environment selection.
- **Linting**: `pnpm lint`
- **Type Checking**: `pnpm typecheck`
- **Manual Verification**: Verify logs in dev console and (if possible) simulated production environment.
