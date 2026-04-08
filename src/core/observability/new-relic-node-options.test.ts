import { describe, expect, it } from 'vitest';

import { nodeOptionsPreloadsNewRelic } from './new-relic-node-options';

describe('nodeOptionsPreloadsNewRelic', () => {
  it('accepts the repo-local preload shim', () => {
    expect(
      nodeOptionsPreloadsNewRelic('--require ./scripts/new-relic/preload.cjs'),
    ).toBe(true);
  });

  it('accepts direct package preload for backward compatibility', () => {
    expect(nodeOptionsPreloadsNewRelic('--require newrelic')).toBe(true);
    expect(nodeOptionsPreloadsNewRelic('-r newrelic')).toBe(true);
  });

  it('rejects unrelated node options', () => {
    expect(nodeOptionsPreloadsNewRelic('--trace-warnings')).toBe(false);
  });
});
