import type { Level, LogEvent } from 'pino';

import { env } from '@/core/env';

import { buildClientLogPayload } from './client-transport';
import { postClientLogPayload } from './ingest-transport';

/**
 * Browser-safe transport that forwards logs to the app ingest endpoint.
 * The server decides whether to ship to Logflare based on env flags.
 * All errors are caught and ignored to prevent logging from breaking the app.
 */
export function createLogflareBrowserTransport() {
  return {
    transmit: {
      level: env.NEXT_PUBLIC_LOG_LEVEL || 'info',
      send: (level: Level, logEvent: LogEvent) => {
        try {
          const payload = buildClientLogPayload({
            level,
            logEvent,
            source: 'browser',
            defaultMessage: 'browser log',
          });

          postClientLogPayload(payload, {
            endpoint: '/api/logs',
            preferBeacon: true,
          });
        } catch (_err) {
          // Prevent any errors in logging from breaking the app
        }
      },
    },
  };
}
