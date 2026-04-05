// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  getBundle,
  getPreset,
  hasBundle,
  hasPreset,
  resolveBundlePresets,
} from './catalog';

describe('new-relic query catalog', () => {
  it('resolves known presets', () => {
    expect(getPreset('latency.summary').title).toBe('Latency Summary');
    expect(hasPreset('errors.percentage')).toBe(true);
  });

  it('resolves known bundles', () => {
    expect(getBundle('baseline').title).toBe('Baseline Health');
    expect(hasBundle('trends')).toBe(true);
  });

  it('expands bundle presets in order', () => {
    const presets = resolveBundlePresets(getBundle('golden-signals'));

    expect(presets.map((preset) => preset.id)).toEqual([
      'throughput.count',
      'latency.summary',
      'errors.percentage',
      'apdex.summary',
    ]);
  });

  it('throws on unknown preset ids', () => {
    expect(() => getPreset('missing.preset')).toThrow(
      'Unknown New Relic preset',
    );
  });
});
