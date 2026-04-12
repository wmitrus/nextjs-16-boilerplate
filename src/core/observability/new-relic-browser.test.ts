import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/core/env', () => ({ env: {} }));

import {
  getNrBrowserCdnSnippet,
  isNrBrowserCdnEnabled,
} from './new-relic-browser';

import { mockEnv } from '@/testing/infrastructure/env';

describe('getNrBrowserCdnSnippet', () => {
  it('returns empty string when NEW_RELIC_BROWSER_ENABLED is false', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = false;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    expect(getNrBrowserCdnSnippet()).toBe('');
  });

  it('returns empty string when license key is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = undefined;
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    expect(getNrBrowserCdnSnippet()).toBe('');
  });

  it('returns empty string when app ID is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = undefined;
    expect(getNrBrowserCdnSnippet()).toBe('');
  });

  it('returns a CDN config snippet when fully configured', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '99887766';
    const snippet = getNrBrowserCdnSnippet();
    expect(snippet).toContain('NREUM');
    expect(snippet).toContain('"license123"');
    expect(snippet).toContain('"99887766"');
    expect(snippet).toContain('bam.nr-data.net');
  });
});

describe('isNrBrowserCdnEnabled', () => {
  it('returns false when disabled', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = false;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    expect(isNrBrowserCdnEnabled()).toBe(false);
  });

  it('returns false when token is missing', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = undefined;
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    expect(isNrBrowserCdnEnabled()).toBe(false);
  });

  it('returns true when fully configured', () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_BROWSER_LICENSE_KEY = 'license123';
    mockEnv.NEW_RELIC_BROWSER_APP_ID = '12345678';
    expect(isNrBrowserCdnEnabled()).toBe(true);
  });
});
