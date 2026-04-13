import 'server-only';

import { env } from '@/core/env';

export interface NrBrowserCdnConfig {
  accountId: string;
  appId: string;
  licenseKey: string;
  agentUrl: string;
  init: {
    distributed_tracing: { enabled: boolean };
    privacy: { cookies_enabled: boolean };
    ajax: { deny_list: string[] };
  };
}

export function getNrBrowserCdnConfig(): NrBrowserCdnConfig | null {
  if (!env.NEW_RELIC_BROWSER_ENABLED) return null;
  if (!env.NEW_RELIC_BROWSER_LICENSE_KEY || !env.NEW_RELIC_BROWSER_APP_ID)
    return null;
  if (!env.NEW_RELIC_BROWSER_AGENT_URL) return null;

  return {
    accountId: env.NEW_RELIC_BROWSER_ACCOUNT_ID ?? '',
    appId: env.NEW_RELIC_BROWSER_APP_ID,
    licenseKey: env.NEW_RELIC_BROWSER_LICENSE_KEY,
    agentUrl: env.NEW_RELIC_BROWSER_AGENT_URL,
    init: {
      distributed_tracing: { enabled: true },
      privacy: { cookies_enabled: true },
      ajax: { deny_list: ['bam.nr-data.net'] },
    },
  };
}

export function isNrBrowserCdnEnabled(): boolean {
  return (
    Boolean(env.NEW_RELIC_BROWSER_ENABLED) &&
    Boolean(env.NEW_RELIC_BROWSER_LICENSE_KEY) &&
    Boolean(env.NEW_RELIC_BROWSER_APP_ID) &&
    Boolean(env.NEW_RELIC_BROWSER_AGENT_URL)
  );
}
