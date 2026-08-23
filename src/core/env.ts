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
    NODE_OPTIONS: z.string().optional(),
    CHROMATIC_PROJECT_TOKEN: z.string().optional(),
    LHCI_SERVER_BASE_URL: z.url().optional(),
    LEANTIME_LOCAL_APP_URL: z.url().optional(),
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
    // Must be the Upstash **REST** endpoint (https://<id>.upstash.io), not
    // the `rediss://` connection string. A bare z.url() accepts either, and
    // the @upstash/redis client fetch()es whatever it is given -- so the
    // wrong one passes validation, passes deploy, and only surfaces at
    // runtime as an opaque `TypeError: fetch failed` that silently degrades
    // every Redis-backed control to its in-memory fallback. Reject it here,
    // where the mistake is obvious, instead.
    UPSTASH_REDIS_REST_URL: z
      .url()
      .refine(
        (value) => value.startsWith('https://') || value.startsWith('http://'),
        'UPSTASH_REDIS_REST_URL must be the Upstash REST URL (https://<id>.upstash.io), not a rediss:// connection string',
      )
      .optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    API_RATE_LIMIT_REQUESTS: z.coerce.number().default(10),
    API_RATE_LIMIT_WINDOW: z.string().default('60 s'),
    LOG_INGEST_SECRET: z.string().optional(),
    SENTRY_DSN: z.url().optional(),
    NEW_RELIC_LICENSE_KEY: z.string().optional(),
    NEW_RELIC_APP_NAME: z.string().default('nextjs-16-boilerplate'),
    NEW_RELIC_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    NEW_RELIC_NERDGRAPH_API_URL: z.url().optional(),
    NEW_RELIC_USER_API_KEY: z.string().optional(),
    NEW_RELIC_ACCOUNT_ID: z.coerce.number().int().positive().optional(),
    NEW_RELIC_BROWSER_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    NEW_RELIC_BROWSER_LICENSE_KEY: z.string().optional(),
    NEW_RELIC_BROWSER_APP_ID: z.string().optional(),
    NEW_RELIC_BROWSER_APPLICATION_ID: z.string().optional(),
    NEW_RELIC_BROWSER_ACCOUNT_ID: z.string().optional(),
    NEW_RELIC_BROWSER_AGENT_URL: z.url().optional(),
    NEW_RELIC_BROWSER_BEACON: z.string().optional(),
    NEW_RELIC_LOG_DRAIN_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    NEW_RELIC_OTEL_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    BETTERSTACK_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    BETTER_STACK_SOURCE_TOKEN: z.string().optional(),
    BETTERSTACK_WEB_VITALS_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    BETTER_STACK_INGESTING_URL: z
      .url()
      .default('https://in.logs.betterstack.com'),
    CLERK_SECRET_KEY: z.string().min(1).optional(),
    NEXTAUTH_SECRET: z.string().min(1).optional(),
    NEXTAUTH_URL: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.url().optional(),
    ),
    VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
    INTERNAL_API_KEY: z.string().min(1).optional(),
    SECURITY_AUDIT_LOG_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(true),
    SECURITY_ALLOWED_OUTBOUND_HOSTS: z
      .string()
      .default(
        'api.clerk.com,clerk.com,clerk.services,clerk-telemetry.com,api.github.com',
      ),
    // Overall wall-clock budget for a secureFetch() call, spanning every
    // redirect hop (not reset per hop -- a chain of redirects must not be
    // able to add up to an unbounded total wait). See A.8.3 in
    // docs/ai/general/SECURITY_CODING_PATTERNS.md (SEC-28).
    // Escape hatch for local development against a plaintext endpoint.
    // Deliberately INERT in production: `secureFetch` ignores it when
    // NODE_ENV === 'production' and logs that it did, so a value that leaks
    // into a production environment cannot silently downgrade outbound
    // traffic to cleartext. See SEC-39.
    SECURITY_OUTBOUND_ALLOW_INSECURE_HTTP: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    SECURITY_OUTBOUND_FETCH_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(10_000),
    // Response bodies secureFetch() reads are bounded to this many bytes --
    // never fully buffered without a cap. Default 10MB.
    SECURITY_OUTBOUND_FETCH_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10_485_760),
    // Gates the demo/showcase routes in DEMO_ROUTE_PREFIXES
    // (src/security/middleware/route-policy.ts). Off by default in every
    // environment, including production — flip on temporarily in Vercel
    // when giving a live demo, then flip back off.
    DEMO_SHOWCASE_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    // Optional extra restriction on top of DEMO_SHOWCASE_ENABLED: when set,
    // only the signed-in user with this exact email can reach a demo route
    // even while the flag is on. Leave unset to allow any authenticated
    // user (fine for a single-operator personal app).
    DEMO_SHOWCASE_ALLOWED_EMAIL: z.email().optional(),
    // Which script-src CSP this deployment serves — a deployment-wide
    // choice, not a per-route one (see SEC-31 in
    // docs/ai/general/SECURITY_CODING_PATTERNS.md for why per-route mixing
    // doesn't work under App Router client-side navigation: CSP is a
    // document-level policy, so a <Link> soft-navigation into a "stricter"
    // route keeps enforcing the CSP of whatever document the browser
    // actually loaded).
    //
    // 'cache-compatible' (default): legacy 'unsafe-inline' script-src (no
    // 'unsafe-eval' in production/preview). Compatible with this app's
    // cacheComponents: true (Partial Prerendering) setup. Renamed from the
    // old boolean CSP_SCRIPT_STRICT_MODE=false on 2026-08-21 — same
    // behavior, clearer contract (a boolean's "off" implied an insecure
    // fallback, when it's actually the only mode this architecture
    // supports today).
    //
    // 'nonce-dynamic': nonce + 'strict-dynamic', no 'unsafe-inline'/
    // 'unsafe-eval'. Per-request nonce CSP is currently incompatible with
    // cacheComponents/PPR — confirmed both by Next.js's own docs ("Partial
    // Prerendering (PPR) is incompatible with nonce-based CSP since static
    // shell scripts won't have access to the nonce") and by a Next.js
    // maintainer on an Aug 2026 issue against Next 16.3.0 confirming
    // unsafe-inline is "the only way for the time being" while upstream
    // React/Next work lands (tracked upstream: vercel/next.js#89754,
    // #95354, #96665). Turning this on reproduced an app-wide hydration
    // failure live on a real mobile device (see SEC-30's incident
    // writeup). Only safe for a deployment that doesn't rely on
    // cacheComponents/PPR at all — see with-headers.ts, layout.tsx, and
    // the e2e:csp-nonce-dynamic scenario that verifies this mode
    // end-to-end (script-tag nonces, zero CSP violations, real hydration).
    //
    // 'hash-ppr' (reserved, not implemented): once Next/React ship
    // build-time hash-source support for Partial Prerendering's inline
    // Flight bootstrap scripts, this will let a cache-compatible
    // deployment go fully strict (no unsafe-inline, no nonce, hash-source
    // CSP) without losing PPR. Not available upstream yet — do not
    // implement ahead of framework support.
    CSP_SCRIPT_MODE: z
      .enum(['cache-compatible', 'nonce-dynamic'])
      .default('cache-compatible'),
    E2E_ENABLED: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .default(false),
    AUTH_PROVIDER: z
      .enum(['clerk', 'authjs', 'supabase', 'neon'])
      .default('clerk'),
    DB_PROVIDER: z.enum(['drizzle', 'prisma']).default('drizzle'),
    DATABASE_URL: z.string().optional(),
    DB_DRIVER: z.enum(['pglite', 'postgres']).optional(),
    TENANCY_MODE: z.enum(['single', 'personal', 'org']).default('single'),
    DEFAULT_TENANT_ID: z.uuid().optional(),
    TENANT_CONTEXT_SOURCE: z.enum(['provider', 'db']).optional(),
    TENANT_CONTEXT_HEADER: z.string().default('x-tenant-id'),
    TENANT_CONTEXT_COOKIE: z.string().default('active_tenant_id'),
    FREE_TIER_MAX_USERS: z.coerce.number().int().positive().default(5),
    CROSS_PROVIDER_EMAIL_LINKING: z
      .enum(['disabled', 'verified-only'])
      .default('verified-only'),
    REGISTRATION_MODE: z
      .enum(['open', 'invite-only', 'disabled'])
      .default('invite-only'),
    AUTH_EXPOSE_RESET_TOKEN_IN_DEV: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .optional()
      .default(false),
    AUTH_DEV_AUTO_VERIFY: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .optional()
      .default(false),
    AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .optional()
      .default(false),
    EMAIL_PROVIDER: z.enum(['none', 'resend', 'smtp']).default('none'),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_SECURE: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .optional()
      .default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM_EMAIL: z.string().optional(),
    WAITLIST_INVITE_ORGANIZATION_ID: z.uuid().optional(),
    WAITLIST_INVITE_ROLE_ID: z.uuid().optional(),
    WAITLIST_SEND_REJECTION_EMAIL: z
      .preprocess((val) => val === 'true' || val === true, z.boolean())
      .optional()
      .default(true),
    ADMIN_USER_EMAILS: z.string().optional(),
    FEATURE_FLAG_PROVIDER: z
      .enum(['static', 'db', 'growthbook'])
      .default('static'),
    FEATURE_FLAGS_STATIC: z.string().optional(),
    GROWTHBOOK_CLIENT_KEY: z.string().optional(),
    GROWTHBOOK_API_HOST: z.url().optional(),
    // Login abuse control (SEC-34) -- dedicated IP-bucket rate limit for the
    // AuthJS Credentials callback, separate from the generic API_RATE_LIMIT_*
    // used everywhere else. See docs/ai/general/SECURITY_CODING_PATTERNS.md.
    LOGIN_RATE_LIMIT_IP_REQUESTS: z.coerce
      .number()
      .int()
      .positive()
      .default(20),
    LOGIN_RATE_LIMIT_IP_WINDOW: z.string().default('15 m'),
    // Account-bucket: consecutive failed attempts against one normalized
    // email, independent of the IP bucket above. Crossing each threshold
    // escalates the response (require CAPTCHA, add a progressive delay,
    // then a temporary lock) rather than a single flat cutoff.
    /**
     * Deploy-time base for the `strict_rate_limit_degrade` operational
     * switch (SEC-42). `true` makes strict rate limiting fall back to the
     * process-local counter instead of failing closed when neither the
     * primary nor the durable secondary can be reached.
     *
     * Default `false`. Leave it there: the runtime override (a feature flag,
     * where the provider supports one) is the intended lever, because it can
     * be turned back off without a redeploy. Setting this to `true` degrades
     * a security control until someone remembers to change it back.
     */
    /**
     * Which ingress sits in front of this deployment, and therefore which
     * header may determine the client IP (SEC-43).
     *
     * A trust boundary, not a convenience setting -- so it is **required in
     * production** and defaults to `none` only for local development and
     * tests, where forcing every contributor to declare an ingress they do
     * not have would be friction with no security value. The production
     * requirement is enforced by `validateDeploymentProxyConfigValues`.
     *
     * `none` means no header is believed and every request resolves as
     * untrusted. That is a safe default, not a working one.
     */
    DEPLOYMENT_PROXY: z
      .enum(['vercel', 'cloudflare', 'trusted-proxy', 'none'])
      .optional(),
    /**
     * Comma-separated CIDRs of the operator's own proxies. Required when
     * `DEPLOYMENT_PROXY=trusted-proxy`, meaningless otherwise.
     */
    TRUSTED_PROXY_CIDRS: z.string().optional(),
    RATE_LIMIT_STRICT_DEGRADE: z
      .string()
      .optional()
      .transform((value) => value === 'true')
      .pipe(z.boolean())
      .default(false),
    LOGIN_ABUSE_WINDOW: z.string().default('30 m'),
    LOGIN_ABUSE_CAPTCHA_THRESHOLD: z.coerce
      .number()
      .int()
      .positive()
      .default(3),
    LOGIN_ABUSE_DELAY_THRESHOLD: z.coerce.number().int().positive().default(8),
    LOGIN_ABUSE_LOCK_THRESHOLD: z.coerce.number().int().positive().default(15),
    // Cloudflare Turnstile -- optional. When either key is unset, the
    // CAPTCHA gate is skipped (progressive delay/lock still apply); see
    // `isTurnstileConfigured()` in `src/shared/lib/captcha/turnstile.ts`.
    TURNSTILE_SECRET_KEY: z.string().optional(),
    // E2E_ENABLED bypasses the account-bucket abuse control entirely (see
    // auth.ts) so unrelated specs sharing a stable test account never get
    // captcha-gated/locked by another spec's deliberate wrong-password
    // test. The one spec that exists specifically to exercise that control
    // (e2e/authjs-login-abuse-control.spec.ts) sets this flag to force it
    // back on for its own run only -- never set outside that scenario.
    E2E_LOGIN_ABUSE_CONTROL_ENABLED: z
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
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN: z.string().optional(),
    NEXT_PUBLIC_BETTER_STACK_INGESTING_URL: z
      .url()
      .default('https://in.logs.betterstack.com'),
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default('/sign-in'),
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default('/sign-up'),
    // Post-auth landings should point to a stable app route. Bootstrap remains
    // a server-owned secondary provisioning route reached via guards.
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_WAITLIST_URL: z.string().default('/waitlist'),
    // CSP Configuration
    NEXT_PUBLIC_CSP_SCRIPT_EXTRA: z.string().default(''),
    NEXT_PUBLIC_CSP_CONNECT_EXTRA: z.string().default(''),
    NEXT_PUBLIC_CSP_FRAME_EXTRA: z.string().default(''),
    NEXT_PUBLIC_CSP_IMG_EXTRA: z.string().default(''),
    NEXT_PUBLIC_CSP_FONT_EXTRA: z.string().default(''),
    NEXT_PUBLIC_CSP_STYLE_EXTRA: z.string().default(''),
    // Build-time-inlined copy of CSP_SCRIPT_MODE, set via next.config.ts's
    // `env` key (NOT hand-set in a .env file -- Next.js's `env` config
    // option does a textual process.env.KEY replacement at build time, so
    // this always reflects what the running build was actually compiled
    // for, regardless of what the RUNTIME env now claims). Compared
    // against the runtime-read CSP_SCRIPT_MODE in with-headers.ts as a
    // build/runtime invariant (A.8.4): a mismatch there is the same class
    // of bug as SEC-30's original incident (nonce CSP emitted for a build
    // that wasn't actually compiled with cacheComponents disabled) from a
    // different trigger -- env drift between build and redeploy, not a
    // missing next.config.ts branch. Optional because it's absent outside
    // an actual Next.js build (tests, this file's own module-load
    // validation running under vitest) -- the invariant check only runs
    // when a build-time value is actually known.
    NEXT_PUBLIC_BUILD_CSP_SCRIPT_MODE: z
      .enum(['cache-compatible', 'nonce-dynamic'])
      .optional(),
    // Cloudflare Turnstile site key (public by design -- pairs with the
    // server-only TURNSTILE_SECRET_KEY). See SEC-34.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
    // Add public variables here
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to manually destruct them.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NODE_OPTIONS: process.env.NODE_OPTIONS,
    CHROMATIC_PROJECT_TOKEN: process.env.CHROMATIC_PROJECT_TOKEN,
    LHCI_SERVER_BASE_URL: process.env.LHCI_SERVER_BASE_URL,
    LEANTIME_LOCAL_APP_URL: process.env.LEANTIME_LOCAL_APP_URL,
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_DIR: process.env.LOG_DIR,
    LOG_TO_FILE_DEV: process.env.LOG_TO_FILE_DEV,
    LOG_TO_FILE_PROD: process.env.LOG_TO_FILE_PROD,
    LOGFLARE_API_KEY: process.env.LOGFLARE_API_KEY,
    LOGFLARE_SOURCE_TOKEN: process.env.LOGFLARE_SOURCE_TOKEN,
    LOGFLARE_SOURCE_NAME: process.env.LOGFLARE_SOURCE_NAME,
    LOGFLARE_SERVER_ENABLED: process.env.LOGFLARE_SERVER_ENABLED,
    LOGFLARE_EDGE_ENABLED: process.env.LOGFLARE_EDGE_ENABLED,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    API_RATE_LIMIT_REQUESTS: process.env.API_RATE_LIMIT_REQUESTS,
    API_RATE_LIMIT_WINDOW: process.env.API_RATE_LIMIT_WINDOW,
    LOG_INGEST_SECRET: process.env.LOG_INGEST_SECRET,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEW_RELIC_LICENSE_KEY: process.env.NEW_RELIC_LICENSE_KEY,
    NEW_RELIC_APP_NAME: process.env.NEW_RELIC_APP_NAME,
    NEW_RELIC_ENABLED: process.env.NEW_RELIC_ENABLED,
    NEW_RELIC_NERDGRAPH_API_URL: process.env.NEW_RELIC_NERDGRAPH_API_URL,
    NEW_RELIC_USER_API_KEY: process.env.NEW_RELIC_USER_API_KEY,
    NEW_RELIC_ACCOUNT_ID: process.env.NEW_RELIC_ACCOUNT_ID,
    NEW_RELIC_BROWSER_ENABLED: process.env.NEW_RELIC_BROWSER_ENABLED,
    NEW_RELIC_BROWSER_LICENSE_KEY: process.env.NEW_RELIC_BROWSER_LICENSE_KEY,
    NEW_RELIC_BROWSER_ACCOUNT_ID: process.env.NEW_RELIC_BROWSER_ACCOUNT_ID,
    NEW_RELIC_BROWSER_APP_ID: process.env.NEW_RELIC_BROWSER_APP_ID,
    NEW_RELIC_BROWSER_APPLICATION_ID:
      process.env.NEW_RELIC_BROWSER_APPLICATION_ID,
    NEW_RELIC_BROWSER_AGENT_URL: process.env.NEW_RELIC_BROWSER_AGENT_URL,
    NEW_RELIC_BROWSER_BEACON: process.env.NEW_RELIC_BROWSER_BEACON,
    NEW_RELIC_LOG_DRAIN_ENABLED: process.env.NEW_RELIC_LOG_DRAIN_ENABLED,
    NEW_RELIC_OTEL_ENABLED: process.env.NEW_RELIC_OTEL_ENABLED,
    BETTERSTACK_ENABLED: process.env.BETTERSTACK_ENABLED,
    BETTER_STACK_SOURCE_TOKEN: process.env.BETTER_STACK_SOURCE_TOKEN,
    BETTERSTACK_WEB_VITALS_ENABLED: process.env.BETTERSTACK_WEB_VITALS_ENABLED,
    BETTER_STACK_INGESTING_URL: process.env.BETTER_STACK_INGESTING_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
    SECURITY_AUDIT_LOG_ENABLED: process.env.SECURITY_AUDIT_LOG_ENABLED,
    SECURITY_ALLOWED_OUTBOUND_HOSTS:
      process.env.SECURITY_ALLOWED_OUTBOUND_HOSTS,
    SECURITY_OUTBOUND_ALLOW_INSECURE_HTTP:
      process.env.SECURITY_OUTBOUND_ALLOW_INSECURE_HTTP,
    SECURITY_OUTBOUND_FETCH_TIMEOUT_MS:
      process.env.SECURITY_OUTBOUND_FETCH_TIMEOUT_MS,
    SECURITY_OUTBOUND_FETCH_MAX_BYTES:
      process.env.SECURITY_OUTBOUND_FETCH_MAX_BYTES,
    DEMO_SHOWCASE_ENABLED: process.env.DEMO_SHOWCASE_ENABLED,
    DEMO_SHOWCASE_ALLOWED_EMAIL: process.env.DEMO_SHOWCASE_ALLOWED_EMAIL,
    CSP_SCRIPT_MODE: process.env.CSP_SCRIPT_MODE,
    E2E_ENABLED: process.env.E2E_ENABLED,
    AUTH_PROVIDER: process.env.AUTH_PROVIDER,
    DB_PROVIDER: process.env.DB_PROVIDER,
    DATABASE_URL: process.env.DATABASE_URL,
    DB_DRIVER: process.env.DB_DRIVER,
    TENANCY_MODE: process.env.TENANCY_MODE,
    DEFAULT_TENANT_ID: process.env.DEFAULT_TENANT_ID,
    TENANT_CONTEXT_SOURCE: process.env.TENANT_CONTEXT_SOURCE,
    TENANT_CONTEXT_HEADER: process.env.TENANT_CONTEXT_HEADER,
    TENANT_CONTEXT_COOKIE: process.env.TENANT_CONTEXT_COOKIE,
    FREE_TIER_MAX_USERS: process.env.FREE_TIER_MAX_USERS,
    CROSS_PROVIDER_EMAIL_LINKING: process.env.CROSS_PROVIDER_EMAIL_LINKING,
    REGISTRATION_MODE: process.env.REGISTRATION_MODE,
    AUTH_EXPOSE_RESET_TOKEN_IN_DEV: process.env.AUTH_EXPOSE_RESET_TOKEN_IN_DEV,
    AUTH_DEV_AUTO_VERIFY: process.env.AUTH_DEV_AUTO_VERIFY,
    AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV:
      process.env.AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL,
    WAITLIST_INVITE_ORGANIZATION_ID:
      process.env.WAITLIST_INVITE_ORGANIZATION_ID,
    WAITLIST_INVITE_ROLE_ID: process.env.WAITLIST_INVITE_ROLE_ID,
    WAITLIST_SEND_REJECTION_EMAIL: process.env.WAITLIST_SEND_REJECTION_EMAIL,
    ADMIN_USER_EMAILS: process.env.ADMIN_USER_EMAILS,
    FEATURE_FLAG_PROVIDER: process.env.FEATURE_FLAG_PROVIDER,
    FEATURE_FLAGS_STATIC: process.env.FEATURE_FLAGS_STATIC,
    GROWTHBOOK_CLIENT_KEY: process.env.GROWTHBOOK_CLIENT_KEY,
    GROWTHBOOK_API_HOST: process.env.GROWTHBOOK_API_HOST,
    LOGIN_RATE_LIMIT_IP_REQUESTS: process.env.LOGIN_RATE_LIMIT_IP_REQUESTS,
    LOGIN_RATE_LIMIT_IP_WINDOW: process.env.LOGIN_RATE_LIMIT_IP_WINDOW,
    DEPLOYMENT_PROXY: process.env.DEPLOYMENT_PROXY,
    TRUSTED_PROXY_CIDRS: process.env.TRUSTED_PROXY_CIDRS,
    RATE_LIMIT_STRICT_DEGRADE: process.env.RATE_LIMIT_STRICT_DEGRADE,
    LOGIN_ABUSE_WINDOW: process.env.LOGIN_ABUSE_WINDOW,
    LOGIN_ABUSE_CAPTCHA_THRESHOLD: process.env.LOGIN_ABUSE_CAPTCHA_THRESHOLD,
    LOGIN_ABUSE_DELAY_THRESHOLD: process.env.LOGIN_ABUSE_DELAY_THRESHOLD,
    LOGIN_ABUSE_LOCK_THRESHOLD: process.env.LOGIN_ABUSE_LOCK_THRESHOLD,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    E2E_LOGIN_ABUSE_CONTROL_ENABLED:
      process.env.E2E_LOGIN_ABUSE_CONTROL_ENABLED,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_LOG_LEVEL: process.env.NEXT_PUBLIC_LOG_LEVEL,
    NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED:
      process.env.NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED,
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN:
      process.env.NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN,
    NEXT_PUBLIC_BETTER_STACK_INGESTING_URL:
      process.env.NEXT_PUBLIC_BETTER_STACK_INGESTING_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_WAITLIST_URL: process.env.NEXT_PUBLIC_CLERK_WAITLIST_URL,
    NEXT_PUBLIC_CSP_SCRIPT_EXTRA: process.env.NEXT_PUBLIC_CSP_SCRIPT_EXTRA,
    NEXT_PUBLIC_CSP_CONNECT_EXTRA: process.env.NEXT_PUBLIC_CSP_CONNECT_EXTRA,
    NEXT_PUBLIC_CSP_FRAME_EXTRA: process.env.NEXT_PUBLIC_CSP_FRAME_EXTRA,
    NEXT_PUBLIC_CSP_IMG_EXTRA: process.env.NEXT_PUBLIC_CSP_IMG_EXTRA,
    NEXT_PUBLIC_CSP_FONT_EXTRA: process.env.NEXT_PUBLIC_CSP_FONT_EXTRA,
    NEXT_PUBLIC_CSP_STYLE_EXTRA: process.env.NEXT_PUBLIC_CSP_STYLE_EXTRA,
    NEXT_PUBLIC_BUILD_CSP_SCRIPT_MODE:
      process.env.NEXT_PUBLIC_BUILD_CSP_SCRIPT_MODE,
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

/**
 * Cross-field tenancy configuration validation against explicit values.
 * Decoupled from global `env` — accepts values from any source (config object, env, test fixtures).
 *
 * Rules:
 * - TENANCY_MODE=single requires DEFAULT_TENANT_ID
 * - TENANCY_MODE=org requires TENANT_CONTEXT_SOURCE (provider|db)
 */
export function validateTenancyConfigValues(
  tenancyMode: string | undefined,
  defaultTenantId: string | undefined,
  tenantContextSource: string | undefined,
): void {
  if (tenancyMode === 'single' && !defaultTenantId) {
    throw new Error(
      '[env] TENANCY_MODE=single requires DEFAULT_TENANT_ID to be set (must be a valid UUID). ' +
        'Set DEFAULT_TENANT_ID=<uuid> in your environment variables.',
    );
  }

  if (tenancyMode === 'org' && !tenantContextSource) {
    throw new Error(
      '[env] TENANCY_MODE=org requires TENANT_CONTEXT_SOURCE to be set (provider|db). ' +
        'Set TENANT_CONTEXT_SOURCE=provider for Clerk Organizations, or TENANT_CONTEXT_SOURCE=db for app-level tenant selection.',
    );
  }
}

/**
 * Cross-field observability validation against explicit values.
 *
 * Rules:
 * - NEW_RELIC_ENABLED=true requires NEW_RELIC_LICENSE_KEY
 * - Vercel runtimes must not preload New Relic through NODE_OPTIONS
 */
export function validateNewRelicConfigValues(
  newRelicEnabled: boolean | string | undefined,
  newRelicLicenseKey: string | undefined,
  nodeOptions?: string | undefined,
  _nodeEnv?: string | undefined,
  vercelEnv?: string | undefined,
): void {
  const isNewRelicEnabled =
    newRelicEnabled === true || newRelicEnabled === 'true';
  const normalizedLicenseKey = newRelicLicenseKey?.trim() ?? '';
  const normalizedNodeOptions = nodeOptions?.trim() ?? '';

  if (isNewRelicEnabled && normalizedLicenseKey.length === 0) {
    throw new Error('NEW_RELIC_ENABLED=true requires NEW_RELIC_LICENSE_KEY.');
  }

  if (
    vercelEnv &&
    /(^|\s)(?:-r|--require=?)\s*newrelic(?=\s|$)/.test(normalizedNodeOptions)
  ) {
    throw new Error(
      '[env] NODE_OPTIONS must not preload newrelic on Vercel. Use instrumentation.ts late-load plus Vercel log drain/browser CDN monitoring instead.',
    );
  }
}

/**
 * Cross-field auth provider configuration validation against explicit values.
 *
 * Rules:
 * - AUTH_PROVIDER=clerk requires CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 * - AUTH_PROVIDER=authjs requires NEXTAUTH_SECRET when NODE_ENV=production
 * - AUTH_PROVIDER=authjs requires NEXTAUTH_URL for production runtime, but not Vercel Preview
 */
function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateAuthProviderConfigValues(
  authProvider: string | undefined,
  clerkSecretKey: string | undefined,
  clerkPublishableKey: string | undefined,
  nextAuthSecret?: string | undefined,
  nodeEnv?: string | undefined,
  nextAuthUrl?: string | undefined,
  vercelEnv?: string | undefined,
): void {
  if (authProvider === 'authjs') {
    const isProductionLike = nodeEnv === 'production';
    if (isProductionLike && !nextAuthSecret?.trim()) {
      throw new Error(
        '[env] AUTH_PROVIDER=authjs requires NEXTAUTH_SECRET to be set when NODE_ENV=production.',
      );
    }

    const normalizedNextAuthUrl = nextAuthUrl?.trim() ?? '';
    if (
      normalizedNextAuthUrl.length > 0 &&
      !isValidHttpUrl(normalizedNextAuthUrl)
    ) {
      throw new Error(
        '[env] AUTH_PROVIDER=authjs requires NEXTAUTH_URL to be a valid absolute http(s) URL when set.',
      );
    }

    const isProductionRuntime = isProductionLike && vercelEnv !== 'preview';
    if (isProductionRuntime && normalizedNextAuthUrl.length === 0) {
      throw new Error(
        '[env] AUTH_PROVIDER=authjs requires NEXTAUTH_URL to be set for production runtime. Vercel Preview deployments may rely on Vercel-provided request context, but Production must have an explicit runtime URL.',
      );
    }

    return;
  }

  if (authProvider !== 'clerk') {
    return;
  }

  if (!clerkSecretKey) {
    throw new Error(
      '[env] AUTH_PROVIDER=clerk requires CLERK_SECRET_KEY to be set.',
    );
  }

  if (!clerkPublishableKey) {
    throw new Error(
      '[env] AUTH_PROVIDER=clerk requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to be set.',
    );
  }
}

/**
 * Cross-field auth provider configuration validation from global env.
 * Convenience wrapper around validateAuthProviderConfigValues for bootstrap/startup.
 */
export function validateAuthProviderConfig(): void {
  validateAuthProviderConfigValues(
    env.AUTH_PROVIDER,
    env.CLERK_SECRET_KEY,
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    env.NEXTAUTH_SECRET,
    env.NODE_ENV,
    env.NEXTAUTH_URL,
    env.VERCEL_ENV,
  );
}

/**
 * Cross-field tenancy configuration validation from global env.
 * Convenience wrapper around validateTenancyConfigValues for bootstrap/startup.
 */
export function validateTenancyConfig(): void {
  validateTenancyConfigValues(
    env.TENANCY_MODE,
    env.DEFAULT_TENANT_ID,
    env.TENANT_CONTEXT_SOURCE,
  );
}

/**
 * Cross-field email verification configuration validation against explicit values.
 *
 * Rules enforced (C-ENV-1 from constraints.md):
 * - Both bypass flags simultaneously → error (ambiguous config)
 * - Production + any bypass flag → error (bypasses banned in production)
 * - Production + REGISTRATION_MODE=open → error (no mailer exists, dead-end signup)
 * - Non-production + REGISTRATION_MODE=open + no bypass path → error (dead-end signup)
 */
export function validateVerificationConfigValues(
  nodeEnv: string | undefined,
  registrationMode: string | undefined,
  devAutoVerify: boolean | undefined,
  exposeVerificationToken: boolean | undefined,
): void {
  const isProduction = nodeEnv === 'production';
  const isOpen = registrationMode === 'open';
  const autoVerify = devAutoVerify === true;
  const exposeToken = exposeVerificationToken === true;

  if (autoVerify && exposeToken) {
    throw new Error(
      '[env] AUTH_DEV_AUTO_VERIFY and AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV cannot both be true. Choose one bypass path.',
    );
  }

  if (isProduction && (autoVerify || exposeToken)) {
    throw new Error(
      '[env] AUTH_DEV_AUTO_VERIFY and AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV are banned in production.',
    );
  }

  if (isProduction && isOpen) {
    throw new Error(
      '[env] REGISTRATION_MODE=open is not allowed in production without a real email delivery adapter. Set REGISTRATION_MODE=invite-only or REGISTRATION_MODE=disabled.',
    );
  }

  if (!isProduction && isOpen && !autoVerify && !exposeToken) {
    throw new Error(
      '[env] REGISTRATION_MODE=open in non-production requires either AUTH_DEV_AUTO_VERIFY=true or AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV=true. Without a bypass path, users cannot complete email verification.',
    );
  }
}

/**
 * Cross-field email verification configuration validation from global env.
 * Convenience wrapper around validateVerificationConfigValues for bootstrap/startup.
 */
export function validateVerificationConfig(): void {
  validateVerificationConfigValues(
    env.NODE_ENV,
    env.REGISTRATION_MODE,
    env.AUTH_DEV_AUTO_VERIFY,
    env.AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV,
  );
}

/**
 * Resolves the effective deployment trust model, enforcing that production
 * declares one explicitly (SEC-43).
 *
 * Deliberately **not** auto-detected. `VERCEL_ENV` is read only to make the
 * error message useful — inferring `vercel` from its presence would mean a
 * deployment starts trusting headers because of an environment variable
 * nobody set for that purpose, which is the same "believe the header because
 * it is there" mistake one level up.
 *
 * Development and test default to `none`: a contributor running the app
 * locally has no ingress to declare, and making them invent one would be
 * friction with no security value. `none` trusts nothing, so the default is
 * safe even though it is not useful.
 */
export function resolveDeploymentProxyValue(
  deploymentProxy: string | undefined,
  nodeEnv: string | undefined,
  vercelEnv: string | undefined,
): 'vercel' | 'cloudflare' | 'trusted-proxy' | 'none' {
  const declared = deploymentProxy?.trim();
  if (declared) {
    return declared as 'vercel' | 'cloudflare' | 'trusted-proxy' | 'none';
  }

  if (nodeEnv === 'production') {
    const hint = vercelEnv
      ? ' Detected a Vercel deployment (VERCEL_ENV is set): set DEPLOYMENT_PROXY=vercel explicitly.'
      : '';
    throw new Error(
      '[env] DEPLOYMENT_PROXY must be set when NODE_ENV=production. It declares which ' +
        'ingress may determine the client IP, and no safe value can be guessed. ' +
        'Valid values: vercel | cloudflare | trusted-proxy | none.' +
        hint,
    );
  }

  return 'none';
}

/**
 * Cross-field rules for the deployment trust model. Separate from
 * `resolveDeploymentProxyValue` so the resolver stays a pure lookup and the
 * rules can be asserted on their own.
 */
export function validateDeploymentProxyConfigValues(
  deploymentProxy: string | undefined,
  trustedProxyCidrs: string | undefined,
  nodeEnv: string | undefined,
  vercelEnv: string | undefined,
): void {
  const effective = resolveDeploymentProxyValue(
    deploymentProxy,
    nodeEnv,
    vercelEnv,
  );

  if (effective !== 'trusted-proxy') return;

  const entries = (trustedProxyCidrs ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error(
      '[env] DEPLOYMENT_PROXY=trusted-proxy requires TRUSTED_PROXY_CIDRS ' +
        '(comma-separated CIDRs of your own proxies, e.g. "10.0.0.0/8,172.16.0.0/12"). ' +
        'Without it there is nothing to distinguish your proxies from a client.',
    );
  }
}

/** Convenience wrapper for bootstrap/startup. */
export function validateDeploymentProxyConfig(): void {
  validateDeploymentProxyConfigValues(
    env.DEPLOYMENT_PROXY,
    env.TRUSTED_PROXY_CIDRS,
    env.NODE_ENV,
    env.VERCEL_ENV,
  );
}
