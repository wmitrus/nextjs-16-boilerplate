# Most important rules (must not be broken)

❌ No global mutable DB singleton in feature/module code
❌ No ad-hoc `getDb()` service locator
❌ Modules must not bypass contracts with random DB access paths
❌ Env parsing belongs to `src/core/env.ts`, not module internals
❌ Do not collapse all module schemas into one shared ownership file
❌ Never run automatic migrations in production runtime
