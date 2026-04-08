# Validation Strategy

## Change Risk Classification

**Overall risk: Very Low**

Both changes are:

- Isolated to SDK initialization code (not business logic)
- No auth, authorization, DI, or route handler changes
- No new dependencies
- Observable behavior only changes in logging output

---

## Minimum Required Validation

### 1. TypeScript typecheck

```bash
pnpm typecheck
```

Required to verify the `NODE_ENV` guard in `sentry.server.config.ts` compiles cleanly.

### 2. Lint

```bash
pnpm lint --fix
```

Required to verify no ESLint violations introduced.

---

## Optional Additional Validation

### Unit test review

- `src/core/observability/new-relic.test.ts` — verify tests still pass (no NR config changes affect this)
- `src/app/observability/new-relic-browser.js/route.test.ts` — verify route handler tests pass

```bash
pnpm test
```

### Manual smoke check (recommended for Vercel)

After deploying, check Vercel function logs to confirm:

- No EROFS error
- No Sentry SDK warning

---

## Validation Not Required

- E2E tests — no user-facing behavior changes
- Integration tests — no DB, auth, or API changes
- Architecture lint (`pnpm arch:lint`) — no module boundary changes; still worth running per standard workflow

---

## Validation Commands

```bash
pnpm typecheck
pnpm lint --fix
pnpm test
pnpm arch:lint
```
