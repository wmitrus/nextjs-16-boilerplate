import { describe, it, expect, beforeEach } from 'vitest';

import { getDashboardToolInventory } from './tools-inventory';

import { mockEnv, resetAllInfrastructureMocks } from '@/testing';

// Initialize environment mock
import '@/testing/infrastructure/env';

describe('getDashboardToolInventory', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
  });

  it('omits demo-route internal links by default (DEMO_SHOWCASE_ENABLED off)', () => {
    mockEnv.DEMO_SHOWCASE_ENABLED = false;
    const tools = getDashboardToolInventory();
    const sentry = tools.find((tool) => tool.id === 'sentry');

    expect(sentry?.internalHref).toBeUndefined();
    expect(sentry?.internalLabel).toBeUndefined();
  });

  it('includes demo-route internal links when DEMO_SHOWCASE_ENABLED is on', () => {
    mockEnv.DEMO_SHOWCASE_ENABLED = true;
    const tools = getDashboardToolInventory();
    const sentry = tools.find((tool) => tool.id === 'sentry');
    const growthbook = tools.find((tool) => tool.id === 'growthbook');
    const upstash = tools.find((tool) => tool.id === 'upstash');

    expect(sentry?.internalHref).toBe('/env-summary');
    expect(growthbook?.internalHref).toBe('/feature-flags-demo');
    expect(upstash?.internalHref).toBe('/security-showcase');
  });
});
