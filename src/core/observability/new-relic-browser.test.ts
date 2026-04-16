/** @vitest-environment node */
import '@/testing/infrastructure/env';

import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  NR_BEACON_EU,
  NR_BEACON_FALLBACK,
  NR_BEACON_US,
  getNrBrowserCdnConfig,
  isNrBrowserCdnEnabled,
} from './new-relic-browser';

import { mockEnv } from '@/testing/infrastructure/env';

const VALID_AGENT_URL = 'https://js-agent.newrelic.com/nr-spa-1.272.0.min.js';

describe('NR beacon constants', () => {
  it('exports correct EU beacon', () => {
    expect(NR_BEACON_EU).toBe('bam.eu01.nr-data.net');
  });

  it('exports correct US beacon', () => {
    expect(NR_BEACON_US).toBe('bam.nr-data.net');
  });

  it('fallback is the EU beacon', () => {
    expect(NR_BEACON_FALLBACK).toBe(NR_BEACON_EU);
  });
});

describe('getNrBrowserCdnConfig', () => {
  beforeEach(() => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = false;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = undefined;
    mockEnv.NEW_RELIC_BROWSER_APP_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_APPLICATION_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = undefined;
    mockEnv.NEW_RELIC_BROWSER_BEACON = undefined;
  });

  it('returns null when NEW_RELIC_BROWSER_ENABLED is false', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = false;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(getNrBrowserCdnConfig()).toBeNull();
  });

  it('returns null when license key is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = undefined;
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(getNrBrowserCdnConfig()).toBeNull();
  });

  it('returns null when app ID is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(getNrBrowserCdnConfig()).toBeNull();
  });

  it('returns null when account ID is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(getNrBrowserCdnConfig()).toBeNull();
  });

  it('returns null when agent URL is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = undefined;
    expect(getNrBrowserCdnConfig()).toBeNull();
  });

  it('returns config with agentId equal to APP_ID and applicationId falling back to APP_ID when APPLICATION_ID is not set', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '99887766';
    mockEnv.NEW_RELIC_BROWSER_APPLICATION_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    const config = getNrBrowserCdnConfig();
    expect(config).not.toBeNull();
    expect(config?.agentId).toBe('99887766');
    expect(config?.applicationId).toBe('99887766');
    expect(config?.licenseKey).toBe('license123');
    expect(config?.accountId).toBe('6443682');
    expect(config?.agentUrl).toBe(VALID_AGENT_URL);
    expect(config?.init.distributed_tracing.enabled).toBe(true);
    expect(config?.init.privacy.cookies_enabled).toBe(true);
  });

  it('returns config with separate agentId and applicationId when APPLICATION_ID is explicitly set', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '538838547';
    mockEnv.NEW_RELIC_BROWSER_APPLICATION_ID = '421415380';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    const config = getNrBrowserCdnConfig();
    expect(config?.agentId).toBe('538838547');
    expect(config?.applicationId).toBe('421415380');
  });

  it('uses EU beacon fallback when BEACON env var is not set', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '99887766';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    mockEnv.NEW_RELIC_BROWSER_BEACON = undefined;
    const config = getNrBrowserCdnConfig();
    expect(config?.beacon).toBe(NR_BEACON_EU);
    expect(config?.init.ajax.deny_list).toContain(NR_BEACON_EU);
  });

  it('uses explicit beacon when BEACON env var is set', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '99887766';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    mockEnv.NEW_RELIC_BROWSER_BEACON = NR_BEACON_US;
    const config = getNrBrowserCdnConfig();
    expect(config?.beacon).toBe(NR_BEACON_US);
    expect(config?.init.ajax.deny_list).toContain(NR_BEACON_US);
    expect(config?.init.ajax.deny_list).not.toContain(NR_BEACON_EU);
  });
});

describe('isNrBrowserCdnEnabled', () => {
  beforeEach(() => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = false;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = undefined;
    mockEnv.NEW_RELIC_BROWSER_APP_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = undefined;
  });

  it('returns false when disabled', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = false;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(isNrBrowserCdnEnabled()).toBe(false);
  });

  it('returns false when license key is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = undefined;
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(isNrBrowserCdnEnabled()).toBe(false);
  });

  it('returns false when account ID is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = undefined;
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(isNrBrowserCdnEnabled()).toBe(false);
  });

  it('returns false when agent URL is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = undefined;
    expect(isNrBrowserCdnEnabled()).toBe(false);
  });

  it('returns true when fully configured', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    mockEnv.NEW_RELIC_BROWSER_ACCOUNT_ID = '6443682';
    mockEnv.NEW_RELIC_BROWSER_AGENT_URL = VALID_AGENT_URL;
    expect(isNrBrowserCdnEnabled()).toBe(true);
  });
});
