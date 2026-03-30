# arch:lint Remediation Report

**Agent**: Architecture Guard Agent  
**Status**: IMPLEMENTED  
**Date**: 2026-03-13  
**Input**: arch-lint-analysis.md

---

## 1. Objective

Fix the three pre-existing arch:lint failures without altering correct architectural structure.

---

## 2. Changes Made

### Change 1 — `scripts/architecture-lint.sh`: extend composition root exclusions

Added two file-level exclusion globs to the first `fail_matches` check, with a comment explaining the rationale:

```bash
# src/core/runtime/bootstrap.ts and src/core/runtime/edge.ts are the
# Node and Edge composition root entry points (see docs/architecture/02).
# They intentionally import from modules to wire concrete implementations.
# src/core/container/** is the DI Container class — same exception.
fail_matches \
  "core must not import app/features/security/modules outside composition root" \
  "from '@/(app|features|security|modules)/" \
  src/core \
  --glob '!src/core/container/**' \
  --glob '!src/core/runtime/bootstrap.ts' \
  --glob '!src/core/runtime/edge.ts' \
  --glob '!**/*.test.*'
```

No code was moved or restructured. The composition root files are correctly placed — only the lint rule's exclusion set was too narrow.

### Change 2 — `scripts/db-seed.ts`: inline seedAll orchestration

Removed `import { seedAll } from '@/core/db/seed'`. Added direct imports from the three module seed files and a local `seedAll` function with identical logic:

```typescript
import { seedAuthorization } from '@/modules/authorization/infrastructure/drizzle/seed';
import { seedBilling } from '@/modules/billing/infrastructure/drizzle/seed';
import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';

async function seedAll(db: DrizzleDb) {
  const users = await seedUsers(db);
  const authorization = await seedAuthorization(db, { users });
  const billing = await seedBilling(db, { tenants: authorization.tenants });
  return { users, authorization, billing };
}
```

All other script logic, output, and error handling is unchanged.

### Change 3 — `src/core/db/seed.ts`: deleted

File had no consumers inside `src/`. Its sole consumer was `scripts/db-seed.ts`. After inlining the orchestration into the script, the file was deleted. `src/core/db/` now contains only genuine DB infrastructure (`create-db.ts`, `types.ts`, `migrate-cli.ts`, `migrations/`, `schema/`, `drivers/`) — no cross-module orchestrators.

---

## 3. Validation

| Check            | Result                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm arch:lint` | ✅ PASS — all layer checks PASS, no false positives, only pre-existing WARN for container usage in app/ |
| `pnpm typecheck` | ✅ PASS — zero errors                                                                                   |
| `pnpm test`      | ✅ PASS — 115 files, 707 tests                                                                          |

---

## 4. Residual Items

The `WARN: global container usage in request-sensitive flows requires review` warning was already present before this fix and is not part of this scope. It is a pre-existing advisory (warn_matches, not fail_matches) flagging `container.resolve()` calls in `src/app/`. This is an accepted pattern in the current architecture and tracked separately.
