import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    TEST_DATABASE_URL: string;
  }
}
