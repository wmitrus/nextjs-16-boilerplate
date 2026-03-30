import { Container } from '@/core/container';
import { LOGGER } from '@/core/contracts';
import type { AppLogger } from '@/core/contracts/logger';

import { getEdgeLogger } from './edge';

const edgeLoggerContainer = new Container();

export function resolveEdgeLogger(): AppLogger {
  // Edge-only DI entrypoint.
  // Keep middleware and edge helpers on this resolver to avoid importing
  // mixed runtime logger DI (which can pull node-only branches into bundles).
  try {
    return edgeLoggerContainer.resolve<AppLogger>(LOGGER.EDGE);
  } catch {
    const logger = getEdgeLogger() as unknown as AppLogger;
    edgeLoggerContainer.register<AppLogger>(LOGGER.EDGE, logger);
    return logger;
  }
}
