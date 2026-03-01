src/
core/
db/
create-db.ts
types.ts
drivers/
create-pglite.ts
create-postgres.ts
migrations/
config/
drizzle.dev.ts
drizzle.prod.ts
generated/ ← generated migrations
test/
create-test-db.ts
modules/
auth/
infrastructure/
drizzle/
schema.ts
authorization/
infrastructure/
drizzle/
schema.ts
user/
infrastructure/
drizzle/
schema.ts
billing/ ← przyszły
infrastructure/
drizzle/
schema.ts

Every module is the owner of its table.
