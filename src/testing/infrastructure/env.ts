import type { env as realEnv } from '@/core/env';

/**
 * Mutable type for env to allow mocking.
 */
type MutableEnv = {
  -readonly [K in keyof typeof realEnv]: (typeof realEnv)[K];
};

const defaultEnv: MutableEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'info',
  INTERNAL_API_KEY: 'test-secret',
  SECURITY_ALLOWED_OUTBOUND_HOSTS:
    'api.clerk.com,clerk.com,clerk.services,clerk-telemetry.com,api.github.com',
  VERCEL_ENV: 'development',
  NEXT_PUBLIC_CSP_SCRIPT_EXTRA: '',
  NEXT_PUBLIC_CSP_CONNECT_EXTRA: '',
  NEXT_PUBLIC_CSP_FRAME_EXTRA: '',
  NEXT_PUBLIC_CSP_IMG_EXTRA: '',
  NEXT_PUBLIC_CSP_STYLE_EXTRA: '',
  NEXT_PUBLIC_CSP_FONT_EXTRA: '',
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
  API_RATE_LIMIT_REQUESTS: 100,
  API_RATE_LIMIT_WINDOW: '60 s',
  SECURITY_AUDIT_LOG_ENABLED: true,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test',
  CLERK_SECRET_KEY: 'sk_test',
  LOG_DIR: 'logs',
  LOG_TO_FILE_DEV: false,
  LOG_TO_FILE_PROD: false,
  LOGFLARE_SERVER_ENABLED: false,
  LOGFLARE_EDGE_ENABLED: false,
  CHROMATIC_PROJECT_TOKEN: undefined,
  LOGFLARE_API_KEY: undefined,
  LOGFLARE_SOURCE_TOKEN: undefined,
  LOGFLARE_SOURCE_NAME: undefined,
  LOG_INGEST_SECRET: undefined,
  NEXT_PUBLIC_APP_URL: undefined,
  NEXT_PUBLIC_LOG_LEVEL: 'info',
  NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: false,
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: '/sign-in',
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: '/sign-up',
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: '/',
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: '/',
  NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: '/onboarding',
  NEXT_PUBLIC_CLERK_WAITLIST_URL: '/waitlist',
  E2E_ENABLED: false,
  AUTH_PROVIDER: 'clerk' as const,
};

/**
 * Global Environment Variable Mocks.
 * Centralized singleton mocks for 10x scalability.
 */
export const mockEnv = { ...defaultEnv } as unknown as MutableEnv;

export function resetEnvMocks() {
  Object.assign(mockEnv, defaultEnv);
}
