import { Container } from '@/core/container';
import { env } from '@/core/env';

import { createAuthModule } from '@/modules/auth';
import type { AuthModuleConfig } from '@/modules/auth';

export interface EdgeAppConfig {
  auth: AuthModuleConfig;
}

export function createEdgeRequestContainer(config: EdgeAppConfig): Container {
  const container = new Container();
  container.registerModule(createAuthModule(config.auth));

  return container;
}

function buildEdgeConfig(): EdgeAppConfig {
  return {
    auth: {
      authProvider: env.AUTH_PROVIDER,
    },
  };
}

export function getEdgeContainer(): Container {
  return createEdgeRequestContainer(buildEdgeConfig());
}
