import { Container } from '@/core/container';
import { LOGGER } from '@/core/contracts';
import type { AppLogger } from '@/core/contracts/logger';

import { getEdgeLogger } from './edge';
import { getServerLogger } from './server';

const loggerContainer = new Container();

export function resolveServerLogger(): AppLogger {
  try {
    return loggerContainer.resolve<AppLogger>(LOGGER.SERVER);
  } catch {
    const logger = getServerLogger() as unknown as AppLogger;
    loggerContainer.register<AppLogger>(LOGGER.SERVER, logger);
    return logger;
  }
}

export function resolveEdgeLogger(): AppLogger {
  try {
    return loggerContainer.resolve<AppLogger>(LOGGER.EDGE);
  } catch {
    const logger = getEdgeLogger() as unknown as AppLogger;
    loggerContainer.register<AppLogger>(LOGGER.EDGE, logger);
    return logger;
  }
}
