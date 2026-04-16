# Remediation Plan

**Step**: Remediation Plan
**Agent**: Debug Investigation Agent
**Date**: 2026-04-16
**Status**: PENDING USER CONFIRMATION on 2 items (see below)

---

## Root Causes Found

### Root Cause 1 — Beacon Not Set in `.env.local` (All Environments — Critical)

**Evidence**: `NEW_RELIC_BROWSER_BEACON` is NOT present in `.env.local`. Code defaults to `bam.eu01.nr-data.net` (EU). The correctness of this default cannot be verified from the codebase — it depends on which NR data center the account and active browser app (`538838547`) are in.

**Impact**: If the NR account is US, ALL browser telemetry is sent to the wrong endpoint → silently discarded → zero data in NR Browser.

**PENDING**: User must confirm the beacon from NR UI (see questions below).

### Root Cause 2 — `.env.example` Duplicate `NEW_RELIC_BROWSER_BEACON` (Configuration Bug)

**Evidence**: `.env.example` defines `NEW_RELIC_BROWSER_BEACON` twice:

- Line 51: `NEW_RELIC_BROWSER_BEACON=bam.eu01.nr-data.net` (NR Browser section)
- Line 70: `NEW_RELIC_BROWSER_BEACON=` (empty — misplaced in NerdGraph section)

**Impact**: Causes confusion when reading the file. Second empty entry appears in an unrelated section. Users who copy the beacon from line 51 may later override it (or not) depending on which line they reference.

**Fix**: Remove line 70's `NEW_RELIC_BROWSER_BEACON=` (it belongs to neither NerdGraph API nor the browser app config — it's a copy-paste error).

### Root Cause 3 — `NEW_RELIC_BROWSER_*` Vars Not Set on Vercel (Vercel Only — Critical)

**Evidence**: `.env.example` defaults `NEW_RELIC_BROWSER_ENABLED=false`. Vercel projects commonly use `.env.example` defaults for unset vars. If these vars are not explicitly configured in Vercel project settings → `getNrBrowserCdnConfig()` returns `null` at build time → prerendered layout has no `<script>` tags → zero NR Browser monitoring on Vercel.

**PENDING**: User must confirm which vars are set in Vercel project settings.

### Root Cause 4 — Active NR Browser App (`538838547`) Has No Task Documentation

**Evidence**: App ID `538838547` appears only in `.env.local`. No prior task artifact documents its creation, type (SPA vs rum/lite), or beacon configuration. The only documented app was `538837440` (archived).

**Impact**: Cannot verify app is correctly configured as "Pro + SPA" in NR UI.

**Action**: User must verify in NR UI → Browser app → Application settings.

---

## Questions Requiring User Confirmation

**Q1**: Open NR UI → your Browser app with ID `538838547` → Application settings → Copy/Paste JavaScript snippet. What is the `beacon` value in `NREUM.info`?

- Expected: either `bam.nr-data.net` (US) or `bam.eu01.nr-data.net` (EU)
- This determines whether the current code default is correct or wrong

**Q2**: In Vercel project settings → Environment Variables:

- Is `NEW_RELIC_BROWSER_ENABLED` set to `true`?
- Is `NEW_RELIC_BROWSER_LICENSE_KEY` set?
- Is `NEW_RELIC_BROWSER_APP_ID` set?
- Is `NEW_RELIC_BROWSER_ACCOUNT_ID` set?
- Is `NEW_RELIC_BROWSER_AGENT_URL` set?
- Which environments have these vars: Production only, Preview only, or both?

**Q3**: Is NR Browser app `538838547` configured as "Pro + SPA" in the NR UI Application settings?

---

## Confirmed Fixes (No User Confirmation Needed)

### Fix 1 — Remove Duplicate `NEW_RELIC_BROWSER_BEACON` from `.env.example`

**Files**: `.env.example`
**Change**: Remove line 70 (`NEW_RELIC_BROWSER_BEACON=` empty, misplaced in NerdGraph section)
**Risk**: None — line is empty and misplaced

### Fix 2 — Add `NEW_RELIC_BROWSER_BEACON` to `.env.local` with Explicit Value

After user confirms the correct beacon (Q1), add:

```shell
NEW_RELIC_BROWSER_BEACON=bam.nr-data.net   # or bam.eu01.nr-data.net based on Q1
```

This ensures the code doesn't rely on the hardcoded default and the value is explicit.

### Fix 3 — Update `.env.example` Beacon Default to Match Confirmed Beacon

After Q1 is answered, update line 51 of `.env.example` to show the correct beacon for this account.

---

## Conditional Fixes (After User Confirmation)

### Fix 4 — Configure Vercel Env Vars (if not already set — Q2)

Vercel Dashboard → Project → Settings → Environment Variables → Add/verify:

```
NEW_RELIC_BROWSER_ENABLED=true            (Production + Preview)
NEW_RELIC_BROWSER_LICENSE_KEY=<key>       (Production + Preview)
NEW_RELIC_BROWSER_APP_ID=538838547        (Production + Preview)
NEW_RELIC_BROWSER_ACCOUNT_ID=<accountId> (Production + Preview)
NEW_RELIC_BROWSER_AGENT_URL=<versioned>  (Production + Preview)
NEW_RELIC_BROWSER_BEACON=<confirmed>     (Production + Preview)
```

A **redeploy is required** after setting these vars.

### Fix 5 — Update NR Browser App Type (if not "Pro + SPA" — Q3)

NR UI → Browser app → Application settings → change "Browser agent type" to "Pro + SPA".
No code changes required.

---

## Expected Result After All Fixes

| Environment       | Expected Behavior                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Local dev         | NREUM config injected with correct beacon → NR Browser app `538838547` receives PageView, BrowserInteraction events |
| Vercel preview    | Prerendered layout includes NR scripts (env vars set) → NR Browser receives events                                  |
| Vercel production | Same as preview                                                                                                     |
