import { serverLogger } from './server';

/**
 * Edge logger implementation.
 * Currently uses the server logger configuration.
 * Can be optimized later for specific edge runtime constraints if needed.
 */
export const edgeLogger = serverLogger;
