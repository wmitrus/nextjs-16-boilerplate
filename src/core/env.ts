import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  /**
   * Server-side environment variables schema.
   */
  server: {
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    CHROMATIC_PROJECT_TOKEN: z.string().optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    LOG_DIR: z.string().default('logs'),
    LOG_TO_FILE_DEV: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    LOG_TO_FILE_PROD: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    LOGFLARE_API_KEY: z.string().optional(),
    LOGFLARE_SOURCE_TOKEN: z.string().optional(),
    LOGFLARE_SOURCE_NAME: z.string().optional(),
    LOGFLARE_SERVER_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    LOGFLARE_EDGE_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    // Add server-only variables here (e.g., DATABASE_URL, API_SECRET)
  },

  /**
   * Client-side environment variables schema.
   * To expose them to the client, prefix them with `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.url().optional(),
    NEXT_PUBLIC_LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    // Add public variables here
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to manually destruct them.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    CHROMATIC_PROJECT_TOKEN: process.env.CHROMATIC_PROJECT_TOKEN,
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_DIR: process.env.LOG_DIR,
    LOG_TO_FILE_DEV: process.env.LOG_TO_FILE_DEV,
    LOG_TO_FILE_PROD: process.env.LOG_TO_FILE_PROD,
    LOGFLARE_API_KEY: process.env.LOGFLARE_API_KEY,
    LOGFLARE_SOURCE_TOKEN: process.env.LOGFLARE_SOURCE_TOKEN,
    LOGFLARE_SOURCE_NAME: process.env.LOGFLARE_SOURCE_NAME,
    LOGFLARE_SERVER_ENABLED: process.env.LOGFLARE_SERVER_ENABLED,
    LOGFLARE_EDGE_ENABLED: process.env.LOGFLARE_EDGE_ENABLED,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_LOG_LEVEL: process.env.NEXT_PUBLIC_LOG_LEVEL,
    NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED:
      process.env.NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED,
  },

  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
   * This is especially useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Makes it so that empty strings are treated as undefined.
   * `SOME_VAR: z.string()` and `SOME_VAR=""` will become `SOME_VAR: undefined`.
   */
  emptyStringAsUndefined: true,
});
