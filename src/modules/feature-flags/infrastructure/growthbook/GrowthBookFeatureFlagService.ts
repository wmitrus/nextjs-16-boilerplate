import { GrowthBookClient } from '@growthbook/growthbook';

import type { FeatureFlagEvaluationContext } from '@/core/contracts/feature-flags';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';

interface ClientEntry {
  client: GrowthBookClient;
  ready: Promise<void>;
}

const clientCache = new Map<string, ClientEntry>();

function getOrCreateClient(clientKey: string, apiHost: string): ClientEntry {
  const cacheKey = `${clientKey}|${apiHost}`;
  const existing = clientCache.get(cacheKey);
  if (existing) return existing;

  const client = new GrowthBookClient({ clientKey, apiHost });
  const ready = client.init({ timeout: 2000 }).then(() => undefined);
  const entry: ClientEntry = { client, ready };
  clientCache.set(cacheKey, entry);
  return entry;
}

export interface GrowthBookFeatureFlagServiceConfig {
  clientKey: string;
  apiHost: string;
}

/**
 * OZI-71 FF·D — locked GrowthBook targeting-compatibility decision (gate
 * closed: no rule/experiment in the connection this repo owns targets
 * `company` or `id`, so a direct cutover carries no live behavior change):
 *
 * - `attributes.id` <- the evaluating subject (`userId` for a user, the
 *   stable `systemSubjectId` for a system caller) -- unchanged meaning.
 * - `attributes.company` <- the canonical internal `OrganizationId` for
 *   `organization` scope. NEVER a `TenantId`, never recovered from a legacy
 *   context. No `companyLegacy` bridge -- none is justified by the closed
 *   gate.
 * - `platform-global` scope has no organization to report: `company` is
 *   simply omitted rather than fabricating an organization/company value
 *   merely to satisfy the SDK shape.
 */
export class GrowthBookFeatureFlagService implements FeatureFlagService {
  private readonly clientKey: string;
  private readonly apiHost: string;

  constructor(config: GrowthBookFeatureFlagServiceConfig) {
    this.clientKey = config.clientKey;
    this.apiHost = config.apiHost;
  }

  async isEnabled(
    flag: string,
    context: FeatureFlagEvaluationContext,
  ): Promise<boolean> {
    const { client, ready } = getOrCreateClient(this.clientKey, this.apiHost);
    await ready;

    const id =
      context.subject.kind === 'user'
        ? context.subject.userId
        : context.subject.systemSubjectId;

    const attributes: Record<string, unknown> = { id };
    if (context.scope.kind === 'organization') {
      attributes.company = context.scope.organizationId;
    }

    return client.isOn(flag, { attributes });
  }
}
