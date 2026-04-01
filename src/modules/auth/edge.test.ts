import { describe, expect, it } from 'vitest';

import { Container } from '@/core/container';
import { AUTH } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';

import { createEdgeAuthModule } from './edge';

describe('createEdgeAuthModule', () => {
  it('registers the Neon identity source placeholder for neon provider', () => {
    const container = new Container();
    const authModule = createEdgeAuthModule({ authProvider: 'neon' });

    authModule.register(container);
    const identitySource = container.resolve<RequestIdentitySource>(
      AUTH.IDENTITY_SOURCE,
    );

    expect(() => identitySource.get()).toThrow(
      '[authModule] AUTH_PROVIDER=neon is not yet implemented.',
    );
  });
});
