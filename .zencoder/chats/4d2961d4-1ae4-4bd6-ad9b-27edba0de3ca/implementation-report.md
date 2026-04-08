# Implementation Report

## Changes Applied

### 1. `newrelic.js` — Add `filepath: 'stdout'` to logging config

Added `filepath: 'stdout'` to the `logging` section so the NR agent writes its internal logs to stdout instead of trying to create a file in the read-only `/var/task/` directory on Vercel.

**Before**:

```javascript
logging: {
  level: 'info',
},
```

**After**:

```javascript
logging: {
  level: 'info',
  filepath: 'stdout',
},
```

### 2. `sentry.server.config.ts` — Gate `console.warn` to `NODE_ENV === 'development'`

Changed the `else` branch to `else if (process.env.NODE_ENV === 'development')` so the "SDK not initialized" warning only appears in local development.

**Before**:

```typescript
} else {
  console.warn(
    '[Sentry] Server SDK not initialized: set SENTRY_DSN (preferred) or NEXT_PUBLIC_SENTRY_DSN.',
  );
}
```

**After**:

```typescript
} else if (process.env.NODE_ENV === 'development') {
  console.warn(
    '[Sentry] Server SDK not initialized: set SENTRY_DSN (preferred) or NEXT_PUBLIC_SENTRY_DSN.',
  );
}
```

## Tests Updated

No tests required updates — these are SDK configuration/initialization changes with no unit test surface.

## Files Changed

| File                      | Change                                               |
| ------------------------- | ---------------------------------------------------- |
| `newrelic.js`             | Added `filepath: 'stdout'` to `logging` block        |
| `sentry.server.config.ts` | Gated `console.warn` to `NODE_ENV === 'development'` |
