# Final Implementation Plan

- [done] Reconstruct the working/failing deployment boundary.
- [done] Capture anonymous browser failure on Preview and Production.
- [done] Correlate it with Vercel runtime `MODULE_NOT_FOUND` logs.
- [done] Revert the unproven `getToken()` sign-in-page change.
- [done] Remove global Next.js tracing excludes that caused the missing module.
- [done] Remove the manual trace include that produced a symlinked function
  package.
- [done] Cap Next.js build workers at 16.
- [done] Pin Vercel CLI 59.0.0 and remove `vercel@latest` execution.
- [done] Require exact Preview PR-head checkout and provenance.
- [done] Add a unique custom deployment ID to external Production builds.
- [done] Add generated Node-function trace validation.
- [done] Parse successful Vercel deploy JSON before writing GitHub outputs.
- [done] Add anonymous hosted AuthJS runtime smoke.
- [done] Stage Production before smoke and promote only after success.
- [done] Complete local unit, type, profile, and production-build validation.
- [done] Deploy fresh Preview and pass hosted smoke/log verification.
- [done] Build fresh prebuilt Production artifact and pass `filePathMap` plus
  dry-run validation.
- [done] Pass staged Production smoke, promote, and pass canonical-domain
  smoke.

Existing client rejection handling and visible Suspense fallback may remain as
defense in depth, but they are not incident remediation.
