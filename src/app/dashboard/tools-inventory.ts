import { env } from '@/core/env';

export type DashboardToolGroup =
  | 'Identity & access'
  | 'Observability'
  | 'Product infrastructure'
  | 'Delivery & release'
  | 'Quality workflow';

export type DashboardToolFootprint =
  | 'runtime'
  | 'hybrid'
  | 'ci-only'
  | 'local-only';

export type DashboardToolStatusTone =
  | 'active'
  | 'configured'
  | 'available'
  | 'ci'
  | 'local';

export interface DashboardToolRow {
  readonly id: string;
  readonly name: string;
  readonly group: DashboardToolGroup;
  readonly footprint: DashboardToolFootprint;
  readonly statusLabel: string;
  readonly statusTone: DashboardToolStatusTone;
  readonly description: string;
  readonly dashboardHref?: string;
  readonly dashboardLabel?: string;
  readonly internalHref?: string;
  readonly internalLabel?: string;
  readonly signals: readonly string[];
}

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildTool(
  row: Omit<DashboardToolRow, 'signals'> & { readonly signals?: string[] },
): DashboardToolRow {
  return {
    ...row,
    signals: row.signals ?? [],
  };
}

export function getDashboardToolInventory(): DashboardToolRow[] {
  const authProvider = env.AUTH_PROVIDER;
  const emailProvider = env.EMAIL_PROVIDER;
  const featureFlagProvider = env.FEATURE_FLAG_PROVIDER;

  return [
    buildTool({
      id: 'clerk',
      name: 'Clerk',
      group: 'Identity & access',
      footprint: 'runtime',
      statusLabel: authProvider === 'clerk' ? 'active provider' : 'available',
      statusTone: authProvider === 'clerk' ? 'active' : 'available',
      description:
        'Managed authentication provider with live runtime wiring, CI secrets, and onboarding flows.',
      dashboardHref: 'https://dashboard.clerk.com/',
      dashboardLabel: 'Open Clerk',
      signals: ['env', 'runtime', 'e2e'],
    }),
    buildTool({
      id: 'sentry',
      name: 'Sentry',
      group: 'Observability',
      footprint: 'runtime',
      statusLabel:
        hasValue(env.SENTRY_DSN) || hasValue(env.NEXT_PUBLIC_SENTRY_DSN)
          ? 'configured'
          : 'available',
      statusTone:
        hasValue(env.SENTRY_DSN) || hasValue(env.NEXT_PUBLIC_SENTRY_DSN)
          ? 'configured'
          : 'available',
      description:
        'Server and browser error tracking wired through Next.js instrumentation and runtime env.',
      dashboardHref: 'https://sentry.io/',
      dashboardLabel: 'Open Sentry',
      internalHref: '/env-summary',
      internalLabel: 'Inspect runtime env',
      signals: ['env', 'runtime', 'docs'],
    }),
    buildTool({
      id: 'new-relic',
      name: 'New Relic',
      group: 'Observability',
      footprint: 'hybrid',
      statusLabel:
        env.NEW_RELIC_ENABLED || env.NEW_RELIC_BROWSER_ENABLED
          ? env.NEW_RELIC_ENABLED && env.NEW_RELIC_BROWSER_ENABLED
            ? 'apm + browser enabled'
            : 'partially enabled'
          : 'available',
      statusTone:
        env.NEW_RELIC_ENABLED || env.NEW_RELIC_BROWSER_ENABLED
          ? 'configured'
          : 'available',
      description:
        'APM, browser monitoring, change tracking, and release diagnostics integrated across runtime and workflows.',
      dashboardHref: 'https://one.newrelic.com/',
      dashboardLabel: 'Open New Relic',
      internalHref: '/env-summary',
      internalLabel: 'Inspect runtime env',
      signals: ['env', 'runtime', 'workflow'],
    }),
    buildTool({
      id: 'better-stack',
      name: 'Better Stack',
      group: 'Observability',
      footprint: 'hybrid',
      statusLabel:
        env.BETTERSTACK_ENABLED || env.BETTERSTACK_WEB_VITALS_ENABLED
          ? env.BETTERSTACK_ENABLED && env.BETTERSTACK_WEB_VITALS_ENABLED
            ? 'logs + web vitals enabled'
            : 'partially enabled'
          : 'available',
      statusTone:
        env.BETTERSTACK_ENABLED || env.BETTERSTACK_WEB_VITALS_ENABLED
          ? 'configured'
          : 'available',
      description:
        'Logtail transport, browser vitals, and Better Stack ingest rewrites are wired into the app runtime.',
      dashboardHref: 'https://betterstack.com/',
      dashboardLabel: 'Open Better Stack',
      internalHref: '/security-showcase',
      internalLabel: 'Open security showcase',
      signals: ['env', 'runtime', 'route'],
    }),
    buildTool({
      id: 'logflare',
      name: 'Logflare',
      group: 'Observability',
      footprint: 'runtime',
      statusLabel:
        env.LOGFLARE_SERVER_ENABLED ||
        env.LOGFLARE_EDGE_ENABLED ||
        env.NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED
          ? 'configured'
          : 'available',
      statusTone:
        env.LOGFLARE_SERVER_ENABLED ||
        env.LOGFLARE_EDGE_ENABLED ||
        env.NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED
          ? 'configured'
          : 'available',
      description:
        'Structured pino forwarding for server, edge, and browser log pipelines.',
      dashboardHref: 'https://logflare.app/',
      dashboardLabel: 'Open Logflare',
      internalHref: '/env-summary',
      internalLabel: 'Inspect runtime env',
      signals: ['env', 'runtime'],
    }),
    buildTool({
      id: 'growthbook',
      name: 'GrowthBook',
      group: 'Product infrastructure',
      footprint: 'runtime',
      statusLabel:
        featureFlagProvider === 'growthbook' ? 'active provider' : 'available',
      statusTone: featureFlagProvider === 'growthbook' ? 'active' : 'available',
      description:
        'Feature flag provider integrated in the service factory with a live demo route for runtime inspection.',
      dashboardHref: 'https://app.growthbook.io/',
      dashboardLabel: 'Open GrowthBook',
      internalHref: '/feature-flags-demo',
      internalLabel: 'Open demo route',
      signals: ['env', 'runtime', 'demo'],
    }),
    buildTool({
      id: 'upstash',
      name: 'Upstash Redis',
      group: 'Product infrastructure',
      footprint: 'runtime',
      statusLabel:
        hasValue(env.UPSTASH_REDIS_REST_URL) &&
        hasValue(env.UPSTASH_REDIS_REST_TOKEN)
          ? 'configured'
          : 'available',
      statusTone:
        hasValue(env.UPSTASH_REDIS_REST_URL) &&
        hasValue(env.UPSTASH_REDIS_REST_TOKEN)
          ? 'configured'
          : 'available',
      description:
        'Rate limiting and edge-safe Redis integration used by the security middleware stack.',
      dashboardHref: 'https://console.upstash.com/',
      dashboardLabel: 'Open Upstash',
      internalHref: '/security-showcase',
      internalLabel: 'Open security showcase',
      signals: ['env', 'runtime', 'security'],
    }),
    buildTool({
      id: 'resend',
      name: 'Resend',
      group: 'Product infrastructure',
      footprint: 'runtime',
      statusLabel: emailProvider === 'resend' ? 'active provider' : 'available',
      statusTone: emailProvider === 'resend' ? 'active' : 'available',
      description:
        'Email delivery provider wired as an auth and onboarding transport option.',
      dashboardHref: 'https://resend.com/emails',
      dashboardLabel: 'Open Resend',
      signals: ['env', 'runtime', 'auth'],
    }),
    buildTool({
      id: 'smtp',
      name: 'SMTP / Nodemailer',
      group: 'Product infrastructure',
      footprint: 'runtime',
      statusLabel: emailProvider === 'smtp' ? 'active provider' : 'available',
      statusTone: emailProvider === 'smtp' ? 'active' : 'available',
      description:
        'SMTP transport path for environments that need provider-managed mail outside Resend.',
      signals: ['env', 'runtime', 'auth'],
    }),
    buildTool({
      id: 'vercel',
      name: 'Vercel',
      group: 'Delivery & release',
      footprint: 'hybrid',
      statusLabel: env.VERCEL_ENV
        ? `active ${env.VERCEL_ENV}`
        : 'workflow integrated',
      statusTone: env.VERCEL_ENV ? 'active' : 'ci',
      description:
        'Preview and production deployments run through dedicated GitHub Actions workflows and Vercel CLI orchestration.',
      dashboardHref: 'https://vercel.com/dashboard',
      dashboardLabel: 'Open Vercel',
      signals: ['workflow', 'deploy', 'platform'],
    }),
    buildTool({
      id: 'chromatic',
      name: 'Chromatic',
      group: 'Delivery & release',
      footprint: 'ci-only',
      statusLabel: hasValue(env.CHROMATIC_PROJECT_TOKEN)
        ? 'ci configured'
        : 'ci available',
      statusTone: 'ci',
      description:
        'Visual review and Storybook publishing are wired through the dedicated Chromatic workflow.',
      dashboardHref: 'https://www.chromatic.com/builds',
      dashboardLabel: 'Open Chromatic',
      signals: ['workflow', 'storybook', 'ci'],
    }),
    buildTool({
      id: 'lighthouse-ci',
      name: 'Lighthouse CI',
      group: 'Delivery & release',
      footprint: 'ci-only',
      statusLabel: 'preview + production audits',
      statusTone: 'ci',
      description:
        'Performance auditing runs in GitHub Actions for hosted deployments, including preview URLs.',
      dashboardHref:
        env.LHCI_SERVER_BASE_URL ||
        'https://github.com/GoogleChrome/lighthouse-ci',
      dashboardLabel: 'Open Lighthouse CI',
      signals: ['workflow', 'ci', 'performance'],
    }),
    buildTool({
      id: 'codacy',
      name: 'Codacy',
      group: 'Quality workflow',
      footprint: 'ci-only',
      statusLabel: 'analysis workflow',
      statusTone: 'ci',
      description:
        'Static analysis and findings export are supported through repository scripts and CI automation.',
      dashboardHref: 'https://app.codacy.com/',
      dashboardLabel: 'Open Codacy',
      signals: ['script', 'ci', 'security'],
    }),
    buildTool({
      id: 'continue',
      name: 'Continue',
      group: 'Quality workflow',
      footprint: 'ci-only',
      statusLabel: 'review workflow',
      statusTone: 'ci',
      description:
        'Prompt-driven repository checks run in GitHub Actions and can also be replayed locally through the CLI.',
      dashboardHref: 'https://hub.continue.dev/',
      dashboardLabel: 'Open Continue',
      signals: ['workflow', 'cli', 'ai'],
    }),
    buildTool({
      id: 'leantime',
      name: 'Leantime',
      group: 'Quality workflow',
      footprint: 'local-only',
      statusLabel: 'local automation',
      statusTone: 'local',
      description:
        'On-prem task lifecycle integration is automated through repository CLI commands and local compose services.',
      dashboardHref: env.LEANTIME_LOCAL_APP_URL || 'http://localhost:8080',
      dashboardLabel: 'Open Leantime',
      signals: ['script', 'local', 'ops'],
    }),
  ].sort((left, right) => left.name.localeCompare(right.name));
}
