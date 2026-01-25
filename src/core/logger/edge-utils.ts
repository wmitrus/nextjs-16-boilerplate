import type { Level, LogEvent } from 'pino';

import { env } from '@/core/env';

import { buildClientLogPayload } from './client-transport';

/**
 * Edge-safe transport that forwards logs to the app ingest endpoint.
 */
export function createLogflareEdgeTransport() {
  const baseUrl = env.NEXT_PUBLIC_APP_URL;

  return {
    transmit: {
      level: env.LOG_LEVEL,
      send: (level: Level, logEvent: LogEvent) => {
        if (!baseUrl) {
          return;
        }

        const payload = buildClientLogPayload({
          level,
          logEvent,
          source: 'edge',
          defaultMessage: 'edge log',
        });

        const secret = env.LOG_INGEST_SECRET;
        const headers = secret ? { 'x-log-ingest-secret': secret } : undefined;

        void fetch(`${baseUrl}/api/logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(headers ?? {}),
          },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      },
    },
  };
}
