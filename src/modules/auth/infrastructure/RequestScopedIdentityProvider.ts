import type {
  Identity,
  IdentityProvider,
  RequestIdentitySource,
} from '@/core/contracts/identity';

import type {
  ExternalAuthProvider,
  ExternalIdentityMapper,
} from './ExternalIdentityMapper';

interface RequestScopedIdentityProviderOptions {
  mapper?: Pick<ExternalIdentityMapper, 'resolveOrCreateInternalUserId'>;
  provider?: ExternalAuthProvider;
}

export class RequestScopedIdentityProvider implements IdentityProvider {
  constructor(
    private readonly source: RequestIdentitySource,
    private readonly options: RequestScopedIdentityProviderOptions = {},
  ) {}

  async getCurrentIdentity(): Promise<Identity | null> {
    const { userId, email } = await this.source.get();

    if (!userId) {
      return null;
    }

    let internalUserId = userId;

    if (this.options.mapper && this.options.provider) {
      internalUserId = await this.options.mapper.resolveOrCreateInternalUserId({
        provider: this.options.provider,
        externalUserId: userId,
        email,
      });
    }

    return { id: internalUserId, email };
  }
}
