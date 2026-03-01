import { Container } from '@/core/container';
import { env } from '@/core/env';

import type { EdgeAuthModuleConfig } from '@/modules/auth/edge';
import { createEdgeAuthModule } from '@/modules/auth/edge';

export interface EdgeAppConfig {
  auth: EdgeAuthModuleConfig;
}

export function createEdgeRequestContainer(config: EdgeAppConfig): Container {
  const container = new Container();
  container.registerModule(createEdgeAuthModule(config.auth));

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
