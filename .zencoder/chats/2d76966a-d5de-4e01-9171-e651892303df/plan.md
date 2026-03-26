# Task Brief — Critical Security Findings Triage & Fix

## Objective

Triage and resolve 11 CRITICAL findings raised by the security scanner across 5 source files.
Each finding is assessed individually against its actual runtime context to distinguish real
vulnerabilities from false positives. True risks are fixed with production-grade mitigations;
false positives receive documented inline suppression with a clear rationale.

## Problem Statement

The security scanner flagged 11 CRITICAL issues in 4 vulnerability classes:

- Timing-attack-susceptible string comparisons (5 issues — test files only)
- Open redirect via untrusted input in `redirect()` (2 issues — `with-auth.ts`)
- Dynamic property dispatch on a logger object (1 issue — `api/logs/route.ts`)
- Dynamic file path construction (2 issues — `e2e/runtime-profile.ts`)
- Cryptographically weak RNG (1 issue — `e2e/auth.spec.ts`)

Several findings target test infrastructure or code paths whose inputs are already validated;
others surface legitimate hardening opportunities in production code.

## Scope

- `src/app/onboarding/layout.test.tsx` (lines 41–42)
- `src/app/onboarding/actions.test.ts` (lines 79–81)
- `src/security/middleware/with-auth.ts` (lines 128, 292)
- `src/app/api/logs/route.ts` (line 138)
- `e2e/runtime-profile.ts` (lines 25, 29)
- `e2e/auth.spec.ts` (line 12)

## Non-Goals

- Do not change authentication/authorization logic beyond the specific findings.
- Do not refactor unrelated test utilities or production modules.
- Do not introduce new dependencies.
- Do not alter CI/CD pipelines.

## Issue Groups

### Group 1 — Timing Attack: Symbol Comparisons in Test DI Mocks

**Files**: `actions.test.ts` (lines 79–81), `layout.test.tsx` (lines 41–42)  
**Finding**: `===` comparisons flagged as timing-attack-susceptible.  
**Context**: Comparisons are against `Symbol` DI tokens (e.g. `AUTH.IDENTITY_SOURCE`),
not secret strings. Symbols are reference-compared at VM level; timing attack is
architecturally impossible. These are test-only files with no production exposure.  
**Classification**: False positive.  
**Resolution**: Add inline suppression comment with rationale on each flagged line.

### Group 2 — Open Redirect: `redirect()` in `with-auth.ts`

**Files**: `with-auth.ts` (lines 128, 292)  
**Finding**: Untrusted user input passed to `redirect()`.

**Line 292** — `NextResponse.redirect(new URL('/sign-in', req.url))`  
Path is hardcoded `/sign-in`; `req.url` supplies only the origin. No user input flows
into the redirect target. **Classification: False positive.**  
**Resolution**: Inline suppression with rationale.

**Line 128** — `NextResponse.redirect(bootstrapUrl)` where `bootstrapUrl` is
`new URL('/auth/bootstrap/start', req.url)` and `existingRedirectUrl` is set as a
`?redirect_url=` query parameter from `req.nextUrl.searchParams.get('redirect_url')`.  
The redirect destination is always `/auth/bootstrap/start` on the same origin (safe).
However, `redirect_url` carries unvalidated user input forward as a query param.
If any downstream handler redirects using that param without validating it is a
same-origin relative path, an open redirect would exist.  
**Classification: Latent risk — validate `redirect_url` to be a relative path before forwarding.**  
**Resolution**: Add a same-origin/relative-path guard helper and apply it before forwarding
`redirect_url`. Suppress the scanner finding with rationale after the guard is in place.

### Group 3 — Command Injection: Dynamic Logger Dispatch in API Route

**File**: `src/app/api/logs/route.ts` (line 138)  
**Finding**: `logger[level](...)` — non-static property access to call a function.  
**Context**: `level` is validated by `z.enum(['fatal','error','warn','info','debug','trace'])`
before reaching this line. Zod schema enforces the enum exhaustively.  
**Classification**: False positive, but can be replaced with an explicit lookup map to make
the intent compiler-provable and eliminate the scanner signal entirely.  
**Resolution**: Replace `logger[level](...)` with an explicit dispatch map keyed on
`LOG_LEVELS`. Add inline comment explaining the existing Zod guard if a map is rejected.

### Group 4 — E2E False Positives (File Path + Weak RNG)

**Files**: `e2e/runtime-profile.ts` (lines 25, 29), `e2e/auth.spec.ts` (line 12)

**runtime-profile.ts lines 25 & 29**: `filePath` is assembled from `path.resolve(process.cwd(), '.env.e2e.local')` — a static literal string, not user input. Scanner triggered on any dynamic `fs.*` call regardless of origin.  
**Classification**: False positive.  
**Resolution**: Inline suppression with rationale.

**auth.spec.ts line 12**: `Math.random()` used to generate a unique email suffix for test
account creation. No cryptographic purpose; uniqueness sufficiency for test isolation is
the only goal.  
**Classification**: False positive.  
**Resolution**: Inline suppression with rationale.

## Acceptance Criteria

- [ ] All 11 findings are addressed: either fixed or suppressed with documented rationale.
- [ ] No existing tests are broken (`pnpm test`).
- [ ] TypeScript strict mode passes (`pnpm typecheck`).
- [ ] ESLint passes (`pnpm lint`).
- [ ] The `redirect_url` forward path in `with-auth.ts` has a same-origin/relative-path guard.
- [ ] The logger dispatch in `route.ts` is provably safe (explicit map or equivalent).
- [ ] All suppressions include a comment explaining why the finding is a false positive.

## Execution Control

`manual-handoff` — pause after each group and present results before proceeding to the next.

## Affected Files

| File                                   | Group |
| -------------------------------------- | ----- |
| `src/app/onboarding/actions.test.ts`   | 1     |
| `src/app/onboarding/layout.test.tsx`   | 1     |
| `src/security/middleware/with-auth.ts` | 2     |
| `src/app/api/logs/route.ts`            | 3     |
| `e2e/runtime-profile.ts`               | 4     |
| `e2e/auth.spec.ts`                     | 4     |

## Security Patterns Document

After every group, the master agent MUST create or update:

`docs/ai/general/SECURITY_CODING_PATTERNS.md`

This document accumulates every pattern encountered during the review — what to avoid,
why it is dangerous or a false positive, and how to write it correctly. It is the living
reference that will be injected into agent prompts and repository rules.

## Steps

- [x] Step 1 — Group 1: Suppress timing-attack false positives in test DI mocks (`actions.test.ts`, `layout.test.tsx`)
- [x] Step 1.1 — Patterns doc: Create `docs/ai/general/SECURITY_CODING_PATTERNS.md` with Group 1 findings
- [x] Step 2 — Group 2: Fix / suppress open redirect findings in `with-auth.ts` (including `redirect_url` guard)
- [x] Step 2.1 — Patterns doc: Update `docs/ai/general/SECURITY_CODING_PATTERNS.md` with Group 2 findings
- [x] Step 3 — Group 3: Replace dynamic logger dispatch in `route.ts` with explicit map
- [x] Step 3.1 — Patterns doc: Update `docs/ai/general/SECURITY_CODING_PATTERNS.md` with Group 3 findings
- [x] Step 4 — Group 4: Suppress E2E false positives in `runtime-profile.ts` and `auth.spec.ts`
- [x] Step 4.1 — Patterns doc: Update `docs/ai/general/SECURITY_CODING_PATTERNS.md` with Group 4 findings
- [x] Step 5 — Quality gates: run `pnpm typecheck` and `pnpm lint` to confirm clean state
- [x] Step 6 — Ignore report: produce a structured table of every finding that is safe to suppress/ignore in the online scanner UI, with file path, line, rule name, and rationale — so the user can select and dismiss them on the scanner page without re-reviewing
- [x] Step 7 — Propagate security coding patterns to all agent files in `.github/agents/`, `docs/ai/general/`, `.zencoder/rules/repo.md`, and assess `.github/workflows/` impact
- [x] Step 8 — Populate `docs/ai/general/REPOSITORY_AI_CONTEXT.md` and update `.zencoder/rules/repo.md` with the full agent location map so every agent always knows where to propagate updates
- [x] Step 9 — Populate all empty `docs/ai/general/0[1-9] - *.md` Zencoder agent prompt files with full content derived from `.github/agents/` (without Copilot YAML frontmatter) and with SECURITY_CODING_PATTERNS.md startup rules
- [x] Step 10 — Create `.zenflow/workflows/security-incident-workflow.md` with a mandatory final step requiring `SECURITY_CODING_PATTERNS.md` update after every security fix
- [x] Step 11 — Create `.zenflow/workflows/feature-development.md` and `.zenflow/workflows/safe-refactor.md`
- [x] Step 12 — Add explicit "Security Patterns Doc Update Obligation" section to `docs/ai/general/02 - Security & Auth Agent.md` defining process ownership for patterns doc maintenance after security reviews
- [x] Step 13 — Migrate `.zencoder/rules/repo.md` to `AGENTS.md` (Zen Rules deprecated April 20 2026): write canonical `AGENTS.md`, stub out the old rules file, update all agent prompts (`docs/ai/general/`, `.github/agents/`), all zenflow workflows, and `REPOSITORY_AI_CONTEXT.md` to reference `AGENTS.md` — never create new rules in `.zencoder/rules/` going forward
