## DEV

```ts
// core/db/migrations/config/drizzle.dev.ts
export default {
  schema: './src/modules/**/infrastructure/drizzle/schema.ts',
  out: './src/core/db/migrations/generated',
  dialect: 'postgresql',
};
```

## Prd

```ts
// core/db/migrations/config/drizzle.prod.ts
export default {
  schema: './src/modules/**/infrastructure/drizzle/schema.ts',
  out: './src/core/db/migrations/generated',
  dialect: 'postgresql',
};
```

The schema is always the same.
Only DATABASE_URL changes.
