import 'server-only';

import { createRequire } from 'node:module';

export type ContainerExecutionContext =
  | 'rsc'
  | 'server_action'
  | 'route_handler';

interface NewRelicAgentCollector {
  isConnected(): boolean;
}

interface NewRelicAgentConfig {
  application_id?: string | null;
}

interface NewRelicAgent {
  collector: NewRelicAgentCollector;
  config?: NewRelicAgentConfig;
  getTransaction?(): unknown;
}

interface NewRelicApi {
  agent: NewRelicAgent;
  startSegment<T>(name: string, record: boolean, handler: () => T): T;
  addCustomAttribute(key: string, value: string | number | boolean): void;
  getBrowserTimingHeader(options?: {
    nonce?: string;
    hasToRemoveScriptWrapper?: boolean;
  }): string;
}

let _newrelic: NewRelicApi | null | undefined = undefined;
const cjsRequire = createRequire(import.meta.url);

function tryGetNewRelic(): NewRelicApi | null {
  if (_newrelic !== undefined) return _newrelic;

  try {
    _newrelic = cjsRequire('newrelic') as NewRelicApi;
  } catch {
    _newrelic = null;
  }

  return _newrelic;
}

export function withContainerCreationSpan<T>(fn: () => T): T {
  const nr = tryGetNewRelic();
  if (!nr) return fn();
  return nr.startSegment('di.container.create', true, fn);
}

export function recordContainerCreated(
  instanceId: string,
  executionContext: ContainerExecutionContext,
): void {
  const nr = tryGetNewRelic();
  if (!nr) return;

  nr.addCustomAttribute('container.created', true);
  nr.addCustomAttribute('container.instance_id', instanceId);
  nr.addCustomAttribute('request.cache.scope', 'rsc');
  nr.addCustomAttribute('execution.context', executionContext);
}

/**
 * Returns the APM-linked browser timing header (rum loader).
 *
 * WARNING — PRERENDER CONSTRAINT: Do NOT call this function in any Server
 * Component or layout that may be statically prerendered by Next.js 16.
 * The NR agent internally records timestamps (Date.now()) during
 * getBrowserTimingHeader(), which triggers the Next.js prerender dynamic
 * data access check and throws at build time.
 *
 * Browser monitoring is delivered via the /observability/new-relic-browser.js
 * route handler which calls this function at request time (after connection()).
 */
export function getBrowserTimingHeaderSafe(): string {
  const nr = tryGetNewRelic();
  if (!nr) return '';

  if (!nr.agent?.collector?.isConnected()) return '';

  try {
    const header = nr.getBrowserTimingHeader({
      hasToRemoveScriptWrapper: true,
    });
    return header.startsWith('<!--') ? '' : header;
  } catch {
    return '';
  }
}

/**
 * Returns the NR Browser SPA snippet for the /observability/new-relic-browser.js
 * route. Requires the NR APM agent to be loaded and connected (isConnected() = true).
 *
 * Returns empty string when the agent is unavailable or not yet connected —
 * this is expected on cold starts. Do not call from prerenderable layouts.
 */
export function getBrowserAgentScriptSafe(): string {
  return getBrowserTimingHeaderSafe();
}

/**
 * Returns diagnostic state for the NR browser script delivery.
 * Used only for server-side diagnostic logging — never exposed to the client.
 */
export function getNrBrowserDiagnostics(): {
  agentLoaded: boolean;
  agentConnected: boolean;
  hasActiveTransaction: boolean;
  hasApplicationId: boolean;
} {
  const nr = tryGetNewRelic();
  const agentLoaded = nr !== null;
  const agentConnected = agentLoaded
    ? Boolean(nr.agent?.collector?.isConnected())
    : false;
  const hasActiveTransaction = agentLoaded
    ? Boolean(nr.agent?.getTransaction?.())
    : false;
  const hasApplicationId = agentLoaded
    ? Boolean(nr.agent?.config?.application_id)
    : false;

  return {
    agentLoaded,
    agentConnected,
    hasActiveTransaction,
    hasApplicationId,
  };
}
