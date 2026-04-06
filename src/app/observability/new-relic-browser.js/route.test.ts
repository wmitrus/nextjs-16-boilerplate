/** @vitest-environment node */
import '@/testing/infrastructure/env';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetBrowserAgentScriptSafe } = vi.hoisted(() => ({
  mockGetBrowserAgentScriptSafe: vi.fn(),
}));

vi.mock('@/core/observability/new-relic', () => ({
  getBrowserAgentScriptSafe: mockGetBrowserAgentScriptSafe,
}));

import { GET, dynamic, runtime } from './route';

import { mockEnv } from '@/testing/infrastructure/env';

describe('GET /observability/new-relic-browser.js', () => {
  beforeEach(() => {
    mockEnv.NEW_RELIC_ENABLED = false;
    mockGetBrowserAgentScriptSafe.mockReset();
  });

  it('pins the route to request-time Node execution', () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
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

  it('returns an empty script when the runtime loader and env fallback are both unavailable', async () => {
    mockEnv.NEW_RELIC_ENABLED = true;
    mockGetBrowserAgentScriptSafe.mockReturnValue('');

    const response = await GET();

    expect(await response.text()).toBe('');
    expect(mockGetBrowserAgentScriptSafe).toHaveBeenCalledTimes(1);
  });

  it('returns the resolved browser script when available', async () => {
    mockEnv.NEW_RELIC_ENABLED = true;
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
