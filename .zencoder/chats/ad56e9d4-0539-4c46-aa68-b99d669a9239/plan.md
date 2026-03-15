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

### [ ] Step: Design Decision

User confirms before implementation proceeds.

---

### [ ] Step: Implementation (if requested)

Priority 1 - UNBLOCKS EVERYTHING:

- src/app/api/logs/route.ts (CREATE)
  - POST only
  - Zod validate ClientLogPayload shape
  - Enforce size limit (≤ 8KB body)
  - Dedicated rate limit (separate from API_RATE_LIMIT_REQUESTS)
  - Validate x-log-ingest-secret for source='edge', skip for source='browser'
  - Sanitize context before forwarding (strip secrets, depth-limit, truncate strings)
  - Override type/category/module with server-controlled values
  - Forward to resolveServerLogger()
  - Return 204

Priority 2 - SECURITY OBSERVABILITY:

- src/app/api/csp-report/route.ts (CREATE)
  - POST only, accept application/csp-report
  - Strip original-policy, referrer, sanitize document-uri
  - Own rate limit
  - Log at warn level with category:'security'
- src/security/middleware/with-headers.ts (ADD report-uri /api/csp-report)
- src/shared/components/error/global-error-handlers.tsx (ADD securitypolicyviolation listener)

Priority 3 - CLEANUP:

- Rename NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED → NEXT_PUBLIC_BROWSER_LOG_INGEST_ENABLED
- src/core/env.ts + .env.example + LOG_INGEST_SECRET documented as required for edge

---

### [ ] Step: Validation

Run repository validation commands:

- pnpm typecheck
- pnpm lint
- pnpm test
