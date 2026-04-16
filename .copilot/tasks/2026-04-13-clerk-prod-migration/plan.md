# Clerk Production Instance Migration

**Task ID**: `2026-04-13-clerk-prod-migration`
**Task Directory**: `.copilot/tasks/2026-04-13-clerk-prod-migration/`
**Leantime Task ID**: 44

## Objective

Migrate this boilerplate's Clerk authentication from a development instance
(`pk_test_...` / `sk_test_...`) to a production instance (`pk_live_...` /
`sk_live_...`), including all security guards, CSP, outbound filtering, and
auth flow verification matrix re-validation.

## Background

Clerk warned in browser console:

> "Clerk has been loaded with development keys. Development instances have
> strict usage limits and should not be used when deploying your application
> to production."

Code investigation found one hardcoded dev-only domain in
`src/security/outbound/secure-fetch.ts` (`clerk.accounts.dev` always in
`coreAllowed`). The CSP in `with-headers.ts` already handles this correctly
(conditional on `pk_test_` prefix). The outbound allowlist does not.

## Checklist

- [x] Step 1 — Leantime Task Open
- [x] Step 2 — Security & Auth Review
- [x] Step 3 — Implementation
- [x] Step 4 — Validation
- [x] Step 5 — Leantime Task Close

## Workflow Steps

### Step 1 — Leantime Task Open

<!-- agent: leantime-integration-agent -->

Open Leantime task for this migration.

- Check for existing milestone or task.
- Create milestone if missing.
- Create task with HTML description.
- Patch status to W toku (4).
- Record Leantime task ID in `intake.md`.

Output:
`.copilot/tasks/2026-04-13-clerk-prod-migration/10 - Leantime Integration Agent - Summary.md`

---

### Step 2 — Security & Auth Review

<!-- agent: security-auth-agent -->

Review what changes are required for Clerk dev → production instance migration.

Read before acting:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`

Confirm:

1. `src/security/outbound/secure-fetch.ts` — `clerk.accounts.dev` is hardcoded
   in `coreAllowed` for ALL environments. Assess: should it be conditional on
   dev keys (matching `with-headers.ts` pattern)?
2. `src/security/middleware/with-headers.ts` — CSP already handles dev vs prod
   correctly. Confirm no regressions.
3. Auth flow verification matrix — identify which scenarios must be re-verified
   after key rotation.
4. Any other Clerk-specific security concerns for production key rotation.

Output:
`.copilot/tasks/2026-04-13-clerk-prod-migration/02 - Security & Auth - Summary.md`

---

### Step 3 — Implementation

<!-- agent: implementation-agent -->

Depends on: Step 2 (Security & Auth Review complete)

Apply the minimal safe code changes identified by Agent 02.

Expected scope based on investigation:

- `src/security/outbound/secure-fetch.ts`: Make `clerk.accounts.dev` conditional
  (only when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` starts with `pk_test_`),
  matching the pattern in `with-headers.ts`.
- `src/security/outbound/secure-fetch.test.ts`: Update tests if they exist,
  or add coverage for dev vs prod behaviour.
- `.env.example`: Document that `pk_live_...` / `sk_live_...` are production
  key formats if not already documented.

Do NOT change Vercel env vars — those are a manual dashboard step documented in
the summary artifact.

Run after implementation:

- `pnpm typecheck`
- `pnpm lint --fix`
- `pnpm test` (unit tests only)

Output:
`.copilot/tasks/2026-04-13-clerk-prod-migration/04 - Implementation Agent - Summary.md`

---

### Step 4 — Validation

Run all repository quality gates and confirm the auth flow matrix scenarios
are documented as requiring re-verification post-key-rotation.

Commands:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

Also produce a `validation-report.md` summarising:

- quality gate results
- which AUTH_FLOW_VERIFICATION_MATRIX scenarios must be manually re-run
  against the production Clerk instance after key rotation in Vercel
- residual risks and deferred items

Output:
`.copilot/tasks/2026-04-13-clerk-prod-migration/validation-report.md`

---

### Step 5 — Leantime Task Close

<!-- agent: leantime-integration-agent -->

Close Leantime task.

- Patch status to Zrobione (0).
- Log time with `pnpm lt -- run time.log`.
- Update wiki if production key rotation steps should persist.

Output: update
`.copilot/tasks/2026-04-13-clerk-prod-migration/10 - Leantime Integration Agent - Summary.md`

---

## Artifacts

| Artifact                                       | Status     |
| ---------------------------------------------- | ---------- |
| `plan.md`                                      | ✅ Created |
| `intake.md`                                    | ⬜ Pending |
| `02 - Security & Auth - Summary.md`            | ⬜ Pending |
| `04 - Implementation Agent - Summary.md`       | ⬜ Pending |
| `validation-report.md`                         | ⬜ Pending |
| `10 - Leantime Integration Agent - Summary.md` | ⬜ Pending |

## Skipped Specialists

| Agent                  | Reason                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 01 Architecture Guard  | No new modules, no boundary changes — minor conditional guard in existing file                                           |
| 03 Next.js Runtime     | No route handler, server action, or caching changes involved                                                             |
| 05 Validation Strategy | Scope is well-defined; standard unit test coverage applies                                                               |
| 06 Debug Investigation | Root cause is known from initial code investigation                                                                      |
| 07 Playwright E2E      | Key rotation requires manual Clerk dashboard setup first; E2E is deferred until production keys are configured in Vercel |
