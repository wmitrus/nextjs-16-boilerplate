import { getBrowserLogger } from './browser';

export function getLogger() {
  return getBrowserLogger();
}

export const logger = getLogger();

export default logger;
