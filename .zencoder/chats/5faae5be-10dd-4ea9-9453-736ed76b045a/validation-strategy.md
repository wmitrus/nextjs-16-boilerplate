# Validation Strategy

**Workflow**: Incident Investigation
**Date**: 2026-04-24
**Agent**: Validation Strategy (05)
**Status**: Completed

---

## Change Risk Classification

**Risk Level**: Low

The change is a pure dead-code removal:

- `const handler = NextAuth(authOptions)` — line never reached by any consumer
- `export { handler }` — never imported anywhere
- `import NextAuth from 'next-auth/next'` — now unused, removed

No behavioral logic was changed. No new code was introduced. No consumer was affected.

---

## Minimum Required Validation

| Check                  | Command           | Rationale                                                                   |
| ---------------------- | ----------------- | --------------------------------------------------------------------------- |
| TypeScript compilation | `pnpm typecheck`  | Ensure removing the import/export doesn't leave a broken reference anywhere |
| Lint                   | `pnpm lint --fix` | Ensure no import-order violations or lint errors from the change            |
| Unit tests             | `pnpm test`       | Run existing unit tests to confirm no regressions from the module change    |

---

## Optional Additional Validation

| Check                  | Rationale                                                | Priority                                                    |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| Architecture lint      | `pnpm arch:lint`                                         | Confirm no circular dependency introduced by import removal | Medium                          |
| Manual dev server test | `rm -rf .next && pnpm dev` then `curl /api/auth/session` | Confirm 200 JSON response                                   | High (was the original symptom) |

---

## Validation Not Required

| Skip                         | Reason                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| New unit tests for `auth.ts` | The removed code was dead — there is nothing new to test. Existing tests cover `authOptions`. |
| Integration tests            | No behavioral change — same session flow, same route handler, same authOptions object         |
| E2E tests                    | The change is too low-level for E2E validation; the route handler and auth flow are unchanged |
| New Playwright spec          | No new route, page, or user flow introduced                                                   |

---

## Validation Commands

```bash
pnpm typecheck
pnpm lint --fix
pnpm test
pnpm arch:lint
```

**Manual verification** (recommended but not blocking CI):

```bash
rm -rf .next
pnpm dev
# In separate terminal:
curl http://localhost:3000/api/auth/session
# Expected: HTTP 200 with JSON { expires: "..." } or {}
```

---

## Notes

- `pnpm lint` must be run as `pnpm lint --fix` per AGENTS.md — the linter auto-fixes import order and formatting
- The Turbopack cache fix (RC1) is a developer workflow concern, not a code validation concern — it cannot be validated by `pnpm test` or `pnpm typecheck`
