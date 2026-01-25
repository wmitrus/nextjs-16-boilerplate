import { type Logger } from 'pino';

import { getBrowserLogger } from './browser';
import { getEdgeLogger } from './edge';
import { getServerLogger } from './server';

/**
 * Dynamically selects the appropriate logger based on the execution environment.
 * We use static imports but ensure that each logger implementation is "safe"
 * to be evaluated in any environment (e.g. server-side code doesn't access
 * server-only env vars when evaluated in the browser).
 */
export function getLogger(): Logger {
  if (typeof window !== 'undefined') {
    return getBrowserLogger();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    return getEdgeLogger();
  }

  return getServerLogger();
}

const logger = getLogger();

export { logger };
export default logger;
