import { describe, expect, it } from 'vitest';

import { Container } from '@/core/container';
import { AUTH } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';

import { createEdgeAuthModule } from './edge';

describe('createEdgeAuthModule', () => {
  it('registers the AuthJS identity source placeholder', async () => {
    const container = new Container();
    const authModule = createEdgeAuthModule({ authProvider: 'authjs' });

    authModule.register(container);
    const identitySource = container.resolve<RequestIdentitySource>(
      AUTH.IDENTITY_SOURCE,
    );

    await expect(identitySource.get()).resolves.toEqual({});
  });

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

  it('throws for unsupported providers', () => {
    const container = new Container();
    const authModule = createEdgeAuthModule({
      authProvider: 'unknown' as never,
    });

    expect(() => authModule.register(container)).toThrow(
      '[edgeAuthModule] Unknown AUTH_PROVIDER: unknown',
    );
  });
});
