## Architecture Guard Brief — Admin User Management

You are the Architecture Guard (Agent 01) for this repository.

**Task**: Review the proposed admin user management feature for architectural correctness before implementation begins.

**Task directory**: `.copilot/tasks/2026-04-24-admin-user-management/`
**Plan**: `.copilot/tasks/2026-04-24-admin-user-management/plan.md`
**Intake**: `.copilot/tasks/2026-04-24-admin-user-management/intake.md`

**Key questions to answer**:

1. Should admin user listing live in `src/features/user-management/` or `src/modules/user/`? What should the correct module boundary be?
2. Should the `UserRepository` contract be extended with `listAll()` and `deactivate()`, or should a separate admin-scoped repository/service exist?
3. The existing `src/features/user-management/api/userService.ts` hits `/api/users` (sample data). Should it be removed, replaced, or kept? Does it violate module boundaries?
4. Should deactivation require a DB schema migration (add `status` column) or can it reuse an existing field?
5. What is the correct ownership: `src/modules/user/` (infra/domain) vs `src/features/user-management/` (delivery)?
6. Does `/api/admin/users/` belong in `src/app/api/admin/` or elsewhere?

**Produce**: `.copilot/tasks/2026-04-24-admin-user-management/01 - Architecture Guard - Summary.md`
