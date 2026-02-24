import type { Level, LogEvent } from 'pino';

import { env } from '@/core/env';

import { buildClientLogPayload } from './client-transport';

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

          const body = JSON.stringify(payload);

          if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            try {
              const blob = new Blob([body], { type: 'application/json' });
              navigator.sendBeacon('/api/logs', blob);
            } catch (_err) {
              // sendBeacon errors are non-critical
            }
            return;
          }

          if (typeof fetch !== 'undefined') {
            void fetch('/api/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
              keepalive: true,
            }).catch(() => {
              // Silently ignore logging failures in the browser
            });
          }
        } catch (_err) {
          // Prevent any errors in logging from breaking the app
        }
      },
    },
  };
}
