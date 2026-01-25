import { type Logger } from 'pino';

/**
 * Dynamically selects the appropriate logger based on the execution environment.
 * We use static imports but ensure that each logger implementation is "safe"
 * to be evaluated in any environment (e.g. server-side code doesn't access
 * server-only env vars when evaluated in the browser).
 */
let logger: Logger;

if (typeof window !== 'undefined') {
  // Browser environment
  const browserModule = await import('./browser');
  logger = browserModule.browserLogger;
} else if (process.env.NEXT_RUNTIME === 'edge') {
  // Edge runtime
  const edgeModule = await import('./edge');
  logger = edgeModule.edgeLogger;
} else {
  // Node.js server environment
  const serverModule = await import('./server');
  logger = serverModule.serverLogger;
}

export { logger };
export default logger;
