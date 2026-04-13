/** @vitest-environment node */
import '@/testing/infrastructure/env';

import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  getNrBrowserCdnConfig,
  isNrBrowserCdnEnabled,
} from './new-relic-browser';

import { mockEnv } from '@/testing/infrastructure/env';

const VALID_AGENT_URL = 'https://js-agent.newrelic.com/nr-spa-1.272.0.min.js';

describe('getNrBrowserCdnConfig', () => {
  beforeEach(() => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = false;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = undefined;
    mockEnv.NEW_RELIC_BROWSER_APP_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = undefined;
  });

  it('returns null when NEW_RELIC_BROWSER_ENABLED is false', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = false;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(getNrBrowserCdnConfig()).toBeNull();
  });

  it('returns null when license key is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = undefined;
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(getNrBrowserCdnConfig()).toBeNull();
  });

  it('returns null when app ID is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(getNrBrowserCdnConfig()).toBeNull();
  });

  it('returns null when agent URL is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = undefined;
    expect(getNrBrowserCdnConfig()).toBeNull();
  });

  it('returns config object when fully configured', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '99887766';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    const config = getNrBrowserCdnConfig();
    expect(config).not.toBeNull();
    expect(config?.licenseKey).toBe('license123');
    expect(config?.appId).toBe('99887766');
    expect(config?.accountId).toBe('6443682');
    expect(config?.agentUrl).toBe(VALID_AGENT_URL);
    expect(config?.init.distributed_tracing.enabled).toBe(true);
    expect(config?.init.privacy.cookies_enabled).toBe(true);
    expect(config?.init.ajax.deny_list).toContain('bam.nr-data.net');
  });

  it('defaults accountId to empty string when ACCOUNT_ID is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '99887766';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    const config = getNrBrowserCdnConfig();
    expect(config?.accountId).toBe('');
  });
});

describe('isNrBrowserCdnEnabled', () => {
  beforeEach(() => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = false;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = undefined;
    mockEnv.NEW_RELIC_BROWSER_APP_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = undefined;
  });

  it('returns false when disabled', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = false;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(isNrBrowserCdnEnabled()).toBe(false);
  });

  it('returns false when license key is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = undefined;
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(isNrBrowserCdnEnabled()).toBe(false);
  });

  it('returns false when agent URL is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = undefined;
    expect(isNrBrowserCdnEnabled()).toBe(false);
  });

  it('returns true when fully configured', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(isNrBrowserCdnEnabled()).toBe(true);
  });
});
