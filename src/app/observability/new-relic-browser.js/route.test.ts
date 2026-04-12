/** @vitest-environment node */
import '@/testing/infrastructure/env';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetBrowserAgentScriptSafe, mockGetNrBrowserDiagnostics } =
  vi.hoisted(() => ({
    mockGetBrowserAgentScriptSafe: vi.fn(),
    mockGetNrBrowserDiagnostics: vi.fn().mockReturnValue({
      agentLoaded: false,
      agentConnected: false,
      hasActiveTransaction: false,
      hasApplicationId: false,
    }),
  }));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    connection: vi.fn().mockResolvedValue(undefined),
  };
});

const { mockGetNrBrowserCdnSnippet } = vi.hoisted(() => ({
  mockGetNrBrowserCdnSnippet: vi.fn().mockReturnValue(''),
}));

vi.mock('@/core/observability/new-relic', () => ({
  getBrowserAgentScriptSafe: mockGetBrowserAgentScriptSafe,
  getNrBrowserDiagnostics: mockGetNrBrowserDiagnostics,
}));

vi.mock('@/core/observability/new-relic-browser', () => ({
  getNrBrowserCdnSnippet: mockGetNrBrowserCdnSnippet,
}));

import { GET } from './route';

import { mockEnv } from '@/testing/infrastructure/env';

describe('GET /observability/new-relic-browser.js', () => {
  beforeEach(() => {
    mockEnv.NEW_RELIC_ENABLED = false;
    mockEnv.NEW_RELIC_LICENSE_KEY = undefined;
    mockEnv.NEW_RELIC_BROWSER_ENABLED = false;
    mockEnv.VERCEL_ENV = undefined;
    mockGetBrowserAgentScriptSafe.mockReset();
    mockGetNrBrowserCdnSnippet.mockReset();
    mockGetNrBrowserCdnSnippet.mockReturnValue('');
    mockGetNrBrowserDiagnostics.mockReturnValue({
      agentLoaded: false,
      agentConnected: false,
      hasActiveTransaction: false,
      hasApplicationId: false,
    });
  });

  it('returns an empty script when New Relic is disabled', async () => {
    const response = await GET();

    expect(response.headers.get('Content-Type')).toBe(
      'application/javascript; charset=utf-8',
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('');
    expect(mockGetBrowserAgentScriptSafe).not.toHaveBeenCalled();
  });

  it('returns an empty script when the runtime loader is unavailable', async () => {
    mockEnv.NEW_RELIC_ENABLED = true;
    mockEnv.NEW_RELIC_LICENSE_KEY = 'nr_license_key';
    mockGetBrowserAgentScriptSafe.mockReturnValue('');

    const response = await GET();

    expect(await response.text()).toBe('');
    expect(mockGetBrowserAgentScriptSafe).toHaveBeenCalledTimes(1);
    expect(mockGetNrBrowserDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('emits console.warn when agent is unavailable outside Vercel', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockEnv.NEW_RELIC_ENABLED = true;
    mockEnv.NEW_RELIC_LICENSE_KEY = 'nr_license_key';
    mockEnv.VERCEL_ENV = undefined;
    mockGetBrowserAgentScriptSafe.mockReturnValue('');

    await GET();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[NR Browser] Empty script'),
    );
    warnSpy.mockRestore();
  });

  it('emits console.info (not warn) when agent is unavailable on Vercel', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    mockEnv.NEW_RELIC_ENABLED = true;
    mockEnv.NEW_RELIC_LICENSE_KEY = 'nr_license_key';
    mockEnv.VERCEL_ENV = 'preview';
    mockGetBrowserAgentScriptSafe.mockReturnValue('');

    await GET();

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[NR Browser] Empty script'),
    );
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('returns the resolved browser script when available', async () => {
    mockEnv.NEW_RELIC_ENABLED = true;
    mockEnv.NEW_RELIC_LICENSE_KEY = 'nr_license_key';
    mockGetBrowserAgentScriptSafe.mockReturnValue(
      ';window.NREUM||(NREUM={});NREUM.init={};',
    );

    const response = await GET();

    expect(await response.text()).toBe(
      ';window.NREUM||(NREUM={});NREUM.init={};',
    );
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('returns CDN snippet when NEW_RELIC_BROWSER_ENABLED is true and snippet is available', async () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockGetNrBrowserCdnSnippet.mockReturnValue(
      '(function(){window.NREUM={};})();',
    );

    const response = await GET();

    expect(await response.text()).toBe('(function(){window.NREUM={};})();');
    expect(response.headers.get('Content-Type')).toBe(
      'application/javascript; charset=utf-8',
    );
    expect(mockGetBrowserAgentScriptSafe).not.toHaveBeenCalled();
  });

  it('falls through to APM mode when CDN snippet is empty', async () => {
    mockEnv.NEW_RELIC_BROWSER_ENABLED = true;
    mockEnv.NEW_RELIC_ENABLED = true;
    mockEnv.NEW_RELIC_LICENSE_KEY = 'nr_license_key';
    mockGetNrBrowserCdnSnippet.mockReset();
    mockGetNrBrowserCdnSnippet.mockReturnValue('');
    mockGetBrowserAgentScriptSafe.mockReturnValue(';window.NREUM||(NREUM={});');

    const response = await GET();

    expect(await response.text()).toBe(';window.NREUM||(NREUM={});');
  });

  it('returns empty when both modes disabled', async () => {
    mockEnv.NEW_RELIC_ENABLED = false;
    mockEnv.NEW_RELIC_BROWSER_ENABLED = false;

    const response = await GET();

    expect(await response.text()).toBe('');
    expect(mockGetNrBrowserCdnSnippet).not.toHaveBeenCalled();
    expect(mockGetBrowserAgentScriptSafe).not.toHaveBeenCalled();
  });
});
