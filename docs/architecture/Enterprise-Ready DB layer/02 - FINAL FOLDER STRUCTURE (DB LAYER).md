# Final folder structure (current)

```text
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
				generated/
			seed.ts
	modules/
		auth/infrastructure/drizzle/schema.ts
		authorization/infrastructure/drizzle/schema.ts
		user/infrastructure/drizzle/schema.ts
		billing/infrastructure/drizzle/schema.ts
scripts/
	db-seed.ts
```

Every module owns its tables and exports its own schema.
