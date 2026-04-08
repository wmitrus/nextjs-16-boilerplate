/** @vitest-environment node */
import '@/testing/infrastructure/env';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetBrowserAgentScriptSafe, mockGetNrBrowserDiagnostics } =
  vi.hoisted(() => ({
    mockGetBrowserAgentScriptSafe: vi.fn(),
    mockGetNrBrowserDiagnostics: vi.fn().mockReturnValue({
      agentLoaded: false,
      agentConnected: false,
    }),
  }));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    connection: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/core/observability/new-relic', () => ({
  getBrowserAgentScriptSafe: mockGetBrowserAgentScriptSafe,
  getNrBrowserDiagnostics: mockGetNrBrowserDiagnostics,
}));

import { GET } from './route';

import { mockEnv } from '@/testing/infrastructure/env';

describe('GET /observability/new-relic-browser.js', () => {
  beforeEach(() => {
    mockEnv.NEW_RELIC_ENABLED = false;
    mockEnv.NEW_RELIC_LICENSE_KEY = undefined;
    mockGetBrowserAgentScriptSafe.mockReset();
    mockGetNrBrowserDiagnostics.mockReturnValue({
      agentLoaded: false,
      agentConnected: false,
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
});
