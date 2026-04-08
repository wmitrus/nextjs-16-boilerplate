import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getNrBrowserDiagnostics } from './new-relic';

vi.mock('newrelic', () => ({
  agent: { collector: { isConnected: vi.fn().mockReturnValue(false) } },
  getBrowserTimingHeader: vi.fn(),
  startSegment: vi.fn(),
  addCustomAttribute: vi.fn(),
}));

describe('getNrBrowserDiagnostics', () => {
  it('returns agentLoaded and agentConnected flags', () => {
    const diag = getNrBrowserDiagnostics();
    expect(typeof diag.agentLoaded).toBe('boolean');
    expect(typeof diag.agentConnected).toBe('boolean');
  });
});
