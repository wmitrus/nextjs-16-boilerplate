import { Container } from '@/core/container';

import type { EdgeAuthModuleConfig } from '@/modules/auth/edge';
import { createEdgeAuthModule } from '@/modules/auth/edge';

export interface EdgeAppConfig {
  auth: EdgeAuthModuleConfig;
}

export function createEdgeRequestContainer(config: EdgeAppConfig): Container {
  // Edge request scope contract:
  // - fresh container per invocation
  // - edge-safe auth-only module graph
  // - no DB runtime / node-only services in this composition root
  const container = new Container();
  container.registerModule(createEdgeAuthModule(config.auth));

  return container;
}
