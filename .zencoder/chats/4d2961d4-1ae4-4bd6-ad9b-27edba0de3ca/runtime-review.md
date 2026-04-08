# Runtime Behavior Review

## Runtime Context

- **Runtime**: Node.js (`NEXT_RUNTIME=nodejs`)
- **Trigger**: `instrumentation.ts:register()` — runs once per server start / cold start
- **Platform**: Vercel serverless Lambda
- **CWD**: `/var/task/` — deployed artifacts, **read-only**
- **Writable at runtime**: `/tmp/` only

---

## New Relic Agent Initialization

### Behavior

`require('newrelic')` in `instrumentation.ts` triggers the NR agent bootstrap. The agent reads `newrelic.js` at module load time. The `logging` config section controls where agent logs are written.

### Current `newrelic.js` config

```javascript
logging: {
  level: 'info',
  // filepath not set → defaults to CWD/newrelic_agent.log
}
```

### Vercel constraint

Vercel Lambda filesystem layout:

- `/var/task/` — deployment artifacts, **read-only** (EROFS)
- `/tmp/` — ephemeral, writable, per-invocation (max 512 MB)
- `stdout`/`stderr` — always writable, captured by Vercel log drain

The NR agent falls back to `process.cwd() + '/newrelic_agent.log'` when `filepath` is not configured. On Vercel, `process.cwd()` = `/var/task/` → EROFS error.

### Correct configuration

Per New Relic Node.js agent docs, `logging.filepath` accepts:

- `'stdout'` — writes to process stdout (standard for containers/serverless)
- `'stderr'` — writes to process stderr
- Absolute path string — must point to a writable location

**Recommended fix**: Set `filepath: 'stdout'` unconditionally. This is the correct pattern for any containerized or serverless deployment. Dev logs remain visible in the terminal via stdout.

---

## Sentry SDK Warning

### Behavior

`sentry.server.config.ts` runs during `register()`. It performs a conditional init:

```typescript
if (sentryDsn) {
  Sentry.init({ ... });
} else {
  console.warn('[Sentry] Server SDK not initialized: ...');
}
```

### Framework interaction

The `register()` hook runs once per server cold start in Next.js 16. In Vercel's serverless model, this may fire per function container creation, meaning once per Lambda lifecycle. The `console.warn` goes to stdout and is captured in the Vercel function log.

### Correct behavior

The warning exists to help developers notice missing Sentry config during local setup. It should be gated to `NODE_ENV === 'development'` or `NODE_ENV !== 'production'` — it has no value in production/preview deployments and creates log noise.

---

## App Router / Middleware Notes

- No `middleware.ts` — middleware lives in `src/proxy.ts` (not affected by this incident)
- No `export const dynamic` / `export const runtime` violations — N/A here
- `await connection()` pattern — not applicable (this is instrumentation, not a route handler)

---

## Caching / Rendering

Not applicable — both issues occur in initialization code, not in request-level rendering.

---

## Summary

Both issues are initialization-time, Node.js runtime only. The fixes are low-risk config/code changes confined to `newrelic.js` and `src/sentry.server.config.ts`. No App Router, caching, or rendering concerns are involved.
