## DEV

```ts
// core/db/migrations/config/drizzle.dev.ts
export default {
  schema: './src/modules/**/infrastructure/drizzle/schema.ts',
  out: './src/core/db/migrations/generated',
  dialect: 'postgresql',
};
```

## PROD

```ts
// core/db/migrations/config/drizzle.prod.ts
export default {
  schema: './src/modules/**/infrastructure/drizzle/schema.ts',
  out: './src/core/db/migrations/generated',
  dialect: 'postgresql',
};
```

Schema glob remains the same across environments.
Only runtime database target changes.
