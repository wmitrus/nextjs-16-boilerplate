# Remediation Plan

## Objective

Suppress New Relic log file EROFS errors and Sentry SDK not-initialized warnings in non-development environments (Vercel and other production/preview deployments).

---

## Change 1 — `newrelic.js`: Redirect NR agent logs to stdout

### Problem

NR agent defaults log file to `process.cwd()/newrelic_agent.log`. On Vercel, CWD is `/var/task/` (read-only) → EROFS error on every cold start.

### Fix

Add `filepath: 'stdout'` to the `logging` section:

```javascript
logging: {
  level: 'info',
  filepath: 'stdout',
},
```

### Why `stdout` not `/tmp/`

- `stdout` is always writable in all environments (dev, Vercel, Docker, CI)
- No ephemeral file management needed
- Agent logs remain visible in local dev terminal and Vercel log drain
- Standard practice for serverless/container deployments

### Why not conditional

Making `filepath` conditional on `NODE_ENV` would suppress NR agent logs in production, which could hide real NR agent problems. Redirecting to `stdout` is universally correct and preserves observability.

---

## Change 2 — `src/sentry.server.config.ts`: Gate warn on `NODE_ENV === 'development'`

### Problem

`console.warn('[Sentry] Server SDK not initialized: ...')` fires unconditionally when `SENTRY_DSN` is absent. On Vercel preview/production without Sentry configured, this is noisy and misleading.

### Fix

Wrap the warn in a dev-only guard:

```typescript
} else if (process.env.NODE_ENV === 'development') {
  console.warn(
    '[Sentry] Server SDK not initialized: set SENTRY_DSN (preferred) or NEXT_PUBLIC_SENTRY_DSN.',
  );
}
```

### Rationale

The warning is a developer setup reminder — it has no value in CI, preview, or production. Gating it to development keeps local DX without polluting production logs.

---

## Affected Files

| File                          | Change Type                       | Risk     |
| ----------------------------- | --------------------------------- | -------- |
| `newrelic.js`                 | Config — add `filepath: 'stdout'` | Very low |
| `src/sentry.server.config.ts` | Code — add `NODE_ENV` guard       | Very low |

---

## Expected Outcome

After these changes:

- Vercel logs: no EROFS error from New Relic
- Vercel logs: no Sentry SDK not initialized warning
- Local dev: NR agent logs go to stdout (visible in terminal)
- Local dev: Sentry warning still appears when DSN not configured

---

## Risks

- None identified. Both changes are additive guards / config redirects with no behavioral regression.
