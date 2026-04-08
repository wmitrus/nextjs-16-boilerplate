# Incident Intake

## Incident Summary

**Reported**: 2026-04-08  
**Environment**: Vercel (production/preview deployments)  
**Severity**: Low — noisy logs, no user-facing functional impact  
**Reporter**: User (Vercel function logs observation)

---

## Symptoms

Two distinct error/warning messages appear in Vercel function logs on every request:

### 1. New Relic Log File Error

```text
New Relic failed to open log file /var/task/newrelic_agent.log
[Error: EROFS: read-only file system, open '/var/task/newrelic_agent.log'] {
  errno: -30,
  code: 'EROFS',
  syscall: 'open',
  path: '/var/task/newrelic_agent.log'
}
```

### 2. Sentry SDK Initialization Warning

```text
[Sentry] Server SDK not initialized: set SENTRY_DSN (preferred) or NEXT_PUBLIC_SENTRY_DSN.
```

---

## Environment

- **Platform**: Vercel (serverless Node.js functions)
- **Runtime**: Node.js (Next.js App Router, `NEXT_RUNTIME=nodejs`)
- **Filesystem**: `/var/task/` is read-only (EROFS — Error Read-Only File System)
- **`/tmp/`**: Writable on Vercel
- **New Relic enabled**: Yes (`NEW_RELIC_ENABLED=true`, `NEW_RELIC_LICENSE_KEY` set)
- **Sentry DSN**: Not configured in Vercel environment

---

## Root Causes

### New Relic

- `newrelic.js` config has `logging: { level: 'info' }` but no `filepath`
- New Relic agent defaults log file to `newrelic_agent.log` relative to CWD (`/var/task/`)
- Vercel Lambda container mounts CWD (`/var/task/`) as read-only
- Agent cannot create the log file → EROFS error on every cold start / request

### Sentry

- `src/sentry.server.config.ts` logs `console.warn(...)` when `sentryDsn` is absent
- Sentry DSN not configured in Vercel env → warning fires every request
- The warn is appropriate for dev but is noisy and misleading in production/preview

---

## Affected Files

| File                          | Issue                                                  |
| ----------------------------- | ------------------------------------------------------ |
| `newrelic.js`                 | Missing `logging.filepath` → defaults to read-only CWD |
| `src/sentry.server.config.ts` | `console.warn` fires in all environments, not just dev |

---

## Reproduction Steps

1. Deploy to Vercel with `NEW_RELIC_ENABLED=true`, `NEW_RELIC_LICENSE_KEY` set, and no `SENTRY_DSN`
2. Trigger any request (e.g., GET `/`, `/feature-flags-demo`, `/security-showcase`)
3. Observe Vercel function logs → both errors appear

---

## User Expectation

> "It should only write this log on dev, but not on Vercel."

Both messages should be suppressed or redirected in non-development environments.

---

## Status

- [ ] Flow trace investigation
- [ ] Runtime review
- [ ] Architecture review
- [ ] Remediation plan
- [ ] Implementation
- [ ] Validation
