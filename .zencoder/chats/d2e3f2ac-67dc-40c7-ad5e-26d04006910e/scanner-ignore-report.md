# Scanner Ignore Report

## Task Context

- Task ID: d2e3f2ac-67dc-40c7-ad5e-26d04006910e
- Source scanners: chatgpt-codex-connector (PR automated review), SQLint
- Commit reviewed: `82606fa630`
- Date: 2026-04-03

---

## Finding Disposition Table

| File                                                                                  | Line | Rule / Finding                                                                            | Classification     | Action                                                                                                     | Rationale                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/flags/export.ts`                                                             | 54   | Lossy DB export — `flags[row.key]` overwrites on collision                                | Real Risk          | **FIXED** — changed to `FlagEntry[]` array format; each `(key, tenantId)` pair is a distinct element       | Finding was valid: silent data loss for multi-tenant flag rows. Fixed in this session.                                                                                                                                                                                                           |
| `scripts/flags/migrate.ts`                                                            | 28   | Same lossy pattern in `readDbFlags()`                                                     | Real Risk          | **FIXED** — same array format fix applied to `readDbFlags()` and `readStaticFlags()` in `migrate.ts`       | Same root cause as export.ts finding. Fixed together.                                                                                                                                                                                                                                            |
| `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts` | 14   | GrowthBook client cache keyed only by `clientKey`, ignoring `apiHost`                     | Real Risk          | **FIXED** — cache key changed to `` `${clientKey}\|${apiHost}` ``; distinct hosts produce distinct entries | Finding was valid: wrong backend could be silently queried if same `clientKey` used with different `apiHost`.                                                                                                                                                                                    |
| `src/core/db/migrations/generated/0007_zippy_gorilla_man.sql`                         | 3    | `UNIQUE NULLS NOT DISTINCT(...)` — SQLint: "syntax error at or near NULLS" / non-ANSI SQL | **False Positive** | **IGNORE**                                                                                                 | This is valid PostgreSQL 15+ syntax, Drizzle ORM-generated from `.nullsNotDistinct()`. Repository mandates this pattern (SEC-08 in `SECURITY_CODING_PATTERNS.md`). The codebase targets Postgres exclusively. SQLint's ANSI SQL rule does not apply here. Do not edit generated migration files. |

---

## Scanner Ignore Configuration Notes

### SQLint — `UNIQUE NULLS NOT DISTINCT`

This finding will recur on every Drizzle-generated migration that uses `.nullsNotDistinct()`. Recommended action:

- Add a SQLint rule suppression comment or per-file ignore if the tool supports it, OR
- Configure SQLint to allow PostgreSQL dialect extensions, OR
- Accept the warning in CI output with a documented rationale referencing SEC-08

The pattern is expected and correct. It should not block CI or require manual review on each occurrence.

### chatgpt-codex-connector

The two `scripts/flags/` findings were valid bugs now fixed. The GrowthBook finding was valid and fixed. No further scanner ignores needed for these paths — future scanner runs on the fixed code will not reproduce these findings.

---

## ESLint Warning Notes (Not From This Incident's Scanners)

Two pre-existing ESLint `security/detect-non-literal-fs-filename` warnings remain in `export.ts` and `import.ts`. These are SEC-05 false positives — both `fs` calls are guarded by `assertPathWithinBase()`. These are not new and are not related to this incident. They are documented in `SECURITY_CODING_PATTERNS.md` under SEC-05.
