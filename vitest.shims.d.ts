/// <reference types="@vitest/browser-playwright" />

import 'vitest';

declare module 'vitest' {
  interface ProvidedContext {
    TEST_DATABASE_URL?: string;
    TEST_DATABASE_SYSTEM_IDENTIFIER?: string;
  }
}
