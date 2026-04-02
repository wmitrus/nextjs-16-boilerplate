import { GrowthBookClient } from '@growthbook/growthbook';

import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';

interface ClientEntry {
  client: GrowthBookClient;
  ready: Promise<void>;
}

const clientCache = new Map<string, ClientEntry>();

function getOrCreateClient(clientKey: string, apiHost: string): ClientEntry {
  const existing = clientCache.get(clientKey);
  if (existing) return existing;

  const client = new GrowthBookClient({ clientKey, apiHost });
  const ready = client
    .init({ timeout: 2000, streaming: true })
    .then(() => undefined);
  const entry: ClientEntry = { client, ready };
  clientCache.set(clientKey, entry);
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
    const { client, ready } = getOrCreateClient(this.clientKey, this.apiHost);
    await ready;
    await client.refreshFeatures();
    return client.isOn(flag, {
      attributes: {
        id: context.subject.id,
        company: context.tenant.tenantId,
      },
    });
  }
}
