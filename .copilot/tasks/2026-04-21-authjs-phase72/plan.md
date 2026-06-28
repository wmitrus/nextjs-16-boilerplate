# Phase 7.2 — AuthJS Security Validation + Email Verification + Brute Force Protection

**Task workspace**: `.copilot/tasks/2026-04-21-authjs-phase72/`
**Prior phase artifacts**: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/`
**Leantime task ID**: #69 (milestone 52 — Phase 7: AuthJS Adapter)
**Status**: ✅ COMPLETE — Implementation, validation, E2E coverage, and Leantime closure delivered
**Date opened**: 2026-04-21

---

## Objective

Complete the AuthJS credential auth implementation by:

1. Security + architecture validation of three remaining gaps
2. Designing and implementing the email verification flow (strict policy — block sign-in until verified)
3. Implementing brute-force protection on sign-in
4. Making the session-invalidation-after-password-reset decision (implement or document as debt)
5. Writing Playwright E2E specs for all auth pages (required by Pattern F in AGENTS.md)

---

## Input Sources

- HANDOFF doc: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/HANDOFF-NEXT-CHAT.md`
- Phase 2 security summary: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/02 - Security & Auth - Summary.md`
- Phase 2 architecture summary: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/01 - Architecture Guard - Summary.md`
- Phase 2 runtime summary: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/03 - Next.js Runtime - Summary.md`
- User policy input (pasted): strict email verification model — verified in `/tmp/zencoder/pasted/files/20260421130005-e6n53k.txt`

---

## Task Classification

**Type**: Security hardening + Feature implementation (multi-gap)
**Risk level**: HIGH — auth surface changes, new DB migrations, brute-force protection
**Specialist sequence required**: Yes — Security & Auth → Architecture Guard → Runtime → Implementation → Validation → E2E

---

## Baseline State (Entering This Phase)

- ✅ Sign-up / sign-in / sign-out / forgot-password / reset-password — all working
- ✅ 1059 unit tests passing
- ✅ TypeScript strict — clean
- ✅ Lint — clean
- ✅ Coverage above all 75% thresholds

---

## Three Remaining Gaps (Ranked by Risk)

### 🔴 Gap 1 — No email verification flow

`email_verified` column always `false`; `authorize()` does not block unverified users;
no verification email, no verification token table, no verification page.
**User policy input**: strict block — unverified email must not receive a full session.

### 🔴 Gap 2 — No brute-force protection on sign-in

`authorize()` in NextAuth v4 has no rate limiting; failed attempts not tracked.

### 🟡 Gap 3 — No session invalidation after password reset

JWT sessions are browser-cookie-based; password reset does not invalidate active sessions.
Fixing this properly requires DB-backed session table or `sessionVersion` tracking.

---

## Design Input: Strict Email Verification Policy (User-Proposed)

From pasted file (user's proposed production policy):

- **Unverified email blocks full sign-in** — user gets only a verification-pending restricted state
- **Three effective states**: `PENDING_VERIFICATION`, `VERIFIED`, `SUSPENDED`
- **`VERIFIED` → normal JWT/session**
- **`PENDING_VERIFICATION` → no normal app session** (restricted: resend, change email, sign out only)
- **Never silently set `email_verified=true`** just because email infra is missing
- **Production**: if email infra not ready → either disable self-service signup OR keep unverified blocked
- **Dev/test**: allow dev-only bypass (`AUTH_DEV_AUTO_VERIFY=false`) with explicit env flag + logging

This policy must be validated by the Security & Auth agent before implementation.

---

## Planned Specialist Sequence

| Step | Agent                  | Scope                                                                                                                 | Status              |
| ---- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1    | \*\*Security           | 1                                                                                                                     | **Security & Auth** | Audit all 3 gaps; validate strict email verification policy; define brute-force requirements; decide session invalidation scope | 🔲 TODO | Auth\*\* | Audit all 3 gaps; validate strict email verification policy; define brute-force requirements; decide session invalidation scope | ✅ COMPLETE |
| 2    | **Architecture Guard** | Design email verification flow (table, API, pages, states); brute-force layering; session strategy; module boundaries | ✅ COMPLETE         |
| 3    | **Next.js Runtime**    | Review new route handlers + pages for runtime constraints; await connection() placement; caching pitfalls             | ✅ COMPLETE         |
| 4    | **Orchestrator**       | Consolidate constraints.md + implementation-plan.md                                                                   | ✅ COMPLETE         |
| ✅   | **GATE**               | Implementation plan fully approved after 4 correction rounds                                                          | ✅ APPROVED         |
| 5    | **Implementation**     | Execute implementation plan                                                                                           | ✅ COMPLETE         |
| 6    | **Validation**         | `pnpm typecheck && pnpm lint --fix && pnpm test`                                                                      | ✅ COMPLETE         |
| 7    | **Playwright E2E**     | Write specs for all 5 auth pages (signin, signup, forgot-password, reset-password, verify-email)                      | ✅ COMPLETE         |
| 8    | **Leantime**           | Close task                                                                                                            | ✅ COMPLETE         |

---

## Artifacts To Be Produced

- [x] `plan.md` (this file)
- [x] `intake.md`
- [x] `02 - Security & Auth - Summary.md`
- [x] `01 - Architecture Guard - Summary.md`
- [x] `03 - Next.js Runtime - Summary.md`
- [x] `constraints.md`
- [x] `implementation-plan.md`
- [x] `04 - Implementation Agent - Summary.md`
- [x] `validation-report.md`
- [x] `07 - Playwright E2E - Summary.md`

Skipped agents (with reason):

- `05 - Validation Strategy`: Gap-specific validation scope is clear — E2E specs mandated by Pattern F, unit tests cover all new routes. No non-obvious scope decision needed.
- `06 - Debug Investigation`: Not applicable — no unclear bugs; gaps are well-defined.

---

## Known Constraints Carried From Phase 2

1. `cacheComponents: true` → `export const dynamic` and `export const runtime` are banned in route segments
2. Use `await connection()` before any request-time data access in RSC/route handlers
3. Rate-limit calls must include `meta: { path }` (SEC-17)
4. Never log raw error objects — use `errorMessage` / `errorName` (SEC-10)
5. `crypto.randomBytes(32)` for token generation — not `Math.random()` (SEC-06)
6. New migration `when` value must be > `1776695066080` (last applied migration 0010 = `1776770000000`)
7. Token-based flows: store SHA-256 hash only, never raw token

---

## Progress Checklist

- [x] Task workspace created
- [x] plan.md created
- [x] intake.md created
- [x] Leantime task opened (#69)
- [x] Security & Auth specialist complete
- [x] Architecture Guard specialist complete
- [x] Next.js Runtime specialist complete
- [x] constraints.md finalized
- [x] implementation-plan.md created and approved
- [x] Implementation complete
- [x] Validation passing (typecheck + lint + tests)
- [x] Playwright E2E specs complete
- [x] Leantime task closed (#69 = Zrobione)
