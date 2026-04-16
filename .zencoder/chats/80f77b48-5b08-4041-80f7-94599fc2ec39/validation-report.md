# Validation Report

**Step**: 8 — Validation
**Date**: 2026-04-13
**Status**: complete — all checks pass

---

## Commands Run

### TypeScript

```shell
pnpm typecheck
```

**Result**: ✓ Exit 0, no errors.

### ESLint

```shell
pnpm lint --fix
```

**Result**: ✓ Exit 0. 4 warnings in pre-existing unrelated files (scripts/flags/export.ts, scripts/flags/import.ts, scripts/load-env.ts, StaticFeatureFlagService.ts). 0 errors. 0 new issues in changed files.

### Unit Tests

```shell
pnpm test
```

**Result**: ✓ 146 test files passed, 1007 tests passed.

---

## Verification of Expected Behavior

### Inline NR config in HTML

After fix, when `NEW_RELIC_BROWSER_ENABLED=true` + required credentials set, the rendered HTML `<head>` will contain:

```html
<script>
  window.NREUM || (NREUM = {});
  NREUM.init = {
    distributed_tracing: { enabled: true },
    privacy: { cookies_enabled: true },
    ajax: { deny_list: ['bam.nr-data.net'] },
  };
  NREUM.loader_config = {
    accountID: '...',
    trustKey: '...',
    agentID: '...',
    licenseKey: '...',
    applicationID: '...',
  };
  NREUM.info = {
    beacon: 'bam.nr-data.net',
    errorBeacon: 'bam.nr-data.net',
    licenseKey: '...',
    applicationID: '...',
    sa: 1,
  };
</script>
<script src="https://js-agent.newrelic.com/nr-spa.min.js"></script>
```

The `nr-spa.min.js` script is loaded `beforeInteractive` — before React hydration.

### Route handler (APM path, unchanged)

- `NEW_RELIC_ENABLED=false` → empty 200 ✓
- `NEW_RELIC_ENABLED=true`, no license key → empty 200 ✓
- `NEW_RELIC_ENABLED=true`, license key set, APM not connected (Vercel) → empty 200 + `console.info` ✓
- `NEW_RELIC_ENABLED=true`, APM connected (local dev) → JS snippet 200 ✓

---

## Manual Verification Required (Vercel)

These checks require a Vercel deploy:

| Check                                   | How to verify                                                  |
| --------------------------------------- | -------------------------------------------------------------- |
| Inline NREUM config in `<head>`         | View page source → `<head>` section                            |
| `nr-spa.min.js` loaded before hydration | DevTools → Network → check request timing                      |
| No CSP errors                           | DevTools → Console → no Content-Security-Policy errors         |
| NR Browser PageView event               | NR UI → Browser → your app → verify event arrives within 2 min |
| NR Browser error tracking               | Trigger a JS error → verify in NR Errors inbox                 |

**Prerequisite**: Vercel environment variables must be set:

- `NEW_RELIC_BROWSER_ENABLED=true`
- `NEW_RELIC_BROWSER_LICENSE_KEY=<browser app license key from NR UI>`
- `NEW_RELIC_BROWSER_APP_ID=<numeric app ID from NR UI>`
- `NEW_RELIC_BROWSER_ACCOUNT_ID=<NR account ID, e.g. 6443682>`
