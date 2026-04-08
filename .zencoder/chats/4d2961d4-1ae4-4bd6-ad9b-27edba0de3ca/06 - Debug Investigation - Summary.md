# 06 — Debug Investigation Summary

**Task**: `4d2961d4-1ae4-4bd6-ad9b-27edba0de3ca`
**Date**: 2026-04-08
**Status**: ✅ Root cause identified — awaiting user verification

---

## Problem Statement

New Relic browser monitoring works locally and on Vercel preview (with delay) but shows **no browser data** for the production entity (`nextjs-16-boilerplate`) after 20+ minutes.

---

## Delivery Chain (Verified)

```text
layout.tsx
  → <Script src="/observability/new-relic-browser.js" strategy="beforeInteractive">
    → GET /observability/new-relic-browser.js route
      → getBrowserAgentScriptSafe()
        → [1st] getBrowserTimingHeaderSafe()     ← requires isConnected() = true
              → nr.getBrowserTimingHeader()       ← returns '<!-- -->' if browser monitoring disabled
        → [2nd] NEW_RELIC_BROWSER_SNIPPET_BASE64 ← NOT SET on Vercel (88KB > 64KB limit)
        → [3rd] NEW_RELIC_BROWSER_SNIPPET        ← NOT SET on Vercel
        → [4th] readRawSnippetFromEnvFiles()     ← reads .env.local/.env — NOT PRESENT on Vercel
        → '' (empty)                             ← result when all fail
```

---

## Root Causes (Priority Order)

### Root Cause 1 — MOST LIKELY: Browser Monitoring Not Enabled for Production Entity

**What happens**: `getBrowserTimingHeader()` returns `<!-- NR head tag ... -->` (HTML comment) when browser monitoring is **not enabled** for the NR entity. The guard `header.startsWith('<!--')` returns `''`.

**Why preview works but production doesn't**: Each NR entity (`nextjs-16-boilerplate` vs `nextjs-16-boilerplate-preview`) must have browser monitoring **separately enabled** in NR UI. If the production entity was created earlier without enabling browser monitoring, `getBrowserTimingHeader()` always returns an empty comment for production requests.

**Evidence**: Preview "came after a while" — consistent with browser monitoring being enabled for that entity but NR needing 5-15 minutes to process and display data after the first browser load.

**Verification**: In NR UI → APM → Applications → `nextjs-16-boilerplate` (production) → Settings → Application → check if "Browser monitoring" section shows "Enabled".

**Fix**: Enable browser monitoring for `nextjs-16-boilerplate` in NR UI. Set to **Pro + SPA**.

---

### Root Cause 2 — SECONDARY: Cold Start `isConnected()` = false

**What happens**: On Vercel Node.js serverless, the NR APM agent needs ~1-3 seconds after cold start to establish a TCP connection to the NR collector. During this window, `nr.agent?.collector?.isConnected()` returns `false` → empty browser script.

**Pattern**: If production traffic is infrequent, every request may be a cold start → `isConnected()` always false → browser script always empty. Preview may have had enough traffic to warm up the function.

**Interaction with caching**: The layout HTML is cached at Vercel's edge CDN. The browser fetches `<Script src="/observability/new-relic-browser.js">` on every page load. This hits a NEW serverless function invocation each time (no-store + dynamic rendering via `await connection()`). If that invocation is cold, the script is empty.

---

### Root Cause 3 — CONFIRMED FIXED: `readRawSnippetFromEnvFiles()` on Vercel

The fallback `readRawSnippetFromEnvFiles()` tries to read `.env.local` and `.env` from `process.cwd()`. On Vercel, neither file exists in `/var/task/`. `fs.existsSync()` returns `false` → no EROFS error → returns `''`. This is handled correctly but means there is no env-file fallback on Vercel.

---

## Diagnostic Evidence Needed

To confirm Root Cause 1 vs 2, the user should:

```bash
# Curl the production browser route multiple times (different cold/warm states)
curl -I https://nextjs-16-boilerplate.vercel.app/observability/new-relic-browser.js
curl -v https://nextjs-16-boilerplate.vercel.app/observability/new-relic-browser.js | head -20
```

- **If response is empty (0 bytes)**: Browser monitoring disabled for production entity OR `isConnected()` = false
- **If response has JS content**: Route works, but data not showing in NR UI yet (wait longer)

Also check Vercel logs for the production function — if NR agent logs show `isConnected: false` repeatedly, that's Root Cause 2.

---

## Caching Concern — Answered

**"Is it possible data is not coming when cached?"**

Partially yes, specifically:

- Page HTML IS cached at Vercel's edge CDN — `<Script src="...">` is in the cached HTML ✅ (browser still fetches the script)
- Browser script route has `Cache-Control: no-store` + `await connection()` — NOT cached at CDN ✅
- BUT if the serverless function handling the script route cold-starts → `isConnected()` = false → empty response → browser gets empty script → no tracking for that page view

So: **yes, caching + cold start interaction means some page views will have no browser tracking** even when the setup is correct.

---

## Fix Options

### Fix A — User Action Required: Enable Browser Monitoring for Production Entity

1. NR UI → APM → Applications → `nextjs-16-boilerplate`
2. Settings → Application → Browser Monitoring → Enable
3. Set instrumentation type to **Pro + SPA**
4. Wait 5-15 minutes after first production page load

### Fix B — Code: Add Diagnostic Logging to Route

Add a log line to `/observability/new-relic-browser.js` route to report `isConnected()` state in Vercel logs. This helps diagnose cold start issues without changing behavior.

### Fix C — Architecture: Mitigate Cold Start Gap (Future Work)

The `isConnected()` guard is necessary (banning `allowTransactionlessInjection: true`). Options to reduce cold start miss rate:

- Add a short retry loop (e.g., 3x with 500ms wait) in `getBrowserTimingHeaderSafe()` before returning empty
- This adds up to 1.5s latency on cold starts but ensures more consistent browser tracking
- **Risk**: Increases Lambda execution time and cost; must be timeboxed

---

## Recommended Immediate Actions

1. **User action (now)**: Verify NR UI → `nextjs-16-boilerplate` (production entity) → browser monitoring enabled + Pro + SPA set
2. **Code (diagnostic)**: Add `console.log` or logger debug output to route when snippet is empty — helps confirm Root Cause 2
3. **After enabling**: Wait 10 minutes, navigate production app, check NR Browser for `nextjs-16-boilerplate`

---

## What Was Already Ruled Out

- ❌ EROFS error from `readRawSnippetFromEnvFiles()` — files don't exist, no error thrown
- ❌ CSP blocking NR beacon — `bam.eu01.nr-data.net` already in `connect-src`
- ❌ 88KB snippet via env var — documented constraint, not the fix path
- ❌ `allowTransactionlessInjection: true` — BANNED (SPA harvest crash)
- ❌ Wrong SPA agent type — confirmed via curl: 66,258 bytes with `spa` + `softNav` strings
- ❌ `onRouterTransitionStart` missing — already fixed in `instrumentation-client.ts`
