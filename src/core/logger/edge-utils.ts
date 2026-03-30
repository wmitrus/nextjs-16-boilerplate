import type { Level, LogEvent } from 'pino';

import { env } from '@/core/env';

import { buildClientLogPayload } from './client-transport';
import { postClientLogPayload } from './ingest-transport';

/**
 * Edge-safe forwarding to the app ingest endpoint.
 */
export function forwardEdgeLogEvent(level: Level, logEvent: LogEvent): void {
  if (!env.LOGFLARE_EDGE_ENABLED || !env.NEXT_PUBLIC_APP_URL) {
    return;
  }

  const payload = buildClientLogPayload({
    level,
    logEvent,
    source: 'edge',
    defaultMessage: 'edge log',
  });

  // Prevent recursive ingest loops when middleware logs the ingest endpoint
  // itself and would otherwise forward `/api/logs` activity back into `/api/logs`.
  if (payload.context.path === '/api/logs') {
    return;
  }

  const secret = env.LOG_INGEST_SECRET;

  postClientLogPayload(payload, {
    endpoint: `${env.NEXT_PUBLIC_APP_URL}/api/logs`,
    headers: secret ? { 'x-log-ingest-secret': secret } : undefined,
  });
}
