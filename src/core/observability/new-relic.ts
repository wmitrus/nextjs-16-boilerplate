import 'server-only';

import fs from 'node:fs';
import path from 'node:path';

export type ContainerExecutionContext =
  | 'rsc'
  | 'server_action'
  | 'route_handler';

interface NewRelicAgentCollector {
  isConnected(): boolean;
}

interface NewRelicAgent {
  collector: NewRelicAgentCollector;
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

function stripOptionalScriptWrapper(snippet: string): string {
  const trimmedSnippet = snippet.trim();

  if (!/^<script\b/i.test(trimmedSnippet)) {
    return trimmedSnippet;
  }

  const startTagEndIndex = trimmedSnippet.indexOf('>');
  const lowerCasedSnippet = trimmedSnippet.toLowerCase();
  const endTagStartIndex = lowerCasedSnippet.lastIndexOf('</script>');

  if (
    startTagEndIndex === -1 ||
    endTagStartIndex === -1 ||
    endTagStartIndex <= startTagEndIndex
  ) {
    return trimmedSnippet;
  }

  return trimmedSnippet.slice(startTagEndIndex + 1, endTagStartIndex).trim();
}

function readRawSnippetFromEnvFiles(): string {
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const envLocalContent = fs.readFileSync(envLocalPath, 'utf8');
    const envLocalLine = envLocalContent
      .split(/\r?\n/u)
      .find((line) => line.startsWith('NEW_RELIC_BROWSER_SNIPPET='));

    if (envLocalLine) {
      return envLocalLine.slice('NEW_RELIC_BROWSER_SNIPPET='.length).trim();
    }
  }

  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLine = envContent
      .split(/\r?\n/u)
      .find((line) => line.startsWith('NEW_RELIC_BROWSER_SNIPPET='));

    if (envLine) {
      return envLine.slice('NEW_RELIC_BROWSER_SNIPPET='.length).trim();
    }
  }

  return '';
}

export function resolveBrowserSnippetSource(options: {
  base64Snippet?: string;
  rawSnippet?: string;
  rawEnvFileSnippet?: string;
}): string {
  const trimmedBase64Snippet = options.base64Snippet?.trim() ?? '';

  if (trimmedBase64Snippet) {
    const normalizedBase64Snippet = trimmedBase64Snippet.replace(/\s+/gu, '');
    const looksLikeBase64 =
      normalizedBase64Snippet.length > 0 &&
      normalizedBase64Snippet.length % 4 === 0 &&
      /^[A-Za-z0-9+/=]+$/u.test(normalizedBase64Snippet);

    if (looksLikeBase64) {
      return Buffer.from(normalizedBase64Snippet, 'base64')
        .toString('utf8')
        .trim();
    }

    return trimmedBase64Snippet;
  }

  const trimmedRawSnippet = options.rawSnippet?.trim() ?? '';
  const trimmedRawEnvFileSnippet = options.rawEnvFileSnippet?.trim() ?? '';

  if (
    trimmedRawSnippet &&
    trimmedRawEnvFileSnippet.length > trimmedRawSnippet.length &&
    trimmedRawEnvFileSnippet.startsWith(trimmedRawSnippet)
  ) {
    return trimmedRawEnvFileSnippet;
  }

  return trimmedRawSnippet;
}

function tryGetNewRelic(): NewRelicApi | null {
  if (_newrelic !== undefined) return _newrelic;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _newrelic = require('newrelic') as NewRelicApi;
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
 * If you need browser monitoring in a layout, use getBrowserSnippetSafe()
 * instead, which reads from an env var and never calls the NR API.
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
 * Returns the browser script to serve from a request-time Node route.
 *
 * Prefer the runtime-generated APM loader because it avoids shipping the full
 * browser snippet through deployment env vars. Fall back to the env-backed
 * snippet only for local/dev compatibility or when the agent is unavailable.
 */
export function resolveBrowserAgentScriptSource(options: {
  agentSnippet?: string;
  base64Snippet?: string;
  rawSnippet?: string;
  rawEnvFileSnippet?: string;
}): string {
  const trimmedAgentSnippet = stripOptionalScriptWrapper(
    options.agentSnippet?.trim() ?? '',
  );

  if (trimmedAgentSnippet) {
    return trimmedAgentSnippet;
  }

  return stripOptionalScriptWrapper(
    resolveBrowserSnippetSource({
      base64Snippet: options.base64Snippet,
      rawSnippet: options.rawSnippet,
      rawEnvFileSnippet: options.rawEnvFileSnippet,
    }),
  );
}

/**
 * Returns the NR Browser SPA snippet for injection into the root layout.
 *
 * Uses NEW_RELIC_BROWSER_SNIPPET_BASE64 when present, otherwise falls back to
 * NEW_RELIC_BROWSER_SNIPPET. When local dotenv parsing truncates the raw
 * snippet at `#`, this helper recovers the full raw line from `.env.local` or
 * `.env`. Returns empty string when no snippet is configured — does NOT fall
 * back to getBrowserTimingHeaderSafe() to avoid the Next.js 16 prerender
 * Date.now() constraint.
 */
export function getBrowserSnippetSafe(): string {
  return resolveBrowserAgentScriptSource({
    base64Snippet: process.env.NEW_RELIC_BROWSER_SNIPPET_BASE64,
    rawSnippet: process.env.NEW_RELIC_BROWSER_SNIPPET,
    rawEnvFileSnippet: readRawSnippetFromEnvFiles(),
  });
}

/**
 * Request-time loader source for the public browser JS route.
 *
 * Safe in Node route handlers because it executes at request time instead of
 * during layout prerender. Do not call this from prerenderable layouts.
 */
export function getBrowserAgentScriptSafe(): string {
  return resolveBrowserAgentScriptSource({
    agentSnippet: getBrowserTimingHeaderSafe(),
    base64Snippet: process.env.NEW_RELIC_BROWSER_SNIPPET_BASE64,
    rawSnippet: process.env.NEW_RELIC_BROWSER_SNIPPET,
    rawEnvFileSnippet: readRawSnippetFromEnvFiles(),
  });
}
