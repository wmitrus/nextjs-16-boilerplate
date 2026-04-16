import 'server-only';

import { env } from '@/core/env';

export interface NrBrowserCdnConfig {
  accountId: string;
  appId: string;
  licenseKey: string;
  agentUrl: string;
  beacon: string;
  init: {
    distributed_tracing: { enabled: boolean };
    privacy: { cookies_enabled: boolean };
    ajax: { deny_list: string[] };
  };
}

const NR_BEACON_EU = 'bam.eu01.nr-data.net';
const NR_BEACON_US = 'bam.nr-data.net';
export const NR_BEACON_FALLBACK = NR_BEACON_EU;

export { NR_BEACON_EU, NR_BEACON_US };

export function getNrBrowserCdnConfig(): NrBrowserCdnConfig | null {
  if (!env.NEW_RELIC_BROWSER_ENABLED) return null;
  if (
    !env.NEW_RELIC_BROWSER_LICENSE_KEY ||
    !env.NEW_RELIC_BROWSER_APP_ID ||
    !env.NEW_RELIC_BROWSER_ACCOUNT_ID
  )
    return null;
  if (!env.NEW_RELIC_BROWSER_AGENT_URL) return null;

  const beacon = env.NEW_RELIC_BROWSER_BEACON ?? NR_BEACON_FALLBACK;

  return {
    accountId: env.NEW_RELIC_BROWSER_ACCOUNT_ID,
    appId: env.NEW_RELIC_BROWSER_APP_ID,
    licenseKey: env.NEW_RELIC_BROWSER_LICENSE_KEY,
    agentUrl: env.NEW_RELIC_BROWSER_AGENT_URL,
    beacon,
    init: {
      distributed_tracing: { enabled: true },
      privacy: { cookies_enabled: true },
      ajax: { deny_list: [beacon] },
    },
  };
}

export function isNrBrowserCdnEnabled(): boolean {
  return (
    Boolean(env.NEW_RELIC_BROWSER_ENABLED) &&
    Boolean(env.NEW_RELIC_BROWSER_LICENSE_KEY) &&
    Boolean(env.NEW_RELIC_BROWSER_APP_ID) &&
    Boolean(env.NEW_RELIC_BROWSER_ACCOUNT_ID) &&
    Boolean(env.NEW_RELIC_BROWSER_AGENT_URL)
  );
}
