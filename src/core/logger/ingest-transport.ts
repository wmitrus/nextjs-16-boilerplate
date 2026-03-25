import type { ClientLogPayload } from './client-transport';

export interface LogIngestOptions {
  endpoint: string;
  headers?: Record<string, string>;
  preferBeacon?: boolean;
}

/**
 * Fire-and-forget shipping for browser/edge log payloads.
 * Local console visibility remains the responsibility of the caller.
 */
export function postClientLogPayload(
  payload: ClientLogPayload,
  options: LogIngestOptions,
): void {
  try {
    const body = JSON.stringify(payload);

    if (
      options.preferBeacon &&
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(options.endpoint, blob);
      } catch {
        // sendBeacon failures are non-critical
      }
      return;
    }

    if (typeof fetch !== 'undefined') {
      void fetch(options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers ?? {}),
        },
        body,
        keepalive: true,
      }).catch(() => {
        // Ignore ingest failures in browser/edge runtimes.
      });
    }
  } catch {
    // Prevent transport failures from breaking application logic.
  }
}
