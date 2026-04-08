# Flow Trace Investigation

## New Relic Log File Error — Execution Path

### Entry Point: `src/instrumentation.ts` → `register()`

```
Next.js server start
  └── instrumentation.ts: register()
        ├── if NEXT_RUNTIME === 'nodejs'
        │     ├── if NEW_RELIC_ENABLED === 'true' && NEW_RELIC_LICENSE_KEY
        │     │     └── require('newrelic')
        │     │           └── NR agent initializes
        │     │                 └── tries to open log file
        │     │                       └── newrelic.js: logging.filepath defaults to CWD
        │     │                             └── /var/task/newrelic_agent.log → EROFS
        │     └── import('../sentry.server.config')
        └── if NEXT_RUNTIME === 'edge'
              └── import('../sentry.edge.config')
```

### Key state at divergence point

- `newrelic.js` `logging` config: `{ level: 'info' }` — no `filepath`
- NR agent default: write `newrelic_agent.log` relative to `process.cwd()`
- On Vercel: `process.cwd()` = `/var/task/` which is EROFS (read-only)
- Consequence: NR logs its own error to stderr on every cold start

### Resolution path for NR

Set `logging.filepath` in `newrelic.js` to a writable destination:

- `'stdout'` — standard for serverless/containerized environments (recommended)
- `'/tmp/newrelic_agent.log'` — writable on Vercel but lost between invocations

---

## Sentry SDK Warning — Execution Path

### Entry Point: `src/instrumentation.ts` → `register()` → `sentry.server.config.ts`

```
Next.js server start
  └── instrumentation.ts: register()
        └── import('../sentry.server.config')
              └── const sentryDsn = process.env.SENTRY_DSN ?? NEXT_PUBLIC_SENTRY_DSN
                    └── if sentryDsn → Sentry.init(...)
                        else → console.warn('[Sentry] Server SDK not initialized: ...')
```

### Key state at divergence point

- `SENTRY_DSN` not set in Vercel environment
- `NEXT_PUBLIC_SENTRY_DSN` not set either
- `sentryDsn` is `undefined`
- `console.warn` fires unconditionally in the `else` branch
- Warning appears in every function invocation log

### Resolution path for Sentry

Gate the `console.warn` behind a `NODE_ENV === 'development'` check — it is informational for local setup, but noise in production.

---

## Identity / Tenant Context

Not applicable — this incident is in observability SDK initialization, not in auth or tenant flows.

---

## Summary

Both issues stem from SDK initialization code that behaves differently in serverless/Vercel environments vs local development. Neither issue is a runtime functional regression; both are noisy log pollution that obscures meaningful signals in production logs.
