# Feature: Configuration & Environment (Phase 2)

## Architectural Decisions

- Use `@t3-oss/env-nextjs` for runtime validation.
- Store configuration in `src/core/env.ts`.
- Automate environment sync via scripts in `/scripts`.

## Tasks

### Phase 2: Configuration & Environment

- [x] **Environment Management** - Type-safe runtime validation via T3-Env.
  - [x] Install `@t3-oss/env-nextjs` and `zod`.
  - [x] Create `src/core/env.ts` with server/client schema.
  - [x] Create `.env.example`.
- [x] **Environment Tooling** - Automation scripts for branch-based setup.
  - [x] Create `scripts/setup-env.mjs`.
  - [x] Create `scripts/check-env-consistency.mjs`.
  - [x] Add pnpm scripts to `package.json`.
  - [x] Integrate `env:check` into `pre-push` hook.

## Verification

- [x] Run `pnpm typecheck`
- [x] Run `pnpm lint`
- [x] Run `pnpm env:check`
