import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getNrBrowserDiagnostics } from './new-relic';

vi.mock('newrelic', () => ({
  agent: {
    collector: { isConnected: vi.fn().mockReturnValue(false) },
    config: { application_id: null },
    getTransaction: vi.fn().mockReturnValue(null),
  },
  getBrowserTimingHeader: vi.fn(),
  startSegment: vi.fn(),
  addCustomAttribute: vi.fn(),
}));

describe('getNrBrowserDiagnostics', () => {
  it('returns diagnostic flags for the browser loader path', () => {
    const diag = getNrBrowserDiagnostics();
    expect(typeof diag.agentLoaded).toBe('boolean');
    expect(typeof diag.agentConnected).toBe('boolean');
    expect(typeof diag.hasActiveTransaction).toBe('boolean');
    expect(typeof diag.hasApplicationId).toBe('boolean');
  });
});
