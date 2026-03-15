import { createDb } from '@/core/db/create-db';
import { resolvePglitePath } from '@/core/db/drivers/create-pglite';
import type { DbConfig, DbRuntime } from '@/core/db/types';
import { resolveServerLogger } from '@/core/logger/di';

import { getRuntimeDiagnosticState } from '@/shared/lib/observability/runtime-diagnostic-state';

interface ProcessInfrastructure {
  dbRuntime: DbRuntime;
}

interface InfrastructureConfig {
  db: DbConfig;
}

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'db',
  module: 'runtime-infrastructure',
});

// Process scope contract:
// - dbRuntime is initialized once per process
// - shared across request containers
// - reset only via closeInfrastructure() (or process shutdown hooks)
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
  // Idempotent process-scope initialization.
  registerShutdownHooks();

  const diagnostics = getRuntimeDiagnosticState();
  const storagePath =
    config.db.driver === 'pglite'
      ? resolvePglitePath(config.db.url)
      : undefined;

  if (cachedInfrastructure) {
    diagnostics.infrastructureReuses += 1;
    logger.debug(
      {
        event: 'db:runtime:infrastructure_reuse',
        provider: config.db.provider,
        driver: config.db.driver,
        storagePath,
        reuseCount: diagnostics.infrastructureReuses,
      },
      'Reusing cached process-scoped infrastructure',
    );

    if (config.db.driver === 'pglite') {
      logger.debug(
        {
          event: 'db:pglite:init_reuse',
          storagePath,
          infrastructureReuses: diagnostics.infrastructureReuses,
        },
        'Reusing existing PGlite-backed infrastructure',
      );
    }

    return cachedInfrastructure;
  }

  diagnostics.infrastructureInitializations += 1;
  const moduleReloadSuspected = diagnostics.infrastructureInitializations > 1;

  logger.info(
    {
      event: 'db:runtime:infrastructure_init_start',
      provider: config.db.provider,
      driver: config.db.driver,
      storagePath,
      infrastructureInitCount: diagnostics.infrastructureInitializations,
      moduleReloadSuspected,
    },
    'Initializing process-scoped infrastructure',
  );

  let dbRuntime: DbRuntime;
  try {
    dbRuntime = createDb(config.db);
  } catch (err) {
    logger.error(
      {
        event: 'db:runtime:infrastructure_init_failure',
        provider: config.db.provider,
        driver: config.db.driver,
        storagePath,
        infrastructureInitCount: diagnostics.infrastructureInitializations,
        moduleReloadSuspected,
        err,
      },
      'Process-scoped infrastructure initialization failed',
    );
    throw err;
  }

  cachedInfrastructure = {
    dbRuntime,
  };

  logger.info(
    {
      event: 'db:runtime:infrastructure_init_complete',
      provider: config.db.provider,
      driver: config.db.driver,
      storagePath,
      infrastructureInitCount: diagnostics.infrastructureInitializations,
      moduleReloadSuspected,
    },
    'Process-scoped infrastructure initialized',
  );

  return cachedInfrastructure;
}

export async function closeInfrastructure(): Promise<void> {
  // Explicit reset point for tests and graceful shutdown paths.
  const activeInfrastructure = cachedInfrastructure;
  cachedInfrastructure = null;

  await activeInfrastructure?.dbRuntime.close?.();
}
