import 'server-only';

import { env } from '@/core/env';

/**
 * Returns the New Relic Browser standalone CDN agent configuration snippet.
 *
 * This is the CDN-based mode (independent of the APM Node.js agent).
 * It requires a separate NR Browser application to be created in the NR UI,
 * providing its own licenseKey and appId.
 *
 * Unlike the APM-linked mode in new-relic.ts, this mode works on Vercel
 * without NODE_OPTIONS and without the APM agent being connected.
 *
 * Enable via: NEW_RELIC_BROWSER_ENABLED=true + NEW_RELIC_BROWSER_LICENSE_KEY + NEW_RELIC_BROWSER_APP_ID
 */
export function getNrBrowserCdnSnippet(): string {
  if (!env.NEW_RELIC_BROWSER_ENABLED) return '';
  if (!env.NEW_RELIC_BROWSER_LICENSE_KEY || !env.NEW_RELIC_BROWSER_APP_ID)
    return '';

  const licenseKey = env.NEW_RELIC_BROWSER_LICENSE_KEY;
  const appId = env.NEW_RELIC_BROWSER_APP_ID;

  return `
(function() {
  var NREUM = window.NREUM || {};
  window.NREUM = NREUM;
  NREUM.loader_config = {
    accountID: "",
    trustKey: "",
    agentID: ${JSON.stringify(appId)},
    licenseKey: ${JSON.stringify(licenseKey)},
    applicationID: ${JSON.stringify(appId)}
  };
  NREUM.info = {
    beacon: "bam.nr-data.net",
    errorBeacon: "bam.nr-data.net",
    licenseKey: ${JSON.stringify(licenseKey)},
    applicationID: ${JSON.stringify(appId)},
    sa: 1
  };
})();
`.trim();
}

/**
 * Returns true when the CDN standalone browser mode is active and configured.
 * This is used to conditionally load the NR Browser CDN script from layout.
 */
export function isNrBrowserCdnEnabled(): boolean {
  return (
    Boolean(env.NEW_RELIC_BROWSER_ENABLED) &&
    Boolean(env.NEW_RELIC_BROWSER_LICENSE_KEY) &&
    Boolean(env.NEW_RELIC_BROWSER_APP_ID)
  );
}
