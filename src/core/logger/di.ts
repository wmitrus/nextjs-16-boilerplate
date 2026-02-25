import { container } from '@/core/container';
import { LOGGER } from '@/core/contracts';
import type { AppLogger } from '@/core/contracts/logger';

import { getEdgeLogger } from './edge';
import { getServerLogger } from './server';

export function resolveServerLogger(): AppLogger {
  try {
    return container.resolve<AppLogger>(LOGGER.SERVER);
  } catch {
    const logger = getServerLogger() as unknown as AppLogger;
    container.register<AppLogger>(LOGGER.SERVER, logger);
    return logger;
  }
}

export function resolveEdgeLogger(): AppLogger {
  try {
    return container.resolve<AppLogger>(LOGGER.EDGE);
  } catch {
    const logger = getEdgeLogger() as unknown as AppLogger;
    container.register<AppLogger>(LOGGER.EDGE, logger);
    return logger;
  }
}
