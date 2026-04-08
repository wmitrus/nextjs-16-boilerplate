interface NewRelicAgentCollector {
  isConnected(): boolean;
}

interface NewRelicAgentConfig {
  application_id?: string | null;
}

interface NewRelicAgent {
  collector?: NewRelicAgentCollector;
  config?: NewRelicAgentConfig;
  getTransaction?(): unknown;
}

interface NewRelicApi {
  agent?: NewRelicAgent;
}

function getBootstrapDiagnostics(nr: NewRelicApi) {
  return {
    agentLoaded: true,
    agentConnected: Boolean(nr.agent?.collector?.isConnected()),
    hasApplicationId: Boolean(nr.agent?.config?.application_id),
    hasActiveTransaction: Boolean(nr.agent?.getTransaction?.()),
  };
}

export async function initializeServerObservability(): Promise<void> {
  const appName = process.env.NEW_RELIC_APP_NAME ?? 'unknown';
  const newRelicEnabled = process.env.NEW_RELIC_ENABLED === 'true';
  const hasLicenseKey = Boolean(process.env.NEW_RELIC_LICENSE_KEY?.trim());

  console.info(
    `[New Relic] register() runtime=${process.env.NEXT_RUNTIME ?? 'unknown'} enabled=${newRelicEnabled} license=${hasLicenseKey} app=${appName}`,
  );

  if (!newRelicEnabled) {
    console.info(
      '[New Relic] Skipping server init because NEW_RELIC_ENABLED=false.',
    );
    return;
  }

  if (!hasLicenseKey) {
    console.warn(
      '[New Relic] Skipping server init because NEW_RELIC_LICENSE_KEY is missing or blank.',
    );
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nr = require('newrelic') as NewRelicApi;
    const diag = getBootstrapDiagnostics(nr);

    console.info(
      `[New Relic] Server init loaded connected=${diag.agentConnected} appId=${diag.hasApplicationId} tx=${diag.hasActiveTransaction} app=${appName}`,
    );
  } catch (error) {
    const err =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: 'UnknownError', message: String(error) };

    console.error(
      `[New Relic] Server init failed name=${err.name} message=${err.message}`,
    );
    throw error;
  }
}
