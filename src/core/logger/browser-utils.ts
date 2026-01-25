import type { Level, LogEvent } from 'pino';

import { env } from '@/core/env';

import { buildClientLogPayload } from './client-transport';

/**
 * Browser-safe transport that forwards logs to the app ingest endpoint.
 * The server decides whether to ship to Logflare based on env flags.
 */
export function createLogflareBrowserTransport() {
  return {
    transmit: {
      level: env.NEXT_PUBLIC_LOG_LEVEL || 'info',
      send: (level: Level, logEvent: LogEvent) => {
        const payload = buildClientLogPayload({
          level,
          logEvent,
          source: 'browser',
          defaultMessage: 'browser log',
        });

        const body = JSON.stringify(payload);

        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          const blob = new Blob([body], { type: 'application/json' });
          navigator.sendBeacon('/api/logs', blob);
          return;
        }

        if (typeof fetch !== 'undefined') {
          void fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
          });
        }
      },
    },
  };
}
