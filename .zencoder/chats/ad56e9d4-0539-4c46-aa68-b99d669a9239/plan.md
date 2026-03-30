# Browser Logging Architecture Review

## Configuration

- **Task**: Architectural review of browser logging, CSP violation collection, and Logflare forwarding
- **Artifacts Path**: /home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/ad56e9d4-0539-4c46-aa68-b99d669a9239

---

## Workflow Steps

### [x] Step: Repository Inspection & Architectural Assessment (Architecture Guard Agent)

Key Finding: /api/logs route is referenced but DOES NOT EXIST.

---

### [x] Step: Runtime Deep Inspection (Next.js Runtime Agent)

Key Findings:

1. CONFIRMED: /api/logs does not exist → all browser+edge log POSTs → 404 silently dropped
2. CONFIRMED: GlobalErrorHandlers captures error+unhandledrejection but NOT securitypolicyviolation
3. CONFIRMED: Server logger Logflare stream works → explains type="API" logs in Logflare
4. CONFIRMED: No CSP report-uri → CSP violations completely invisible
5. CONFIRMED: LOG_INGEST_SECRET not set in .env.local
6. CONFIRMED: NEXT_PUBLIC_APP_URL=http://localhost:3000 set → edge transport has baseUrl but endpoint still 404

---

### [x] Step: Security Review (Security/Auth Agent)

Key Security Constraints determined:

CREDENTIAL SAFETY:

- Direct browser → Logflare MUST NOT be implemented (would require NEXT*PUBLIC* LOGFLARE_API_KEY)
- browser → /api/logs → server → Logflare is the only correct pattern
- LOGFLARE_API_KEY stays server-only: CONFIRMED safe in current env.ts

INGEST ENDPOINT SECURITY:

- /api/logs MUST be unauthenticated for browser source (browsers cannot carry secrets)
- /api/logs MUST validate x-log-ingest-secret for edge source
- Rate limiting is the primary abuse control for browser path
- MUST use dedicated rate limit budget, NOT shared API rate limit (DoS risk)
- Request body MUST be size-limited (≤ 8KB recommended)
- Request body MUST be Zod-validated (type, shape, enum levels)
- source field MUST be an enum - cannot be set by caller to arbitrary string

SANITIZATION REQUIRED ON INGEST:

- context field is Record<string, unknown> - MUST be sanitized server-side before forwarding to Logflare
- Sanitize: drop keys named 'password', 'secret', 'token', 'authorization', 'cookie', 'key'
- Depth-limit nested context (max 3 levels)
- String values MUST be truncated (≤ 2KB per string value)
- Total context object MUST be size-limited

CSP VIOLATION REPORTS:

- MUST go to a SEPARATE /api/csp-report endpoint (different Content-Type: application/csp-report)
- original-policy field MUST be stripped before logging (exposes full CSP to Logflare)
- document-uri MUST be sanitized: strip query params (may contain tokens)
- referrer MUST be stripped or truncated
- No auth required (browsers post automatically)
- MUST have its own strict rate limit

LOG INJECTION RISK:

- context field MUST NOT allow fake type:'SECURITY_EVENT' or type:'SECURITY_AUDIT' fields
- Reserved top-level fields (type, category, module, source) MUST be server-controlled only

Output: Provided as response to user.

---

### [x] Step: Design Decision

User confirmed implementation proceeds.

---

### [x] Step: Implementation (Priority 1 + partial Priority 2)

Priority 1 - UNBLOCKS EVERYTHING - COMPLETE:

- src/app/api/logs/route.ts (CREATED)
  - POST only
  - Zod validate ClientLogPayload shape
  - Enforce size limit (≤ 8KB body, Content-Length header + actual body check)
  - Dedicated rate limit (prefix: ratelimit:log-ingest, 60 req/60s, separate from API budget)
  - Validate x-log-ingest-secret for source='edge'; fall back to 'browser' if missing/wrong
  - sanitizeContext(): strips secret keys, reserved top-level fields, depth-limits to 3, truncates to 2KB, limits arrays to 10 primitives
  - Server-controlled type/category/module/source fields
  - Forward to resolveServerLogger().child(...)
  - Return 204
- src/app/api/logs/route.test.ts (CREATED) — 13 unit tests, all passing

Priority 2 - SECURITY OBSERVABILITY - PARTIAL:

- src/shared/components/error/global-error-handlers.tsx (UPDATED)
  - Added securitypolicyviolation listener
  - Strips query params from documentURI and blockedURI
  - Omits originalPolicy and referrer
  - Logs at warn level
- src/shared/components/error/global-error-handlers.test.tsx (UPDATED)
  - Added 6 CSP violation tests, all passing

NOT YET DONE (Priority 2 remainder):

- src/app/api/csp-report/route.ts — browser-native report-uri endpoint not created
- src/security/middleware/with-headers.ts — report-uri directive not added to CSP

Priority 3 - CLEANUP - NOT DONE:

- NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED rename not done
- LOG_INGEST_SECRET not yet documented in .env.example

Support fixes:

- src/testing/infrastructure/logger.ts — resetLoggerMocks() now restores child.mockImplementation after reset

---

### [x] Step: Validation

- pnpm typecheck: PASS
- pnpm lint: PASS (after --fix for prettier formatting)
- pnpm test: PASS — 733 tests, 116 test files

---

### [x] Step: Logflare Stream Fix

Root cause identified by Next.js Runtime Agent:

- pino-logflare throws plain string (not Error) when both sourceToken AND sourceName are passed
- .env.local had both LOGFLARE_SOURCE_TOKEN and LOGFLARE_SOURCE_NAME set
- catch block used `instanceof Error` check → showed "Unknown error" instead of actual message
- serverExternalPackages fix (pino, pino-logflare, pino-pretty) was also correct and necessary

Changes made:

- src/core/logger/utils.ts: prefer sourceToken, fall back to sourceName (never pass both)
- src/core/logger/utils.ts: catch block now uses String(err) instead of 'Unknown error'
- src/core/logger/utils.test.ts: 3 new tests covering source preference and string error display

Validation: typecheck PASS, lint PASS, 736 tests PASS (116 files)

---

### [ ] Step: Remaining Work (Priority 2 remainder + Priority 3)

- [ ] Create src/app/api/csp-report/route.ts
- [ ] Add report-uri /api/csp-report to CSP header in src/security/middleware/with-headers.ts
- [ ] (Optional) Rename NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED → NEXT_PUBLIC_BROWSER_LOG_INGEST_ENABLED
- [ ] (Optional) Document LOG_INGEST_SECRET in .env.example
