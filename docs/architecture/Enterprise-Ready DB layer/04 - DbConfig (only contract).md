```ts
// core/db/types.ts

export type DbDriver = 'pglite' | 'postgres';

export interface DbConfig {
  driver: DbDriver;
  url?: string;
}
```
