import { createDb } from '@/core/db/create-db';
import type { DbConfig, DbRuntime } from '@/core/db/types';

interface ProcessInfrastructure {
  dbRuntime: DbRuntime;
}

interface InfrastructureConfig {
  db: DbConfig;
}

let cachedInfrastructure: ProcessInfrastructure | null = null;

export function getInfrastructure(
  config: InfrastructureConfig,
): ProcessInfrastructure {
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
  if (!cachedInfrastructure) {
    return;
  }

  await cachedInfrastructure.dbRuntime.close?.();
  cachedInfrastructure = null;
}
