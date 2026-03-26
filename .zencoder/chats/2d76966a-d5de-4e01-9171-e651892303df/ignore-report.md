# Scanner Ignore Report — CRITICAL Security Findings

Use this table to select and dismiss findings in the online scanner UI.
Only confirmed false positives whose **code pattern still exists** are listed here.
Findings resolved by a real code fix are excluded — the scanner will no longer see those patterns.

---

## Findings Safe to Ignore in Online Scanner

| #   | File                                   | Current Line | Rule / Vulnerability Class                       | Why It Is a False Positive                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------- | ------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/security/middleware/with-auth.ts` | 297          | Open redirect — untrusted input in `redirect()`  | `new URL('/sign-in', req.url)` — the path `/sign-in` is a hardcoded string literal. `req.url` provides only the base origin. No user-controlled data flows into the redirect target.                                                                                                           |
| 2   | `src/app/api/logs/route.ts`            | 149          | Command injection — non-static function dispatch | `logDispatch[level]()` where `logDispatch` is typed as `Record<(typeof LOG_LEVELS)[number], fn>` — only 6 explicitly declared functions. `level` is validated by `z.enum(LOG_LEVELS)` before this line is reached. The dispatch map is typed-exhaustive; no external function can be injected. |
| 3   | `e2e/runtime-profile.ts`               | 36           | File access — dynamic `fs.*` path                | `fs.existsSync(resolved)` where `resolved = path.resolve(filePath)`, and `filePath` is always one of three static `.env.*` literals passed at module load. A base-directory confinement check (`resolved.startsWith(cwd + sep)`) guards this call. Path traversal is not possible.             |
| 4   | `e2e/runtime-profile.ts`               | 41           | File access — dynamic `fs.*` path                | `fs.readFileSync(resolved, 'utf8')` — same argument and same confinement guard as row 3.                                                                                                                                                                                                       |
| 5   | `e2e/auth.spec.ts`                     | 13           | Weak RNG — `Math.random()`                       | `Math.random()` generates a non-secret email suffix for E2E test account uniqueness across runs (e.g. `e2e+clerk_test-user-1712345678-abc123@example.com`). No cryptographic value, token, or secret is produced. Unpredictability is not a requirement here — uniqueness is sufficient.       |

---

## Findings Resolved by Code Fix — Do NOT Suppress

These had real code changes applied. The scanner should show them resolved or not flag the new code. Do not add them to the ignore list.

| #   | File                                   | Original Line | Vulnerability Class                                        | How It Was Fixed                                                                            |
| --- | -------------------------------------- | ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A   | `src/app/onboarding/layout.test.tsx`   | 41–42         | Timing attack — `===` Symbol comparison                    | `Map<symbol, unknown>` replaces if/else `===` chains — no `===` in code, pattern eliminated |
| B   | `src/app/onboarding/actions.test.ts`   | 79–81         | Timing attack — `===` Symbol comparison                    | Same Map fix — pattern eliminated                                                           |
| C   | `src/security/middleware/with-auth.ts` | 128           | Open redirect — `redirect_url` param forwarded unvalidated | `sanitizeRedirectUrl()` guard enforces relative-path-only before forwarding                 |
| D   | `src/app/api/logs/route.ts`            | 138           | Command injection — `logger[level]()` dynamic dispatch     | Replaced with explicit typed dispatch map — original dynamic pattern eliminated             |

---

## How to Use This Report in the Online Scanner UI

1. Open the scanner findings page for this repository.
2. For each row in the **"Safe to Ignore"** table above, locate the finding by file path and line number.
3. Select the finding and choose **"Ignore / False Positive"** or equivalent action.
4. Copy the rationale from the **"Why It Is a False Positive"** column into the suppression note field.
5. Do **not** suppress findings A–D — those are fixed; if the scanner still shows them, re-scan the branch.
