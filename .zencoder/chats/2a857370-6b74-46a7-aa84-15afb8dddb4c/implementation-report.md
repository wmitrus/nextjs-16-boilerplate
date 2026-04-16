# Implementation Report

**Step**: Implementation
**Agent**: Implementation Agent
**Date**: 2026-04-16
**Status**: complete

---

## Scope

Three confirmed root causes addressed; two require Vercel operator action (no code change).

---

## Code Changes

### 1. `src/core/observability/new-relic-browser.ts`

**Added**: Named beacon constants — `NR_BEACON_EU`, `NR_BEACON_US`, `NR_BEACON_FALLBACK` (exported)
**Changed**: `getNrBrowserCdnConfig()` now requires `NEW_RELIC_BROWSER_ACCOUNT_ID` to be set — previously defaulted to empty string `''` which produced an invalid `NREUM.loader_config.accountID: ""`. Function now returns `null` when account ID is missing.
**Changed**: `isNrBrowserCdnEnabled()` now also checks `ACCOUNT_ID` (to stay consistent with `getNrBrowserCdnConfig()` guards).
**Removed**: `accountId: env.NEW_RELIC_BROWSER_ACCOUNT_ID ?? ''` default — replaced with required guard.

### 2. `src/core/observability/new-relic-browser.test.ts`

**Replaced** stale test "defaults accountId to empty string when ACCOUNT_ID is missing" with "returns null when account ID is missing" (matches new guard behavior).
**Added**: Tests for named beacon constants (`NR_BEACON_EU`, `NR_BEACON_US`, `NR_BEACON_FALLBACK`).
**Added**: Test "uses EU beacon fallback when BEACON env var is not set" (explicitly verifies the EU fallback).
**Added**: Test "uses explicit beacon when BEACON env var is set" (verifies US beacon override and `deny_list` updates correctly).
**Updated**: All `isNrBrowserCdnEnabled` tests now set `ACCOUNT_ID` where required.
**Fixed**: Incorrect `ajax.deny_list` check that expected `bam.nr-data.net` (US) — the fallback is EU (`bam.eu01.nr-data.net`).

### 3. `src/testing/infrastructure/env.ts`

**Added**: `NEW_RELIC_BROWSER_BEACON: undefined` to the test mock env stub.

### 4. `.env.example`

**Removed**: Duplicate `NEW_RELIC_BROWSER_BEACON=` from line 70 (misplaced in the NerdGraph/debugging section — was a copy-paste error).
Now has exactly ONE `NEW_RELIC_BROWSER_BEACON=bam.eu01.nr-data.net` entry (line 51, in the correct NR Browser section).

### 5. `.env.local`

**Added**: `NEW_RELIC_BROWSER_BEACON=bam.eu01.nr-data.net` (was previously absent; code relied on hardcoded fallback which was invisible to operators).

---

## Operator Actions Required (Vercel)

These fixes require Vercel dashboard changes + redeployment — no code change:

### Action 1 — Add `NEW_RELIC_BROWSER_BEACON` to Vercel project settings

Vercel currently has no `NEW_RELIC_BROWSER_BEACON` env var. The code defaults correctly to `bam.eu01.nr-data.net`, but making it explicit prevents future silent misconfiguration.

**Vercel Dashboard → Project → Settings → Environment Variables → Add:**

```
Name:  NEW_RELIC_BROWSER_BEACON
Value: bam.eu01.nr-data.net
Environments: All Environments (Production, Preview, Development)
```

### Action 2 — Redeploy Production

`NEW_RELIC_BROWSER_LICENSE_KEY` for Production was added 55 seconds before the investigation concluded. The last Production Vercel build happened BEFORE the license key existed. `getNrBrowserCdnConfig()` returned `null` in that build → no NR scripts in prerendered HTML.

**Trigger a Production redeploy** after setting the beacon var (Action 1).

### Action 3 — Redeploy Preview

Verify the most recent Preview deployment was created AFTER `NEW_RELIC_BROWSER_LICENSE_KEY` and `NEW_RELIC_BROWSER_APP_ID` were set for Preview (2 days ago). If uncertain, trigger a Preview redeploy.

---

## Root Cause Summary

| Environment       | Root Cause                                                                    | Fix                                             |
| ----------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| All               | `NEW_RELIC_BROWSER_BEACON` not explicit — relying on code default             | Added to `.env.local` and documented for Vercel |
| All               | `ACCOUNT_ID` guard missing — could return invalid config                      | Code fix: `null` guard added                    |
| Vercel Production | `LICENSE_KEY` missing at build time → `null` config → no scripts              | Var added; **redeploy required**                |
| Vercel Preview    | Potential no redeploy since vars set                                          | **Redeploy required** to verify                 |
| Local             | Config was correct; data goes to app `538838547` (check this entity in NR UI) | No code change needed                           |

---

## Test Results

- `pnpm typecheck` ✅ clean
- `pnpm lint --fix` ✅ 0 errors (4 pre-existing warnings in unrelated files)
- `pnpm test` ✅ 1020/1020 tests pass (146 test files)
