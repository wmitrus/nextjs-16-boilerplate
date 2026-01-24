import { type Logger } from 'pino';

import { browserLogger } from './browser';
import { edgeLogger } from './edge';
import { serverLogger } from './server';

/**
 * Dynamically selects the appropriate logger based on the execution environment.
 * We use static imports but ensure that each logger implementation is "safe"
 * to be evaluated in any environment (e.g. server-side code doesn't access
 * server-only env vars when evaluated in the browser).
 */
let logger: Logger;

if (typeof window !== 'undefined') {
  // Browser environment
  logger = browserLogger;
} else if (process.env.NEXT_RUNTIME === 'edge') {
  // Edge runtime
  logger = edgeLogger;
} else {
  // Node.js server environment
  logger = serverLogger;
}

export { logger };
export default logger;
