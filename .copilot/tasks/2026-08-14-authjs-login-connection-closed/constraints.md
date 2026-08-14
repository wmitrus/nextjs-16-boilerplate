# Final Constraints

The authoritative diagnosis is
`final-root-cause-and-deployment-standard.md`.

- Keep `getServerSession(authOptions)` after `await connection()`.
- Do not treat `getToken()`, the visible fallback, or client error handling as
  the root-cause fix.
- Include only the exact missing Next.js `file-logger.js` through
  `outputFileTracingIncludes` for `/*`.
- Do not manually mutate generated Vercel output.
- Keep source-built Preview and prebuilt Production as separate provider
  contracts.
- Pin the Vercel CLI and verify exact git provenance.
- Stage Production with `--skip-domain`, smoke the immutable URL, then promote.
- Keep Next.js build worker use at 16 or fewer.
- Do not run ESLint while the documented repository blocker remains active.
- Do not mark the hosted incident resolved before fresh artifact, browser, and
  runtime-log proof passes.
