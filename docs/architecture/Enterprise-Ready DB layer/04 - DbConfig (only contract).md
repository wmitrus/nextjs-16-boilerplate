```ts
// src/core/db/types.ts

export type DbProvider = 'drizzle' | 'prisma';
export type DbDriver = 'pglite' | 'postgres';

export interface DbRuntime {
  db: DrizzleDb;
  close?: () => Promise<void>;
}

export interface DbConfig {
  provider: DbProvider;
  driver: DbDriver;
  url?: string;
}
```
