# Fix bug

## Workflow Steps

### [x] Step: Investigation and Planning

Analyze the bug report and design a solution.

1. Review the bug description, error messages, and logs
2. Check existing tests for clues about expected behavior
3. Locate relevant code sections and identify root cause
4. Propose a fix based on the investigation
5. Consider edge cases and potential side effects

**Investigation complete. Two agent findings on record:**

- `investigation.md` — Security/Auth Agent + Next.js Runtime Agent combined findings
- `runtime-agent-findings.md` — Next.js Runtime Agent dedicated findings (runtime lifecycle, proxy architecture, dev/prod divergence table, exact change spec)

**Agreed root cause:**

- `connect-src` in `src/security/middleware/with-headers.ts` includes `https://*.clerk.accounts.dev` but NOT `wss://*.clerk.accounts.dev`
- Browser CSP blocks Clerk v6 dev client's WebSocket connections in `pnpm dev`; `pnpm start` is unaffected because Clerk's browser JS skips `wss://` in `NODE_ENV=production`
- Fix is **code**, not env file — `NEXT_PUBLIC_CSP_CONNECT_EXTRA` is for deployment-specific third-party services, not systematic Clerk dev-key behavior

### [x] Step: Implementation

**Implemented.**

Changes made:

1. **`src/security/middleware/with-headers.ts`** — added `clerkDomains.push('wss://*.clerk.accounts.dev')` in the `isPreview || isDev || isClerkDevKey` block
2. **`src/security/middleware/with-headers.test.ts`** — added `wss://*.clerk.accounts.dev` assertions to both the development-specific and preview-specific CSP tests

Validation results:

- `pnpm typecheck` — ✅ passed
- `pnpm lint` — ✅ passed
- `pnpm arch:lint` — ✅ passed (architecture lint passed, 1 pre-existing warning)
- `pnpm test` — ✅ 115 test files, 710 tests, all passed
- `with-headers.ts` coverage — 100% lines/branches/functions/statements

### [x] Step: Fix Cloudflare Turnstile CSP gap

**New blocker discovered after runtime testing.**

Root cause: Clerk uses Cloudflare Turnstile (CAPTCHA) during OAuth flows. The Turnstile script at `https://challenges.cloudflare.com/turnstile/v0/api.js` is blocked by `script-src-elem`. This is unconditional — applies to all environments, not just dev.

Required additions to `src/security/middleware/with-headers.ts`:

- `https://challenges.cloudflare.com` → `scriptSrc`
- `https://challenges.cloudflare.com` → `frameSrc` (Turnstile renders in iframe)
- `https://challenges.cloudflare.com` → `connectSrc` (Turnstile API calls)

Tests to update in `src/security/middleware/with-headers.test.ts`:

- Assert `https://challenges.cloudflare.com` present in production CSP (base test)
