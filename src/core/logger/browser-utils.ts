import { env } from '@/core/env';

/**
 * Browser-safe transport placeholder.
 *
 * NOTE: This intentionally avoids Node-only dependencies so it can be bundled
 * in client components. If a real Logflare browser integration is needed,
 * implement it here using browser-safe APIs (fetch/sendBeacon) and public envs.
 */
export function createLogflareBrowserTransport() {
  return {
    transmit: {
      level: env.NEXT_PUBLIC_LOG_LEVEL || 'info',
      send: () => {
        // No-op browser transport to keep client bundle safe.
      },
    },
  };
}
