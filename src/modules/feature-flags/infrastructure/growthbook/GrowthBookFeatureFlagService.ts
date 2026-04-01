import { GrowthBook } from '@growthbook/growthbook';

import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';

interface CacheEntry {
  gb: GrowthBook;
  ready: Promise<void>;
}

const instanceCache = new Map<string, CacheEntry>();

function getOrCreateInstance(clientKey: string, apiHost: string): CacheEntry {
  const existing = instanceCache.get(clientKey);
  if (existing) return existing;

  const gb = new GrowthBook({ clientKey, apiHost });
  const ready = gb.init({ timeout: 2000 }).then(() => undefined);
  const entry: CacheEntry = { gb, ready };
  instanceCache.set(clientKey, entry);
  return entry;
}

export interface GrowthBookFeatureFlagServiceConfig {
  clientKey: string;
  apiHost: string;
}

export class GrowthBookFeatureFlagService implements FeatureFlagService {
  private readonly clientKey: string;
  private readonly apiHost: string;

  constructor(config: GrowthBookFeatureFlagServiceConfig) {
    this.clientKey = config.clientKey;
    this.apiHost = config.apiHost;
  }

  async isEnabled(
    flag: string,
    context: AuthorizationContext,
  ): Promise<boolean> {
    const { gb, ready } = getOrCreateInstance(this.clientKey, this.apiHost);

    await ready;

    await gb.setAttributes({
      id: context.subject.id,
      company: context.tenant.tenantId,
    });

    return gb.isOn(flag);
  }
}
