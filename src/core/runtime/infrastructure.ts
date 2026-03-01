import { createDb } from '@/core/db/create-db';
import { clearPgliteRuntimeCache } from '@/core/db/drivers/create-pglite';
import type { DbConfig, DbRuntime } from '@/core/db/types';

interface ProcessInfrastructure {
  dbRuntime: DbRuntime;
}

interface InfrastructureConfig {
  db: DbConfig;
}

let cachedInfrastructure: ProcessInfrastructure | null = null;
let shutdownHooksRegistered = false;

async function shutdownInfrastructure(): Promise<void> {
  await closeInfrastructure();
}

function registerShutdownHooks(): void {
  if (shutdownHooksRegistered) {
    return;
  }

  shutdownHooksRegistered = true;

  if (typeof process === 'undefined') {
    return;
  }

  process.once('beforeExit', () => {
    void shutdownInfrastructure();
  });

  process.once('SIGINT', () => {
    void shutdownInfrastructure().finally(() => {
      process.exit(0);
    });
  });

  process.once('SIGTERM', () => {
    void shutdownInfrastructure().finally(() => {
      process.exit(0);
    });
  });
}

export function getInfrastructure(
  config: InfrastructureConfig,
): ProcessInfrastructure {
  registerShutdownHooks();

  if (cachedInfrastructure) {
    return cachedInfrastructure;
  }

  const dbRuntime = createDb(config.db);

  cachedInfrastructure = {
    dbRuntime,
  };

  return cachedInfrastructure;
}

export async function closeInfrastructure(): Promise<void> {
  const activeInfrastructure = cachedInfrastructure;
  cachedInfrastructure = null;

  await activeInfrastructure?.dbRuntime.close?.();
  clearPgliteRuntimeCache();
}
