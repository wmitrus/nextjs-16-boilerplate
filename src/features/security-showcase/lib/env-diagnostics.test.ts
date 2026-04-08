// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = process.env;

describe('getEnvDiagnostics', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.resetModules();
  });

  it('flags New Relic as misconfigured when enabled without a license key', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      CLERK_SECRET_KEY: 'sk_test_secret',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
      INTERNAL_API_KEY: 'internal-key',
      NEW_RELIC_ENABLED: 'true',
      NEW_RELIC_LICENSE_KEY: '',
    };

    const { getEnvDiagnostics } = await import('./env-diagnostics');
    const diagnostics = getEnvDiagnostics();

    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.conditionalIssues).toContainEqual({
      condition: 'NEW_RELIC_ENABLED=true',
      missing: ['NEW_RELIC_LICENSE_KEY'],
      issue:
        'New Relic is enabled but the server license key is missing, so backend and browser telemetry cannot start.',
    });
  });

  it('does not report a New Relic issue when enabled with a license key', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      CLERK_SECRET_KEY: 'sk_test_secret',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
      INTERNAL_API_KEY: 'internal-key',
      NEW_RELIC_ENABLED: 'true',
      NEW_RELIC_LICENSE_KEY: 'nr_license_key',
      NODE_OPTIONS: '--require newrelic',
    };

    const { getEnvDiagnostics } = await import('./env-diagnostics');
    const diagnostics = getEnvDiagnostics();

    expect(
      diagnostics.conditionalIssues.some(
        (issue) => issue.condition === 'NEW_RELIC_ENABLED=true',
      ),
    ).toBe(false);
  });

  it('flags New Relic preload as misconfigured when NODE_OPTIONS does not preload the agent', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      CLERK_SECRET_KEY: 'sk_test_secret',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
      INTERNAL_API_KEY: 'internal-key',
      NEW_RELIC_ENABLED: 'true',
      NEW_RELIC_LICENSE_KEY: 'nr_license_key',
      NODE_OPTIONS: '',
    };

    const { getEnvDiagnostics } = await import('./env-diagnostics');
    const diagnostics = getEnvDiagnostics();

    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.conditionalIssues).toContainEqual({
      condition: 'NEW_RELIC_ENABLED=true in hosted production runtime',
      missing: ['NODE_OPTIONS includes --require newrelic'],
      issue:
        'New Relic is enabled but the Node.js process is not preloading the agent, so Next.js/Vercel transactions and browser timing headers can fail to initialize.',
    });
  });
});
